/*
 * Google Maps JavaScript API loader for the checkout location picker.
 *
 * One authoritative loader for the whole app:
 *   - the key comes ONLY from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (never hardcoded,
 *     never logged, never read from another variable),
 *   - the official bootstrap script is injected at most ONCE per page session
 *     (module-level single-flight promise + a stable script id),
 *   - a failed load rejects with a typed error AND clears the in-flight state, so
 *     the customer can retry instead of being stuck,
 *   - `libraries=places` is required for the Places API (New) autocomplete widget,
 *   - dependency-free on purpose: importable by `node --test` (no imports, no DOM
 *     access at module scope, no Next.js runtime).
 */

export const GOOGLE_MAPS_API_KEY_ENV = "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY";

/** Stable id so a leftover/failed script tag can be detected and replaced. */
export const GOOGLE_MAPS_SCRIPT_ID = "afa-google-maps-js";

/** Global callback the API invokes once the whole JS API is ready. */
export const GOOGLE_MAPS_CALLBACK = "__afaGoogleMapsReady";

/** Places API (New) needs the `places` library for PlaceAutocompleteElement. */
export const GOOGLE_MAPS_LIBRARIES = ["places"] as const;

const GOOGLE_MAPS_SCRIPT_BASE = "https://maps.googleapis.com/maps/api/js";

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

function defaultEnv(): EnvLike | undefined {
    return typeof process === "undefined" ? undefined : (process.env as EnvLike);
}

/** Read + trim the public key. Returns null when missing/blank. Never logs it. */
export function readGoogleMapsApiKey(env: EnvLike | undefined = defaultEnv()): string | null {
    const raw = env ? env[GOOGLE_MAPS_API_KEY_ENV] : undefined;
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

let loadPromise: Promise<void> | null = null;

function injectGoogleMapsScript(apiKey: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const host = window as unknown as Record<string, unknown>;
        const head = document.head;
        if (!head) {
            reject(new GoogleMapsLoadError("UNSUPPORTED", GOOGLE_MAPS_UNSUPPORTED_MESSAGE));
            return;
        }
        // A previous failed attempt may have left the tag behind. Drop it instead of
        // trusting an element whose load/error event already fired.
        document.getElementById(GOOGLE_MAPS_SCRIPT_ID)?.remove();

        const script = document.createElement("script");
        let settled = false;

        const succeed = () => {
            // The callback can fire before every library is attached; only resolve once
            // the API handle really exists.
            if (settled || !getGoogleMapsApi()) return;
            settled = true;
            resolve();
        };
        const fail = () => {
            if (settled) return;
            settled = true;
            script.remove();
            reject(new GoogleMapsLoadError("LOAD_FAILED", GOOGLE_MAPS_LOAD_FAILED_MESSAGE));
        };

        // The `callback` parameter is authoritative: with `loading=async` the script's
        // load event may fire before the `places` library is usable.
        host[GOOGLE_MAPS_CALLBACK] = succeed;
        script.addEventListener("load", succeed);
        script.addEventListener("error", fail);

        script.id = GOOGLE_MAPS_SCRIPT_ID;
        script.src = buildGoogleMapsScriptUrl(apiKey);
        script.async = true;
        script.defer = true;
        head.appendChild(script);
    });
}

/**
 * Load the Google Maps JavaScript API exactly once.
 * Resolves immediately when the API is already available; never caches a failure.
 */
export function loadGoogleMaps(): Promise<void> {
    if (getGoogleMapsApi()) return Promise.resolve();
    if (loadPromise) return loadPromise;
    const apiKey = readGoogleMapsApiKey();
    if (!apiKey) {
        // Not cached: an operator can add the key (or the customer can reload) and retry.
        return Promise.reject(new GoogleMapsLoadError("MISSING_KEY", GOOGLE_MAPS_MISSING_KEY_MESSAGE));
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
        return Promise.reject(new GoogleMapsLoadError("UNSUPPORTED", GOOGLE_MAPS_UNSUPPORTED_MESSAGE));
    }
    loadPromise = injectGoogleMapsScript(apiKey).catch((error: unknown) => {
        // Never cache a failure: reopening the picker registers a fresh, single attempt.
        loadPromise = null;
        throw error;
    });
    return loadPromise;
}
