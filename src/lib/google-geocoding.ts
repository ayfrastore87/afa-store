/*
 * Pure Google → internal address normalization (Geocoding API + Places API "New").
 *
 * WHY: the checkout picker displays GOOGLE data, but the rest of checkout (and
 * Biteship) keeps consuming the same internal address shape as before. The UI is
 * never bound to Google's raw response, and a Google `place_id` is NEVER used as a
 * Biteship `destinationAreaId` — Biteship stays authoritative for area matching and
 * for shipping rates.
 *
 * Dependency-free on purpose: importable by the browser bundle AND by plain
 * `node --test` (no DOM, no env, no Next.js runtime). The reverse-geocode helper
 * takes the Maps API handle as an argument instead of reading a global, so it can be
 * exercised with a fake geocoder.
 */

/* Coordinate bounds mirror src/lib/coordinates.ts (kept local to stay import-free). */
const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;

export const GOOGLE_REVERSE_LANGUAGE = "id";
export const GOOGLE_REVERSE_REGION = "ID";

/** Field mask for Places API (New): exactly what the internal shape needs. */
export const GOOGLE_PLACE_FIELDS = ["formattedAddress", "addressComponents", "location", "displayName"] as const;

export type GoogleAddressComponentInput = {
    long_name?: string | null;
    short_name?: string | null;
    longText?: string | null;
    shortText?: string | null;
    types?: string[] | null;
};

export type NormalizedGoogleAddress = {
    formattedAddress: string;
    road: string | null;
    houseNumber: string | null;
    village: string | null;
    district: string | null;
    city: string | null;
    province: string | null;
    postcode: string | null;
    country: string | null;
    latitude: number;
    longitude: number;
};

/** Internal `LocationAddress`-compatible fields (see src/lib/geocoding-normalize.ts). */
export type NormalizedGoogleAddressFields = {
    road: string | null;
    houseNumber: string | null;
    village: string | null;
    district: string | null;
    city: string | null;
    regency: string | null;
    province: string | null;
    postcode: string | null;
    country: string | null;
};

export type NormalizedGoogleSearchResult = {
    displayName: string;
    latitude: number;
    longitude: number;
    address: NormalizedGoogleAddressFields;
};

export type GoogleReverseGeocodeRequest = {
    location: { lat: number; lng: number };
    language?: string | null;
    region?: string | null;
};
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as UnknownRecord;
}

/** Trimmed non-empty string, or null. `{ text }` wrappers are unwrapped. */
function text(value: unknown): string | null {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    const record = asRecord(value);
    if (record) return text(record.text) ?? text(record.longText) ?? text(record.name);
    return null;
}

/** First non-empty text among the candidates (argument order = priority). */
function firstText(...values: unknown[]): string | null {
    for (const value of values) {
        const found = text(value);
        if (found) return found;
    }
    return null;
}

function coordinate(value: unknown, min: number, max: number): number | null {
    let numeric: number;
    if (typeof value === "number") numeric = value;
    else if (typeof value === "string" && value.trim() !== "") numeric = Number(value);
    else return null;
    if (!Number.isFinite(numeric)) return null;
    if (numeric < min || numeric > max) return null;
    return numeric;
}

/** Accepts Google `LatLng`, `{ lat, lng }` literals and string coordinates. */
function readLatLng(value: unknown): { latitude: number; longitude: number } | null {
    const record = asRecord(value);
    if (!record) return null;
    const rawLat = typeof record.lat === "function" ? (record.lat as () => number)() : record.lat;
    const rawLng = typeof record.lng === "function" ? (record.lng as () => number)() : record.lng;
    const latitude = coordinate(rawLat, LATITUDE_MIN, LATITUDE_MAX);
    const longitude = coordinate(rawLng, LONGITUDE_MIN, LONGITUDE_MAX);
    if (latitude === null || longitude === null) return null;
    return { latitude, longitude };
}

/** Normalize the Geocoding (`long_name`/`short_name`) and Places New (`longText`) shapes. */
export function normalizeGoogleComponents(input: unknown): GoogleAddressComponentInput[] {
    if (!Array.isArray(input)) return [];
    const components: GoogleAddressComponentInput[] = [];
    for (const entry of input) {
        const record = asRecord(entry);
        if (!record) continue;
        const rawTypes = record.types;
        const types: string[] = Array.isArray(rawTypes)
            ? rawTypes.filter((type): type is string => typeof type === "string")
            : [];
        components.push({
            long_name: text(record.long_name) ?? text(record.longText),
            short_name: text(record.short_name) ?? text(record.shortText),
            types,
        });
    }
    return components;
}

/** Strongest-available pick for one field: candidate order encodes confidence. */
type ComponentPick = { value: string; rank: number } | null;

