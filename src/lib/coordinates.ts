/*
 * Pure, dependency-free delivery-location coordinate helpers.
 * Importable by both the server route and the node:test suite (no `server-only`,
 * no zod, no Prisma, no Next imports).
 *
 * IMPORTANT: these coordinates are DELIVERY LOCATION METADATA ONLY. They are
 * NEVER used to derive shipping price, and NEVER used to fabricate or substitute
 * a Biteship `destinationAreaId` (which stays authoritative from area search).
 */

export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/** Normalize a latitude value to a finite number within [-90, 90], or null. */
export function normalizeLatitude(value: unknown): number | null {
    const n = toFiniteNumber(value);
    if (n === null || n < LATITUDE_MIN || n > LATITUDE_MAX) return null;
    return n;
}

/** Normalize a longitude value to a finite number within [-180, 180], or null. */
export function normalizeLongitude(value: unknown): number | null {
    const n = toFiniteNumber(value);
    if (n === null || n < LONGITUDE_MIN || n > LONGITUDE_MAX) return null;
    return n;
}

export type DeliveryCoordinates = { latitude: number; longitude: number };

export type CoordinateParseResult =
    | { provided: false; coordinates: null }
    | { provided: true; valid: true; coordinates: DeliveryCoordinates }
    | { provided: true; valid: false; coordinates: null };

/**
 * Coerce an optional (latitude, longitude) pair from an untrusted client payload.
 * - Neither value present (undefined / null / "" / 0-length string) -> not provided.
 * - One present without the other, or any non-finite / out-of-range value -> invalid.
 * The server decides whether an invalid pair is fatal or safely ignored; this
 * helper only classifies it.
 */
export function parseDeliveryCoordinates(latitude: unknown, longitude: unknown): CoordinateParseResult {
    const hasLat = latitude !== undefined && latitude !== null && latitude !== "";
    const hasLng = longitude !== undefined && longitude !== null && longitude !== "";
    if (!hasLat && !hasLng) return { provided: false, coordinates: null };
    const lat = normalizeLatitude(latitude);
    const lng = normalizeLongitude(longitude);
    if (lat === null || lng === null) return { provided: true, valid: false, coordinates: null };
    return { provided: true, valid: true, coordinates: { latitude: lat, longitude: lng } };
}