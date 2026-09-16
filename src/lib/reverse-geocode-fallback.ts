/*
 * Free, provider-neutral reverse-geocode FALLBACK for the checkout address flow.
 *
 * WHY this module exists: Google Geocoding is the FIRST choice, but it can be unavailable —
 * billing never enabled, quota exhausted, `REQUEST_DENIED`, or the geocoding library failing to
 * load — and the customer was then left with a perfectly good pin and no address at all. This
 * module asks a FREE, openly-licensed provider the same question, ONCE per confirmed location,
 * from the SERVER only.
 *
 * Rules implemented here:
 *   1. The browser never talks to the provider. It calls our own route, which sends ONLY the pin
 *      — no name, no phone, no email, no cart, no order, no cookie, no key.
 *   2. ONE bounded attempt per confirmation: no retry loop, no request per pan/zoom, a short
 *      timeout with an `AbortController`, and promise sharing for concurrent identical pins.
 *   3. A short-term cache keyed on the pin rounded to ~1 m, so confirming the same spot twice is
 *      free. An `unavailable` answer is NEVER cached — it is transient by definition.
 *   4. Bounded parsing: a small JSON document only, every field normalized, nothing invented.
 *   5. The provider's raw payload never leaves this module: callers get the same internal,
 *      provider-neutral address shape the Google path produces.
 *
 * Biteship stays authoritative: nothing here can produce a `destinationAreaId`. The normalized
 * address only feeds the existing Biteship area matcher and the manual kecamatan/kelurahan picker.
 *
 * Dependency-free on purpose: importable by the checkout bundle, by the route, and by plain
 * `node --test` (no DOM, no env, no Next.js runtime, no relative imports).
 */

/** OpenStreetMap's Nominatim reverse endpoint (free; its usage policy applies). */
export const REVERSE_FALLBACK_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
/**
 * The free provider's usage policy REQUIRES an identifying `User-Agent` with a real contact
 * point and forbids empty, generic or browser-like agents.
 */
export const REVERSE_FALLBACK_USER_AGENT = "AFA-STORE-checkout/1.0 (+https://afastore.online)";
/** Indonesian address names, matching the Google reverse language ("id"). */
export const REVERSE_FALLBACK_ACCEPT_LANGUAGE = "id";
/** One bounded attempt: a slow provider must never hold the checkout open. */
export const REVERSE_FALLBACK_TIMEOUT_MS = 4000;
/** Guard against parsing something that is not a small JSON document (e.g. an HTML error page). */
export const REVERSE_FALLBACK_MAX_RESPONSE_CHARS = 65536;
/** Short-term cache TTL: a repeated confirmation for the same pin never asks again. */
export const REVERSE_FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;
/** Bounded cache: a page that walks the map cannot grow server memory without limit. */
export const REVERSE_FALLBACK_CACHE_MAX_ENTRIES = 256;
/** Cache key precision: 5 decimals ≈ 1 m, so tiny pin jitter never multiplies provider calls. */
export const REVERSE_FALLBACK_COORDINATE_PRECISION = 5;

/* Coordinate bounds mirror src/lib/coordinates.ts (kept local to stay import-free). */
const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;

/** A validated pin: finite, in range, full float precision preserved. */
export type FallbackCoordinates = { latitude: number; longitude: number };

/**
 * The provider-neutral address this fallback resolves. The field names are OURS, so a provider
 * swap (or a change in its response) can never reach the checkout UI.
 */
export type FallbackAddress = {
    formattedAddress: string;
    latitude: number;
    longitude: number;
    street: string | null;
    houseNumber: string | null;
    village: string | null;
    district: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string | null;
};

/**
 * Structurally identical to `LocationSearchResult` (src/lib/geocoding-normalize.ts). Declared
 * structurally on purpose: this module stays import-free, and its optional fields still accept
 * the concrete values both providers produce.
 */
export type FallbackSearchResult = {
    displayName: string;
    latitude: number;
    longitude: number;
    address: {
        road?: string | null;
        houseNumber?: string | null;
        village?: string | null;
        district?: string | null;
        city?: string | null;
        regency?: string | null;
        province?: string | null;
        postcode?: string | null;
    };
};

/**
 * `ok`          an address was resolved (Google was unavailable or had nothing here).
 * `no_address`  the provider answered honestly: this exact point has no address.
 * `unavailable` the provider could not be reached / answered with an error. Transient.
 */
export type FallbackReverseStatus = "ok" | "no_address" | "unavailable";

export type FallbackReverseResult =
    | { status: "ok"; address: FallbackAddress; cached: boolean }
    | { status: "no_address" }
    | { status: "unavailable" };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as UnknownRecord;
}