function componentValue(components: GoogleAddressComponentInput[], types: string[]): string | null {
    for (const type of types) {
        const match = components.find((component) => (component.types ?? []).includes(type));
        const value = text(match?.long_name) ?? text(match?.short_name);
        if (value) return value;
    }
    return null;
}

function pickComponent(components: GoogleAddressComponentInput[], candidates: string[][]): ComponentPick {
    for (let rank = 0; rank < candidates.length; rank += 1) {
        const types = candidates[rank];
        if (!types || types.length === 0) continue;
        const value = componentValue(components, types);
        if (value) return { value, rank };
    }
    return null;
}

/**
 * Google's Indonesian address levels, weakest last. Nothing is ever invented: a level
 * Google does not report stays null so Biteship area matching can decide.
 *
 * The numbered `sublocality_level_*` entries are appended AFTER the previously supported
 * candidates on purpose, so an address that already resolved keeps the exact same value while an
 * answer that only carries a finer/lower sublocality level (Google reports different levels in
 * different Indonesian regions) can still be filled in. A `sublocality_level_1` is the
 * kecamatan-level hint, so it stays available for `district` as well.
 */
const ROAD_CANDIDATES = [["route"], ["street_address"]];
const HOUSE_NUMBER_CANDIDATES = [["street_number"], ["premise"], ["subpremise"]];
const VILLAGE_CANDIDATES = [
    ["administrative_area_level_4"],
    ["neighborhood"],
    ["sublocality_level_4"],
    ["sublocality_level_3"],
    ["sublocality_level_2"],
    ["sublocality_level_1"],
    ["sublocality"],
];
const DISTRICT_CANDIDATES = [
    ["administrative_area_level_3"],
    ["sublocality_level_1"],
    ["sublocality"],
    ["neighborhood"],
];
const CITY_CANDIDATES = [["administrative_area_level_2"], ["locality"], ["postal_town"]];
const PROVINCE_CANDIDATES = [["administrative_area_level_1"]];

function normalizedKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Google sometimes repeats one place at several levels (e.g. "Kecamatan X" as both
 * `administrative_area_level_3` and `administrative_area_level_4`). Keeping the value
 * in both slots would make the area matcher search the same name twice and could make
 * a kecamatan look like a kelurahan, so the weaker duplicate is dropped — never
 * rewritten, never invented.
 */
function dropDuplicateLevels(picks: {
    village: ComponentPick;
    district: ComponentPick;
    city: ComponentPick;
}): void {
    const comparable: [keyof typeof picks, keyof typeof picks][] = [
        ["city", "district"],
        ["city", "village"],
        ["district", "village"],
    ];
    for (const [coarseKey, fineKey] of comparable) {
        const coarse = picks[coarseKey];
        const fine = picks[fineKey];
        if (!coarse || !fine) continue;
        if (normalizedKey(coarse.value) !== normalizedKey(fine.value)) continue;
        // Tie → keep the coarser administrative level (city > district > village).
        if (fine.rank < coarse.rank) picks[coarseKey] = null;
        else picks[fineKey] = null;
    }
}


/** Structural subset of the Maps JS API that the reverse geocoder needs. */
export type GoogleGeocoderApiLike = {
    maps: { Geocoder: new () => { geocode: (request: GoogleReverseGeocodeRequest) => Promise<unknown> } };
};

/** De-duplicated, comma-joined label (never turns an empty address into "null"). */
function joinParts(parts: (string | null)[]): string {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const part of parts) {
        const value = text(part);
        if (!value) continue;
        const key = normalizedKey(value);
        if (key.length === 0 || seen.has(key)) continue;
        seen.add(key);
        kept.push(value);
    }
    return kept.join(", ");
}

/**
 * Map a Google component list onto the internal address shape.
 * Returns null when the coordinates are missing/out of range — a pin is never faked.
 */
export function normalizeGoogleAddress(input: {
    formattedAddress?: unknown;
    components?: unknown;
    latitude?: unknown;
    longitude?: unknown;
}): NormalizedGoogleAddress | null {
    const latitude = coordinate(input.latitude, LATITUDE_MIN, LATITUDE_MAX);
    const longitude = coordinate(input.longitude, LONGITUDE_MIN, LONGITUDE_MAX);
    if (latitude === null || longitude === null) return null;

    const components = normalizeGoogleComponents(input.components);
    const picks = {
        village: pickComponent(components, VILLAGE_CANDIDATES),
        district: pickComponent(components, DISTRICT_CANDIDATES),
        city: pickComponent(components, CITY_CANDIDATES),
    };
    dropDuplicateLevels(picks);

    return {
        formattedAddress: text(input.formattedAddress) ?? "",
        road: pickComponent(components, ROAD_CANDIDATES)?.value ?? null,
        houseNumber: pickComponent(components, HOUSE_NUMBER_CANDIDATES)?.value ?? null,
        village: picks.village?.value ?? null,
        district: picks.district?.value ?? null,
        city: picks.city?.value ?? null,
        province: pickComponent(components, PROVINCE_CANDIDATES)?.value ?? null,
        postcode: componentValue(components, ["postal_code"]),
        country: componentValue(components, ["country"]),
        latitude,
        longitude,
    };
}

