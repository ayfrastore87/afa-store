import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-auth";
import { searchBiteshipAreas, BiteshipError, BiteshipUnavailableError } from "@/lib/biteship";

export const runtime = "nodejs";

/*
 * GET /api/shipping/areas?input=<str>&type=<single|double>
 * Server-proxied Biteship area search — the browser never holds the API key,
 * and area IDs are normalized server-side before use.
 */
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const input = (url.searchParams.get("input") || "").trim();
        if (!input) return NextResponse.json({ success: true, areas: [] });
        if (input.length > 120) return NextResponse.json({ message: "Pencarian terlalu panjang." }, { status: 400 });

        const rawType = url.searchParams.get("type");
        const type = rawType === "single" || rawType === "double" ? rawType : "double";

        const areas = await searchBiteshipAreas(input, type);
        return NextResponse.json({ success: true, areas });
    } catch (error) {
        if (error instanceof BiteshipUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 });
        }
        if (error instanceof BiteshipError) {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }
        console.error("shipping_areas_failed", { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ message: "Terjadi kesalahan server." }, { status: 500 });
    }
}
