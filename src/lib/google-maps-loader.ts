/*
 * Google Maps JavaScript API loader for the checkout location picker.
 *
 * One authoritative loader for the whole app:
 *   - the key comes ONLY from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (never hardcoded, never
 *     logged, never read from another variable) and is read through the LITERAL member
 *     expression `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: that literal form is the
 *     only one Next.js/Turbopack substitutes when compiling the client bundle, so a
 *     computed lookup (`process.env[name]`) silently yields `undefined` in Production,
 *     which surfaced as a wrongly rendered "Peta belum dikonfigurasi" screen,
 *   - the official bootstrap script is injected at most ONCE per page session
 *     (module-level single-flight promise + a stable script id),
 *   - "loaded" means `google.maps.Map` EXISTS. Both the script's `load` event and the API's
 *     `callback` can fire while `google.maps` is still a bare namespace (the classes arrive
 *     with the async module scripts). Resolving there made the consumers build
 *     `new undefined(...)`, and their own `.catch` reported the silent `TypeError` as
 *     "Peta gagal dimuat" / "Pencarian alamat gagal dimuat" with a clean console,
 *   - the `places` class is awaited through `loadGoogleMapsPlaces()` (`importLibrary`),
 *     never read straight after the load,
 *   - every attempt is bounded by a deadline, so a request that stays pending rejects with a
 *     typed error instead of hanging, and a failure is never cached (retry always retries),
 *   - dependency-free on purpose: importable by `node --test` (no imports, no DOM
 *     access at module scope, no Next.js runtime). The browser surface is injected through
 *     `GoogleMapsLoaderEnvironment`, so the timing hazards above are unit tested.
 */

/**
 * Name of the public env var. Kept for documentation and for the test-only injection path;
 * the runtime value is read through the literal member expression in `publicEnvApiKey`.
 */
export const GOOGLE_MAPS_API_KEY_ENV = "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY";

/** Stable id so a leftover/failed script tag can be detected and replaced. */
export const GOOGLE_MAPS_SCRIPT_ID = "afa-google-maps-js";

/** Global callback the API invokes once the whole JS API is ready. */
export const GOOGLE_MAPS_CALLBACK = "__afaGoogleMapsReady";

/** Places API (New) needs the `places` library for PlaceAutocompleteElement. */
export const GOOGLE_MAPS_LIBRARIES = ["places"] as const;

const GOOGLE_MAPS_SCRIPT_BASE = "https://maps.googleapis.com/maps/api/js";

/** Library names handed to `google.maps.importLibrary`. */
export const GOOGLE_MAPS_CORE_LIBRARY = "maps";
export const GOOGLE_MAPS_PLACES_LIBRARY = "places";

/** Hard bound on one load attempt: a request that never finishes must never hang checkout. */
export const GOOGLE_MAPS_LOAD_TIMEOUT_MS = 15000;

/**
 * How often readiness is re-checked after the bootstrap script's `load` event. Google's
 * `callback` is the fast path; this poll makes an early — or never fired — callback harmless.
 */
export const GOOGLE_MAPS_READY_POLL_MS = 50;

export type GoogleMapsLoadErrorCode = "MISSING_KEY" | "UNSUPPORTED" | "LOAD_FAILED";

/** Customer-safe messages. They never contain the key or any upstream detail. */
export const GOOGLE_MAPS_MISSING_KEY_MESSAGE = "Peta belum dikonfigurasi. Hubungi admin AFA STORE.";
export const GOOGLE_MAPS_LOAD_FAILED_MESSAGE = "Peta Google belum dapat dimuat. Periksa koneksi lalu coba lagi.";
export const GOOGLE_MAPS_UNSUPPORTED_MESSAGE = "Peta hanya tersedia di browser.";

export class GoogleMapsLoadError extends Error {
    readonly code: GoogleMapsLoadErrorCode;

    constructor(code: GoogleMapsLoadErrorCode, message: string) {
        super(message);
        this.name = "GoogleMapsLoadError";
        this.code = code;
    }
}

type EnvLike = Record<string, string | undefined>;

/** The `<script>` surface the loader drives. A real `HTMLScriptElement` satisfies it. */
export interface GoogleMapsScriptLike {
    id: string;
    src: string;
    async: boolean;
    defer: boolean;
    addEventListener(type: "load" | "error", handler: () => void): void;
    removeEventListener(type: "load" | "error", handler: () => void): void;
    remove(): void;
}

/** The global object the API attaches its `google` namespace to. */
export interface GoogleMapsGlobalLike {
    google?: GoogleMapsApi;
    [key: string]: unknown;
}