/** Convert to the picker's search-result shape (same shape Nominatim used to produce). */
export function toLocationSearchResult(address: NormalizedGoogleAddress | null): NormalizedGoogleSearchResult | null {
    if (!address) return null;
    const displayName =
        address.formattedAddress ||
        joinParts([
            address.road,
            address.houseNumber,
            address.village,
            address.district,
            address.city,
            address.province,
            address.postcode,
        ]);
    return {
        displayName,
        latitude: address.latitude,
        longitude: address.longitude,
        address: {
            road: address.road,
            houseNumber: address.houseNumber,
            village: address.village,
            district: address.district,
            city: address.city,
            // Google exposes no separate regency level for Indonesia: the kota/kabupaten is
            // `administrative_area_level_2` and is already mapped to `city`. Never duplicated.
            regency: null,
            province: address.province,
            postcode: address.postcode,
            country: address.country,
        },
    };
}

/** Places API (New) `Place` (and legacy `PlaceResult`) → internal address. */
export function normalizeGooglePlace(raw: unknown): NormalizedGoogleAddress | null {
    const record = asRecord(raw);
    if (!record) return null;
    const location = readLatLng(record.location) ?? readLatLng(asRecord(record.geometry)?.location);
    if (!location) return null;
    return normalizeGoogleAddress({
        formattedAddress: firstText(record.formattedAddress, record.formatted_address, record.displayName, record.name),
        components: record.addressComponents ?? record.address_components,
        latitude: location.latitude,
        longitude: location.longitude,
    });
}

/**
 * Geocoding API result → internal address. `place_id` is intentionally ignored: it is
 * NEVER used as a Biteship `destinationAreaId`. The requested pin is the coordinate
 * fallback, so a response without `geometry` cannot shift the confirmed pin.
 */
export function normalizeGoogleGeocodeResult(
    raw: unknown,
    fallback?: { latitude: number; longitude: number } | null,
): NormalizedGoogleAddress | null {
    const record = asRecord(raw);
    if (!record) return null;
    const location =
        readLatLng(asRecord(record.geometry)?.location) ??
        readLatLng(record.location) ??
        (fallback ? { latitude: fallback.latitude, longitude: fallback.longitude } : null);
    if (!location) return null;
    return normalizeGoogleAddress({
        formattedAddress: firstText(record.formatted_address, record.formattedAddress),
        components: record.address_components ?? record.addressComponents,
        latitude: location.latitude,
        longitude: location.longitude,
    });
}

/** Normalize every usable entry of a Geocoding API response (or a bare result array). */
export function normalizeGoogleGeocodeResults(
    input: unknown,
    fallback?: { latitude: number; longitude: number } | null,
): NormalizedGoogleAddress[] {
    const record = asRecord(input);
    const rawResults = Array.isArray(input) ? input : record ? record.results : null;
    if (!Array.isArray(rawResults)) return [];
    const normalized: NormalizedGoogleAddress[] = [];
    for (const entry of rawResults) {
        const result = normalizeGoogleGeocodeResult(entry, fallback);
        if (result) normalized.push(result);
    }
    return normalized;
}

/* ==========================================================================
 * Result evaluation — which Google answer is the best usable one
 * ==========================================================================
 *
 * A Google reverse geocode answers with SEVERAL results of different types
 * (`street_address`, `premise`, `subpremise`, `route`, `neighborhood`, `sublocality`,
 * `sublocality_level_*`, `administrative_area_level_*`, `postal_code`, `plus_code`, ...) and
 * their order is a prominence hint, not a guarantee. Taking `results[0]` therefore either threw
 * away the address (when the first entry carries only a plus code) or accepted an entry with no
 * address at all. The helpers below weigh the evidence an answer really carries instead.
 */

/**
 * How much address evidence one normalized result carries.
 *
 * `formattedAddress` alone is enough to be RECOGNIZED (Google did answer), while a street line
 * and the administrative levels are what make the address usable for Biteship area matching.
 */
export function scoreGoogleAddress(address: NormalizedGoogleAddress | null | undefined): number {
    if (!address) return 0;
    let score = 0;
    if (text(address.formattedAddress)) score += 1;
    if (text(address.road)) score += 4;
    if (text(address.houseNumber)) score += 2;
    if (text(address.village)) score += 2;
    if (text(address.district)) score += 2;
    if (text(address.city)) score += 1;
    if (text(address.province)) score += 1;
    if (text(address.postcode)) score += 1;
    return score;
}

