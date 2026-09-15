import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-auth";
import { searchLocations, GeocodingUnavailableError } from "@/lib/geocoding";

export const runtime = "nodejs";

/*
 * GET /api/location/search?q=<str>
 * Server-proxied address/place search (Nominatim). The browser never calls the
 * geocoder directly, so we control User-Agent, timeout, validation and never
 * leak raw upstream errors.
 */
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) return NextResponse.json({ success: true, results: [] });
        if (q.length < 3) return NextResponse.json({ success: true, results: [] });
        if (q.length > 200) return NextResponse.json({ message: "Pencarian terlalu panjang." }, { status: 400 });

        const results = await searchLocations(q);
        return NextResponse.json({ success: true, results });
    } catch (error) {
        if (error instanceof GeocodingUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 });
        }
        console.error("location_search_failed", { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ message: "Pencarian lokasi gagal. Silakan coba lagi." }, { status: 500 });
    }
}