/**
 * Everything outside this module the loader touches. Application code never builds one: the
 * loader derives it from the real `window`/`document`. It exists so the timing hazards this
 * file has to survive — a `load` event before the classes exist, a `callback` that fires too
 * early or not at all, a library that attaches late, a request that never completes, a retry
 * after a failure — are unit tested with a deterministic fake browser instead of hope.
 */
export interface GoogleMapsLoaderEnvironment {
    readonly global: GoogleMapsGlobalLike;
    createScript(): GoogleMapsScriptLike;
    appendScript(script: GoogleMapsScriptLike): void;
    removeScriptById(id: string): void;
    schedule(callback: () => void, ms: number): unknown;
    cancel(handle: unknown): void;
    timeoutMs?: number;
    pollMs?: number;
}

/** The Places API (New) autocomplete widget class, once its library is really usable. */
export interface GoogleMapsPlacesNamespace {
    PlaceAutocompleteElement: new (options?: GoogleMapsPlaceAutocompleteElementOptions) => GoogleMapsPlaceAutocompleteElement;
}

/**
 * The widget class, in either shape the API hands a library over in: directly
 * `{ PlaceAutocompleteElement }` (what `importLibrary("places")` resolves to) or nested
 * under `places`. Returns null instead of guessing, so a missing class stays detectable.
 */
function placesWidgetFrom(source: unknown): GoogleMapsPlacesNamespace["PlaceAutocompleteElement"] | null {
    if (!source || typeof source !== "object") return null;
    const direct = (source as { PlaceAutocompleteElement?: unknown }).PlaceAutocompleteElement;
    if (typeof direct === "function") return direct as unknown as GoogleMapsPlacesNamespace["PlaceAutocompleteElement"];
    const nested = (source as { places?: { PlaceAutocompleteElement?: unknown } }).places?.PlaceAutocompleteElement;
    if (typeof nested === "function") return nested as unknown as GoogleMapsPlacesNamespace["PlaceAutocompleteElement"];
    return null;
}

/**
 * The public key as it exists in the built client bundle.
 *
 * The member expression below is written out LITERALLY and must stay that way: Next.js
 * (webpack and Turbopack) only substitutes `process.env.NEXT_PUBLIC_*` member expressions
 * while compiling client code. A computed lookup such as `process.env[name]` or
 * `env[name]` is never substituted, and the browser's `process.env` shim does not carry
 * the value, so a dynamically read key is `undefined` at runtime in Production even
 * though the variable is configured on Vercel.
 *
 * Returns undefined when the variable is absent, blank or not a string.
 */
function publicEnvApiKey(): string | undefined {
    if (typeof process === "undefined") return undefined;
    const raw = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    return typeof raw === "string" ? raw : undefined;
}

/**
 * Read + trim the public key. Returns null when missing/blank. Never logs it.
 *
 * The default path — the only one application code ever takes — reads the statically
 * inlined public env var. An explicit `env` object may be injected by tests; that
 * injection path is the sole place a computed lookup is allowed, and it is unreachable
 * from production code.
 */
export function readGoogleMapsApiKey(env?: EnvLike): string | null {
    const raw = env ? env[GOOGLE_MAPS_API_KEY_ENV] : publicEnvApiKey();
    if (typeof raw !== "string") return null;
    const key = raw.trim();
    return key.length > 0 ? key : null;
}

/** Build the official bootstrap URL (async loading, `places`, Indonesian results). */
export function buildGoogleMapsScriptUrl(apiKey: string): string {
    const params = new URLSearchParams({
        key: apiKey,
        v: "weekly",
        loading: "async",
        libraries: GOOGLE_MAPS_LIBRARIES.join(","),
        language: "id",
        region: "ID",
        callback: GOOGLE_MAPS_CALLBACK,
    });
    return `${GOOGLE_MAPS_SCRIPT_BASE}?${params.toString()}`;
}

/** The API handle, available only after `loadGoogleMaps()` resolved. */
export function getGoogleMapsApi(): GoogleMapsApi | null {
    if (typeof window === "undefined") return null;
    const api = window.google;
    if (!api || !api.maps) return null;
    return api;
}

/**
 * "Ready" means the class we construct exists.
 *
 * `google.maps` alone is truthy as soon as the bootstrap namespace is created — seconds
 * before `Map` is attached — so a readiness test on the namespace resolves too early and the
 * consumers die on `new undefined()` with a `TypeError` their own `.catch` turns into a
 * generic "gagal dimuat". That was the Production bug.
 */
export function isGoogleMapsReady(api: GoogleMapsApi | null | undefined = getGoogleMapsApi()): boolean {
    return typeof api?.maps?.Map === "function";
}

/** The namespace of an injected environment (`null` environment = the real browser globals). */
function namespaceOf(environment: GoogleMapsLoaderEnvironment | null): GoogleMapsApi | null {
    if (!environment) return getGoogleMapsApi();
    const api = environment.global.google;
    return api && typeof api === "object" ? api : null;
}