/** Trimmed non-empty string, or null. */
function text(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/** First non-empty text among the candidates (argument order = priority). */
function firstText(...values: unknown[]): string | null {
    for (const value of values) {
        const found = text(value);
        if (found) return found;
    }
    return null;
}

/** A finite number inside the bounds for its axis, else null (a pin is never guessed). */
function coordinate(value: unknown, min: number, max: number): number | null {
    if (typeof value === "number") return Number.isFinite(value) && value >= min && value <= max ? value : null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
    }
    return null;
}

/* ==========================================================================
 * Validation + request building
 * ========================================================================== */

/**
 * Validate a pin BEFORE anything leaves the app. Strings are accepted (query parameters), but only
 * a finite number inside the bounds for its axis survives; everything else resolves to null, so the
 * route can answer 400 without ever talking to the provider.
 */
export function normalizeFallbackCoordinates(latitude: unknown, longitude: unknown): FallbackCoordinates | null {
    const lat = coordinate(latitude, LATITUDE_MIN, LATITUDE_MAX);
    const lng = coordinate(longitude, LONGITUDE_MIN, LONGITUDE_MAX);
    if (lat === null || lng === null) return null;
    return { latitude: lat, longitude: lng };
}

/**
 * The provider request URL: structured answer (`jsonv2` + `addressdetails`), full-precision pin,
 * and nothing else — no customer data is ever part of a provider request.
 */
export function buildFallbackReverseUrl(coordinates: FallbackCoordinates): string {
    const params = new URLSearchParams({
        format: "jsonv2",
        addressdetails: "1",
        lat: String(coordinates.latitude),
        lon: String(coordinates.longitude),
    });
    return `${REVERSE_FALLBACK_ENDPOINT}?${params.toString()}`;
}

/* ==========================================================================
 * Normalization — provider payload → OUR provider-neutral address
 * ========================================================================== */

/**
 * Indonesian administrative levels, in the wording the free provider uses. Its OSM data is
 * inconsistent about which key carries which level, so every internal level reads an ordered
 * candidate list instead of a single key — and the first non-empty one wins.
 */
const STREET_KEYS = ["road", "pedestrian", "residential", "footway"] as const;
const VILLAGE_KEYS = ["village", "suburb", "hamlet", "neighbourhood", "quarter"] as const;
/*
 * Kecamatan / kota: each internal level reads its own candidate keys, and NO key is shared by two
 * levels. Copying one provider key into two levels would make a single name look like two
 * independent agreements to the Biteship matcher — a false match is worse than no match.
 */
const DISTRICT_KEYS = ["city_district", "district", "subdistrict"] as const;
const CITY_KEYS = ["city", "town", "municipality", "county"] as const;
const PROVINCE_KEYS = ["state", "region", "province"] as const;

function pickFrom(address: UnknownRecord, keys: readonly string[]): string | null {
    return firstText(...keys.map((key) => address[key]));
}

/** De-duplicated, comma-joined label (never turns an empty address into "null"). */
function joinParts(parts: (string | null)[]): string {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const part of parts) {
        const value = text(part);
        if (!value) continue;
        const key = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (key.length === 0 || seen.has(key)) continue;
        seen.add(key);
        kept.push(value);
    }
    return kept.join(", ");
}

/** The provider's own error marker ("Unable to geocode") — an honest "no address here". */
function providerError(payload: unknown): string | null {
    return text(asRecord(payload)?.error);
}

/**
 * Normalize one provider payload into our address shape. Missing fields stay null (never "" and
 * never a neighbour's value), and the pin falls back to the REQUESTED coordinates — the point a
 * reverse lookup is asked about — so a payload without usable coordinates is still honest.
 */
export function normalizeFallbackReversePayload(payload: unknown, requested?: FallbackCoordinates | null): FallbackAddress | null {
    const record = asRecord(payload);
    if (!record || providerError(record)) return null;
    const address = asRecord(record.address) ?? {};

    const street = pickFrom(address, STREET_KEYS);
    const houseNumber = text(address.house_number);
    const village = pickFrom(address, VILLAGE_KEYS);
    const district = pickFrom(address, DISTRICT_KEYS);
    const city = pickFrom(address, CITY_KEYS);
    const province = pickFrom(address, PROVINCE_KEYS);
    const postalCode = text(address.postcode);
    const country = text(address.country);

    const formattedAddress =
        text(record.display_name) ??
        joinParts([street, houseNumber, village, district, city, province, postalCode, country]);
    if (!formattedAddress) return null;

    const latitude = coordinate(record.lat, LATITUDE_MIN, LATITUDE_MAX) ?? requested?.latitude;
    const longitude = coordinate(record.lon, LONGITUDE_MIN, LONGITUDE_MAX) ?? requested?.longitude;
    if (latitude === undefined || longitude === undefined) return null;

    return { formattedAddress, latitude, longitude, street, houseNumber, village, district, city, province, postalCode, country };
}

