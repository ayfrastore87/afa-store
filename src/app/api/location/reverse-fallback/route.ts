import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-auth";
import { normalizeFallbackCoordinates, resolveFallbackReverseAddress } from "@/lib/reverse-geocode-fallback";

export const runtime = "nodejs";

/*
 * GET /api/location/reverse-fallback?lat=<num>&lng=<num>
 *
 * Server-proxied, FREE reverse-geocode FALLBACK used only when Google Geocoding is unavailable
 * (billing off, quota exhausted, REQUEST_DENIED, library failed to load) or reports no address for
 * the confirmed pin. The browser never contacts this provider directly, so no key is ever exposed
 * and the provider's usage policy (identifying User-Agent, one request per confirmation) is
 * enforced in one place.
 *
 * The pin is validated here first: an invalid `lat`/`lng` is rejected with 400 and NO upstream call
 * is made. Our response is our own normalized contract — the provider payload is never forwarded.
 */

/** Client states: `ok` (address resolved), `no_address` (nothing here), `unavailable` (transient). */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const coordinates = normalizeFallbackCoordinates(url.searchParams.get("lat"), url.searchParams.get("lng"));
        if (!coordinates) {
            return NextResponse.json({ status: "invalid_coordinates", message: "Koordinat tidak valid." }, { status: 400, headers: NO_STORE });
        }

        const result = await resolveFallbackReverseAddress(coordinates.latitude, coordinates.longitude);

        if (process.env.NODE_ENV !== "production") {
            // Development diagnostics only: the outcome and whether it came from the short cache.
            // Never the pin, never the provider payload, never a key or cookie.
            console.info("reverse_fallback_query", { status: result.status, cached: result.status === "ok" ? result.cached : false });
        }

        if (result.status === "ok") {
            return NextResponse.json({ status: "ok", cached: result.cached, address: result.address }, { headers: NO_STORE });
        }
        if (result.status === "no_address") {
            return NextResponse.json({ status: "no_address" }, { headers: NO_STORE });
        }
        return NextResponse.json(
            { status: "unavailable", message: "Layanan alamat cadangan sedang tidak dapat dihubungi." },
            { status: 503, headers: NO_STORE },
        );
    } catch (error) {
        console.error("reverse_fallback_failed", { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ status: "unavailable", message: "Terjadi kesalahan server." }, { status: 500, headers: NO_STORE });
    }
}