/** The real browser environment, or null when there is no DOM (SSR, `node --test`). */
export function createGoogleMapsEnvironment(): GoogleMapsLoaderEnvironment | null {
    if (typeof window === "undefined" || typeof document === "undefined") return null;
    const doc = document;
    if (!doc.head) return null;
    return {
        global: window as unknown as GoogleMapsGlobalLike,
        createScript: () => doc.createElement("script") as unknown as GoogleMapsScriptLike,
        appendScript: (script) => {
            doc.head?.appendChild(script as unknown as Node);
        },
        removeScriptById: (id) => {
            doc.getElementById(id)?.remove();
        },
        schedule: (callback, ms) => setTimeout(callback, ms),
        cancel: (handle) => {
            clearTimeout(handle as ReturnType<typeof setTimeout>);
        },
        timeoutMs: GOOGLE_MAPS_LOAD_TIMEOUT_MS,
        pollMs: GOOGLE_MAPS_READY_POLL_MS,
    };
}

/** Bound an API promise, so a library that never arrives cannot hang the checkout forever. */
function withDeadline<T>(work: Promise<T>, environment: GoogleMapsLoaderEnvironment): Promise<T> {
    const timeoutMs = environment.timeoutMs ?? GOOGLE_MAPS_LOAD_TIMEOUT_MS;
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const handle = environment.schedule(() => {
            if (settled) return;
            settled = true;
            reject(new GoogleMapsLoadError("LOAD_FAILED", GOOGLE_MAPS_LOAD_FAILED_MESSAGE));
        }, timeoutMs);
        work.then(
            (value) => {
                if (settled) return;
                settled = true;
                environment.cancel(handle);
                resolve(value);
            },
            (error: unknown) => {
                if (settled) return;
                settled = true;
                environment.cancel(handle);
                reject(error);
            },
        );
    });
}

let loadPromise: Promise<void> | null = null;

/**
 * Inject the official bootstrap `<script>` and resolve only once the API is really usable.
 *
 * Three Production hazards are handled here:
 *   1. the `load` event means "the bootstrap arrived", not "the API is usable" — the classes
 *      come with the async module scripts, so the event only triggers a re-check plus polling,
 *   2. the API's `callback` can fire before the classes are attached, so it is a fast path
 *      and never the one and only signal,
 *   3. a request may stay pending forever (HTTP 200, no `load`, no `error`), so the attempt is
 *      bounded by a deadline that rejects with a typed, retryable error.
 *
 * Exported with an explicit environment so those timings can be exercised by tests;
 * production always reaches it through `loadGoogleMaps()`.
 */
export function injectGoogleMapsScript(apiKey: string, environment: GoogleMapsLoaderEnvironment): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const { global } = environment;
        const timeoutMs = environment.timeoutMs ?? GOOGLE_MAPS_LOAD_TIMEOUT_MS;
        const pollMs = environment.pollMs ?? GOOGLE_MAPS_READY_POLL_MS;
        let settled = false;
        let deadline: unknown = null;
        let poll: unknown = null;
        let script: GoogleMapsScriptLike | null = null;

        function stopTimers() {
            if (deadline !== null) {
                environment.cancel(deadline);
                deadline = null;
            }
            if (poll !== null) {
                environment.cancel(poll);
                poll = null;
            }
        }

        function finish(error: GoogleMapsLoadError | null) {
            if (settled) return;
            settled = true;
            stopTimers();
            if (script) {
                script.removeEventListener("load", handleLoad);
                script.removeEventListener("error", handleError);
            }
            // Never leave the callback behind: Google invokes the name baked into the URL, so
            // a stale global would consume the *next* attempt's signal and hang it.
            if (global[GOOGLE_MAPS_CALLBACK] === handleReady) delete global[GOOGLE_MAPS_CALLBACK];
            if (error) reject(error);
            else resolve();
        }

        /** The API's own "everything is loaded" callback. Allowed to be early, never final. */
        function handleReady() {
            if (settled) return;
            // Namespace without `Map` = the bootstrap only. Wait instead of resolving.
            if (!isGoogleMapsReady(namespaceOf(environment))) return;
            finish(null);
        }

        /** Keep re-checking after `load`, so a class that attaches late still resolves. */
        function pollForCore() {
            if (settled || poll !== null) return;
            poll = environment.schedule(() => {
                poll = null;
                if (settled) return;
                if (isGoogleMapsReady(namespaceOf(environment))) {
                    finish(null);
                    return;
                }
                pollForCore();
            }, pollMs);
        }

        function handleLoad() {
            handleReady();
            pollForCore();
        }

        function handleError() {
            script?.remove();
            finish(new GoogleMapsLoadError("LOAD_FAILED", GOOGLE_MAPS_LOAD_FAILED_MESSAGE));
        }

        function inject() {
            if (settled) return;
            // A previous attempt may have left the tag behind, and its events already fired.
            environment.removeScriptById(GOOGLE_MAPS_SCRIPT_ID);
            const element = environment.createScript();
            script = element;
            element.id = GOOGLE_MAPS_SCRIPT_ID;
            element.src = buildGoogleMapsScriptUrl(apiKey);
            element.async = true;
            element.defer = true;
            element.addEventListener("load", handleLoad);
            element.addEventListener("error", handleError);
            // Order matters: the callback has to exist on the global BEFORE the tag is
            // appended, and the tag is appended only once its own handlers are bound.
            global[GOOGLE_MAPS_CALLBACK] = handleReady;
            environment.appendScript(element);
        }

        // One deadline for the whole attempt, so a hung request still ends in a retry UI.
        deadline = environment.schedule(() => {
            finish(new GoogleMapsLoadError("LOAD_FAILED", GOOGLE_MAPS_LOAD_FAILED_MESSAGE));
        }, timeoutMs);

        if (isGoogleMapsReady(namespaceOf(environment))) {
            finish(null);
            return;
        }

        const importLibrary = namespaceOf(environment)?.maps?.importLibrary;
        if (typeof importLibrary === "function") {
            // The bootstrap is already in the page (a retry after a partial attempt): ask the
            // API to finish its core library instead of appending a second, ignored tag.
            pollForCore();
            Promise.resolve()
                .then(() => importLibrary(GOOGLE_MAPS_CORE_LIBRARY))
                .then(handleReady, inject);
            return;
        }

        inject();
    });
}

