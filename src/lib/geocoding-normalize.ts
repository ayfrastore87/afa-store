/*
 * Pure, dependency-free geocoding normalization (Nominatim/OpenStreetMap).
 * Importable by both the server geocoding module and the node:test suite.
 *
 * The UI is NEVER bound to the raw provider response — it only ever consumes the
 * normalized `LocationSearchResult` shape below.
 */

export type LocationAddress = {
    road?: string | null;
    houseNumber?: string | null;
    village?: string | null; // kelurahan / desa
    suburb?: string | null;
    district?: string | null; // kecamatan
    city?: string | null; // kota / kabupaten
    regency?: string | null;
    province?: string | null; // provinsi
    postcode?: string | null;
};

export type LocationSearchResult = {
    displayName: string;
    latitude: number;
    longitude: number;
    address: LocationAddress;
};

function str(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function first(...values: (string | null | undefined)[]): string | null {
    for (const v of values) {
        if (v) return v;
    }
    return null;
}

/** Normalize a single Nominatim place object into the shared result shape. */
export function normalizeNominatimPlace(raw: unknown): LocationSearchResult | null {
    if (typeof raw !== "object" || raw === null) return null;
    const record = raw as Record<string, unknown>;
    const addr = (record.address && typeof record.address === "object" ? record.address : {}) as Record<string, unknown>;

    const latitude = num(record.lat);
    const longitude = num(record.lon);
    if (latitude === null || longitude === null) return null;

    const displayName = str(record.display_name) ?? str(record.name) ?? "";

    return {
        displayName,
        latitude,
        longitude,
        address: {
            road: str(addr.road),
            houseNumber: str(addr.house_number),
            village: first(str(addr.village), str(addr.suburb), str(addr.neighbourhood), str(addr.hamlet)),
            suburb: first(str(addr.suburb), str(addr.borough)),
            district: first(str(addr.city_district), str(addr.borough), str(addr.district)),
            city: first(str(addr.city), str(addr.county), str(addr.town), str(addr.municipality)),
            regency: str(addr.county),
            province: str(addr.state),
            postcode: first(str(addr.postcode), str(addr.postal_code)),
        },
    };
}

/** Normalize a Nominatim search response (array) into a safe result list. */
export function normalizeSearchResults(raw: unknown): LocationSearchResult[] {
    const list = Array.isArray(raw) ? raw : [];
    const out: LocationSearchResult[] = [];
    for (const item of list) {
        const normalized = normalizeNominatimPlace(item);
        if (normalized) out.push(normalized);
    }
    return out;
}

/** Normalize a Nominatim reverse-geocode response (single object). */
export function normalizeReverseResult(raw: unknown): LocationSearchResult | null {
    return normalizeNominatimPlace(raw);
}