/* ==========================================================================
 * Bridge to the app's own address shape
 * ========================================================================== */

/** Map our fallback address onto the internal address shape the checkout matcher consumes. */
export function fallbackAddressToSearchResult(address: FallbackAddress): FallbackSearchResult {
    return {
        displayName: address.formattedAddress,
        latitude: address.latitude,
        longitude: address.longitude,
        address: {
            road: address.street ?? null,
            houseNumber: address.houseNumber ?? null,
            village: address.village ?? null,
            district: address.district ?? null,
            city: address.city ?? null,
            province: address.province ?? null,
            postcode: address.postalCode ?? null,
        },
    };
}

function readRouteAddress(value: unknown): FallbackAddress | null {
    const record = asRecord(value);
    if (!record) return null;
    const formattedAddress = text(record.formattedAddress);
    const latitude = coordinate(record.latitude, LATITUDE_MIN, LATITUDE_MAX);
    const longitude = coordinate(record.longitude, LONGITUDE_MIN, LONGITUDE_MAX);
    if (!formattedAddress || latitude === null || longitude === null) return null;
    return {
        formattedAddress,
        latitude,
        longitude,
        street: text(record.street),
        houseNumber: text(record.houseNumber),
        village: text(record.village),
        district: text(record.district),
        city: text(record.city),
        province: text(record.province),
        postalCode: text(record.postalCode),
        country: text(record.country),
    };
}

/**
 * Read a response from OUR route (`/api/location/reverse-fallback`) into a fallback result. Only
 * our own contract is accepted: an unexpected body is `unavailable`, never a thrown error and
 * never a half-filled address.
 */
export function fallbackResultFromRoutePayload(payload: unknown): FallbackReverseResult {
    const record = asRecord(payload);
    if (!record) return { status: "unavailable" };
    const status = text(record.status);
    if (status === "no_address") return { status: "no_address" };
    if (status !== "ok") return { status: "unavailable" };
    const address = readRouteAddress(record.address);
    if (!address) return { status: "unavailable" };
    return { status: "ok", address, cached: record.cached === true };
}

/* ==========================================================================
 * Server-side cache + one bounded attempt
 * ========================================================================== */

/** Injected so tests never touch the network, the clock or the real timeout. */
export type FallbackReverseDependencies = {
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
};

type FallbackCacheEntry = { result: FallbackReverseResult; expiresAt: number };

/*
 * Process-local, bounded, short-lived. A repeated confirmation for the same pin is therefore free,
 * while a customer who walks the map cannot grow memory without limit. `unavailable` is never
 * stored: the next confirmation must be allowed to try again.
 */
const reverseCache = new Map<string, FallbackCacheEntry>();
/** Concurrent confirmations of the same pin share one attempt (never two provider calls). */
const reverseInflight = new Map<string, Promise<FallbackReverseResult>>();

/** Test seam: drop all cached and in-flight state. */
export function clearFallbackReverseCache(): void {
    reverseCache.clear();
    reverseInflight.clear();
}

/** Test seam: how many answers are currently remembered. */
export function fallbackReverseCacheSize(): number {
    return reverseCache.size;
}

/** Cache key: the pin rounded to ~1 m, so tiny jitter never becomes a second provider call. */
export function fallbackCacheKey(coordinates: FallbackCoordinates): string {
    const lat = coordinates.latitude.toFixed(REVERSE_FALLBACK_COORDINATE_PRECISION);
    const lng = coordinates.longitude.toFixed(REVERSE_FALLBACK_COORDINATE_PRECISION);
    return `${lat},${lng}`;
}

function withCachedFlag(result: FallbackReverseResult): FallbackReverseResult {
    return result.status === "ok" ? { status: "ok", address: result.address, cached: true } : result;
}

function rememberFallbackResult(key: string, result: FallbackReverseResult, timestamp: number): void {
    reverseCache.set(key, { result, expiresAt: timestamp + REVERSE_FALLBACK_CACHE_TTL_MS });
    while (reverseCache.size > REVERSE_FALLBACK_CACHE_MAX_ENTRIES) {
        const oldest = reverseCache.keys().next();
        if (oldest.done) break;
        reverseCache.delete(oldest.value);
    }
}

