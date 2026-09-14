/*
 * Server-side Biteship area handling.
 * Browser-supplied area IDs are NEVER trusted verbatim for rate booking; they are
 * only accepted as opaque strings that the server first validates against Biteship.
 */

const AREA_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

/** Normalize a Biteship area ID to a safe, plain ASCII string (or null). */
export function normalizeAreaId(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!AREA_ID_PATTERN.test(trimmed)) return null;
    return trimmed;
}

/**
 * Defense-in-depth guard: refuse arbitrary/unsafe area IDs before they reach
 * Biteship. A valid Biteship area ID is a short ASCII token (often numeric).
 * Any string with suspicious characters is rejected outright. Crucially, even a
 * "valid-looking" ID is still re-verified server-side by Biteship itself.
 */
export function denyArbitraryAreaId(areaId: string): boolean {
    // Must be short ASCII, no whitespace, no path traversal / injection risk.
    if (!AREA_ID_PATTERN.test(areaId)) return true;
    if (areaId.length > 64) return true;
    return false;
}
