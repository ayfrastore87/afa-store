import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-auth";
import { reverseGeocode, GeocodingUnavailableError } from "@/lib/geocoding";
import { normalizeLatitude, normalizeLongitude } from "@/lib/coordinates";

export const runtime = "nodejs";

/*
 * GET /api/location/reverse?lat=<num>&lng=<num>
 * Server-proxied reverse geocoding (Nominatim). Lat/lng are validated for
 * finiteness and range; coordinates are METADATA ONLY and never influence
 * shipping price.
 */
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const lat = normalizeLatitude(url.searchParams.get("lat"));
        const lng = normalizeLongitude(url.searchParams.get("lng"));
        if (lat === null || lng === null) {
            return NextResponse.json({ message: "Koordinat lokasi tidak valid." }, { status: 400 });
        }

        const result = await reverseGeocode(lat, lng);
        return NextResponse.json({ success: true, result });
    } catch (error) {
        if (error instanceof GeocodingUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 });
        }
        console.error("location_reverse_failed", { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ message: "Gagal mengenali alamat. Silakan coba lagi." }, { status: 500 });
    }
}