/**
 * True when Google really recognized SOMETHING at this pin.
 *
 * A valid `formatted_address` is enough even when every structured component is empty — normal
 * for many Indonesian coordinates — so "no structured fields" must never be reported as
 * "address unrecognized". Only a result with no address text AND no component at all is
 * unrecognized (e.g. a plus-code-only answer).
 */
export function isRecognizedGoogleAddress(address: NormalizedGoogleAddress | null | undefined): boolean {
    return scoreGoogleAddress(address) > 0;
}

/**
 * Best usable result of a reverse-geocode response: highest evidence wins, and an equal score
 * keeps the earlier entry (Google's own prominence order). Returns null only when Google
 * answered with nothing recognizable at all, so the caller can fall back honestly.
 */
export function pickBestGoogleGeocodeResult(results: NormalizedGoogleAddress[]): NormalizedGoogleAddress | null {
    let best: NormalizedGoogleAddress | null = null;
    let bestScore = 0;
    for (const result of results) {
        const score = scoreGoogleAddress(result);
        if (score > bestScore) {
            best = result;
            bestScore = score;
        }
    }
    return best;
}


/* ==========================================================================
 * Failure classification — "no address here" vs "address service unavailable"
 * ==========================================================================
 */

export type GoogleGeocodeFailureKind = "no_address" | "unavailable";

/**
 * Statuses that mean "Google answered, and there is no address for this point". Every other
 * status (quota, authorization, transport, an API that could not load) is a TEMPORARY problem.
 */
const GOOGLE_GEOCODE_EMPTY_STATUSES = ["ZERO_RESULTS", "NOT_FOUND"];

/** The status token of a Geocoder rejection (the API rejects with the raw status string). */
function failureToken(error: unknown): string | null {
    if (typeof error === "string") {
        const value = error.trim();
        return value.length > 0 ? value.toUpperCase() : null;
    }
    const record = asRecord(error);
    if (!record) return null;
    return firstText(record.status, record.code, record.message)?.toUpperCase() ?? null;
}

/**
 * Classify a failed reverse geocode WITHOUT ever handing upstream text to the UI.
 *
 * The Maps JS Geocoder rejects with the plain status string for every non-OK status, and
 * treating all of them as one error made an exhausted quota, a transport failure or a key that
 * may not use the API look like "Alamat lokasi belum dapat dikenali" — for a location Google
 * Maps displays perfectly. Only a genuine empty answer is `no_address`.
 */
export function classifyGoogleGeocodeFailure(error: unknown): GoogleGeocodeFailureKind {
    const token = failureToken(error);
    if (!token) return "unavailable";
    return GOOGLE_GEOCODE_EMPTY_STATUSES.some((status) => token.includes(status)) ? "no_address" : "unavailable";
}

/**
 * Reverse geocode a confirmed pin with the official Maps JS API Geocoder.
 *
 * The pin stays authoritative and keeps full float precision (coordinates are never
 * rounded to a fixed number of decimals). Every usable result is evaluated — never blindly
 * `results[0]` — and a response without any recognizable address resolves to null so the caller
 * can fall back to the manual kecamatan/kelurahan picker instead of displaying invented admin
 * names.
 *
 * A provider failure (non-OK status, transport error) still REJECTS with the provider's status,
 * so the caller can tell "no address here" from "the address service is unavailable" via
 * `classifyGoogleGeocodeFailure`.
 */
export async function reverseGeocodeWithGoogle(
    pin: { latitude: number; longitude: number } | null | undefined,
    api: GoogleGeocoderApiLike | null,
): Promise<NormalizedGoogleAddress | null> {
    const latitude = coordinate(pin?.latitude, LATITUDE_MIN, LATITUDE_MAX);
    const longitude = coordinate(pin?.longitude, LONGITUDE_MIN, LONGITUDE_MAX);
    if (latitude === null || longitude === null) return null;
    if (!api || typeof api.maps?.Geocoder !== "function") return null;

    const geocoder = new api.maps.Geocoder();
    const response = await geocoder.geocode({
        location: { lat: latitude, lng: longitude },
        language: GOOGLE_REVERSE_LANGUAGE,
        region: GOOGLE_REVERSE_REGION,
    });
    const results = normalizeGoogleGeocodeResults(response, { latitude, longitude });
    // Every result is weighed, so a leading plus-code/bare entry can no longer hide the
    // `street_address`/administrative answer behind it — and an answer with no address at all
    // stays "unrecognized" instead of becoming an empty address.
    return pickBestGoogleGeocodeResult(results);
}