async function attemptFallbackReverse(
    coordinates: FallbackCoordinates,
    dependencies: FallbackReverseDependencies,
): Promise<FallbackReverseResult> {
    const doFetch = dependencies.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
    if (!doFetch) return { status: "unavailable" };

    const timeoutMs = dependencies.timeoutMs ?? REVERSE_FALLBACK_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await doFetch(buildFallbackReverseUrl(coordinates), {
            method: "GET",
            headers: {
                /* The free provider's policy requires this identifying header. */
                "User-Agent": REVERSE_FALLBACK_USER_AGENT,
                Accept: "application/json",
                "Accept-Language": REVERSE_FALLBACK_ACCEPT_LANGUAGE,
            },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!response.ok) return { status: "unavailable" };

        const body = await response.text();
        if (body.length === 0 || body.length > REVERSE_FALLBACK_MAX_RESPONSE_CHARS) {
            return { status: "unavailable" };
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch {
            return { status: "unavailable" };
        }

        /* An explicit provider error is the provider telling us there is no address here. */
        if (asRecord(parsed) && providerError(parsed)) return { status: "no_address" };

        const address = normalizeFallbackReversePayload(parsed, coordinates);
        return address ? { status: "ok", address, cached: false } : { status: "unavailable" };
    } catch {
        /* Timeout, abort, DNS/socket failure, malformed JSON: one honest "unavailable". */
        return { status: "unavailable" };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Resolve the address for a confirmed pin with ONE bounded provider attempt.
 *
 *  - a cached `ok`/`no_address` answer is returned immediately (marked `cached`);
 *  - an `unavailable` answer is never cached, so the next confirmation retries;
 *  - concurrent identical pins share a single attempt;
 *  - nothing here throws: every failure is the `unavailable` status.
 *
 * There is deliberately NO retry loop and no per-pan/zoom call — the customer's explicit
 * "use this location" is the only trigger.
 */
export async function resolveFallbackReverseAddress(
    latitude: unknown,
    longitude: unknown,
    dependencies: FallbackReverseDependencies = {},
): Promise<FallbackReverseResult> {
    const coordinates = normalizeFallbackCoordinates(latitude, longitude);
    if (!coordinates) return { status: "unavailable" };

    const now = dependencies.now ?? Date.now;
    const key = fallbackCacheKey(coordinates);

    const cached = reverseCache.get(key);
    if (cached) {
        if (cached.expiresAt > now()) return withCachedFlag(cached.result);
        reverseCache.delete(key);
    }

    const pending = reverseInflight.get(key);
    if (pending) return pending;

    const attempt = attemptFallbackReverse(coordinates, dependencies)
        .then((result) => {
            if (result.status !== "unavailable") rememberFallbackResult(key, result, now());
            return result;
        })
        .finally(() => {
            reverseInflight.delete(key);
        });

    reverseInflight.set(key, attempt);
    return attempt;
}

/* ==========================================================================
 * Browser side — OUR route only (never the provider directly)
 * ========================================================================== */

/** Same-origin route that performs the single provider call on the server. */
export const REVERSE_FALLBACK_ROUTE = "/api/location/reverse-fallback";

export type FallbackRouteRequestOptions = {
    /** The caller's controller: a newer confirmation cancels this request. */
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
};

/**
 * Ask OUR OWN route for the fallback address. Called from the browser after a confirmed
 * "GUNAKAN LOKASI INI" and for nothing else — never during pan, zoom, drag or touch.
 *
 * The route already bounds its own provider call; this second, identical bound exists purely so a
 * hanging connection cannot leave the checkout spinner turning forever. Aborting (newer
 * confirmation, unmount, timeout) yields `unavailable`, which the caller discards when stale.
 */
export async function requestFallbackReverseAddress(
    latitude: number,
    longitude: number,
    options: FallbackRouteRequestOptions = {},
): Promise<FallbackReverseResult> {
    const coordinates = normalizeFallbackCoordinates(latitude, longitude);
    if (!coordinates) return { status: "unavailable" };

    const doFetch = options.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
    if (!doFetch) return { status: "unavailable" };

    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener("abort", forwardAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REVERSE_FALLBACK_TIMEOUT_MS);

    try {
        const params = new URLSearchParams({
            lat: String(coordinates.latitude),
            lng: String(coordinates.longitude),
        });
        const response = await doFetch(`${REVERSE_FALLBACK_ROUTE}?${params.toString()}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!response.ok) return { status: "unavailable" };

        let payload: unknown;
        try {
            payload = (await response.json()) as unknown;
        } catch {
            return { status: "unavailable" };
        }
        return fallbackResultFromRoutePayload(payload);
    } catch {
        return { status: "unavailable" };
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", forwardAbort);
    }
}
