import "server-only";

import { normalizeSearchResults, normalizeReverseResult, type LocationSearchResult } from "@/lib/geocoding-normalize";
import { normalizeLatitude, normalizeLongitude } from "@/lib/coordinates";

/*
 * Server-side geocoding via OpenStreetMap Nominatim (no API key required).
 * The browser never calls Nominatim directly — all requests go through this
 * module and the /api/location/* routes so we can enforce:
 *   - a proper User-Agent (Nominatim policy),
 *   - a timeout,
 *   - input validation,
 *   - response normalization,
 *   - and never leaking raw upstream errors to the client.
 */

const NOMINATIM_BASE_URL =
    (process.env.NOMINATIM_BASE_URL?.trim() || "https://nominatim.openstreetmap.org").replace(/\/+$/, "");

// Nominatim requires a valid, identifying User-Agent (their usage policy). No
// API key is involved. Operators may override via env for a dedicated contact.
const NOMINATIM_USER_AGENT =
    process.env.NOMINATIM_USER_AGENT?.trim() ||
    "AFA-STORE-checkout/1.0 (e-commerce checkout; contact: admin@afa.store)";

const NOMINATIM_TIMEOUT_MS = 8_000;

export class GeocodingUnavailableError extends Error {
    constructor(message = "Pencarian lokasi sedang tidak tersedia. Silakan coba lagi.") {
        super(message);
        this.name = "GeocodingUnavailableError";
    }
}

async function nominatimFetch(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
    try {
        const response = await fetch(`${NOMINATIM_BASE_URL}${path}`, {
            headers: {
                Accept: "application/json",
                "User-Agent": NOMINATIM_USER_AGENT,
            },
            signal: controller.signal,
        });
        const text = await response.text();
        let data: unknown = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            throw new GeocodingUnavailableError();
        }
        if (!response.ok) throw new GeocodingUnavailableError();
        return data;
    } catch (error) {
        if (error instanceof GeocodingUnavailableError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") throw new GeocodingUnavailableError();
        throw new GeocodingUnavailableError();
    } finally {
        clearTimeout(timeout);
    }
}

export async function searchLocations(query: string): Promise<LocationSearchResult[]> {
    const q = query.trim();
    if (q.length < 3) return [];
    const params = new URLSearchParams({
        q,
        format: "jsonv2",
        limit: "5",
        addressdetails: "1",
        countrycodes: "ID",
        "accept-language": "id",
    });
    const data = await nominatimFetch(`/search?${params.toString()}`);
    return normalizeSearchResults(data);
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<LocationSearchResult | null> {
    const lat = normalizeLatitude(latitude);
    const lng = normalizeLongitude(longitude);
    if (lat === null || lng === null) return null;
    const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        format: "jsonv2",
        addressdetails: "1",
        zoom: "18",
        "accept-language": "id",
    });
    const data = await nominatimFetch(`/reverse?${params.toString()}`);
    return normalizeReverseResult(data);
}