/**
 * Load the Google Maps JavaScript API at most once per page session.
 *
 * Resolves only when `google.maps.Map` exists — never on the bare `google.maps` namespace.
 * Rejects with a typed error; never caches a failure, so "Coba lagi" always gets a fresh
 * attempt. `environment` exists for tests: application code calls it with no arguments.
 */
export function loadGoogleMaps(environment?: GoogleMapsLoaderEnvironment): Promise<void> {
    const resolved = environment ?? createGoogleMapsEnvironment();
    if (isGoogleMapsReady(namespaceOf(resolved))) return Promise.resolve();
    if (loadPromise) return loadPromise;
    const apiKey = readGoogleMapsApiKey();
    if (!apiKey) {
        // Not cached: an operator can add the key (or the customer can reload) and retry.
        return Promise.reject(new GoogleMapsLoadError("MISSING_KEY", GOOGLE_MAPS_MISSING_KEY_MESSAGE));
    }
    if (!resolved) {
        return Promise.reject(new GoogleMapsLoadError("UNSUPPORTED", GOOGLE_MAPS_UNSUPPORTED_MESSAGE));
    }
    loadPromise = injectGoogleMapsScript(apiKey, resolved).catch((error: unknown) => {
        // Never cache a failure: reopening the picker registers a fresh, single attempt.
        loadPromise = null;
        throw error;
    });
    return loadPromise;
}

/**
 * The Places API (New) autocomplete class, handed over only when it can really be constructed.
 *
 * `libraries=places` in the bootstrap URL merely *starts* the download of places.js: with
 * `loading=async` the class is attached after the core, so reading
 * `google.maps.places.PlaceAutocompleteElement` right after `loadGoogleMaps()` raced the
 * library — in Production that race produced a silent `TypeError` reported to the customer as
 * "Pencarian alamat gagal dimuat". Consumers await this instead, and a class that never
 * arrives becomes a typed, retryable error rather than an unexplainable failure.
 */
export async function loadGoogleMapsPlaces(
    environment?: GoogleMapsLoaderEnvironment,
): Promise<GoogleMapsPlacesNamespace> {
    const resolved = environment ?? createGoogleMapsEnvironment();
    await loadGoogleMaps(environment);

    const attached = placesWidgetFrom(namespaceOf(resolved)?.maps?.places);
    if (attached) return { PlaceAutocompleteElement: attached };

    const importLibrary = namespaceOf(resolved)?.maps?.importLibrary;
    if (typeof importLibrary === "function" && resolved) {
        const library = await withDeadline(
            Promise.resolve().then(() => importLibrary(GOOGLE_MAPS_PLACES_LIBRARY)),
            resolved,
        ).catch(() => null);
        const widget = placesWidgetFrom(library) ?? placesWidgetFrom(namespaceOf(resolved)?.maps?.places);
        if (widget) return { PlaceAutocompleteElement: widget };
    }

    throw new GoogleMapsLoadError("LOAD_FAILED", GOOGLE_MAPS_LOAD_FAILED_MESSAGE);
}
