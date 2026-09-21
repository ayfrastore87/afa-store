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
        const type = rawType === "single" || rawType === "double" ? rawType : "single";

        const areas = await searchBiteshipAreas(input, type);
        if (process.env.NODE_ENV !== "production") {
            // Development diagnostics only: which label was searched and how many official
            // candidates came back. Never the API key, cookies or customer data.
            console.info("shipping_areas_query", { input, type, count: areas.length });
        }
        return NextResponse.json({ success: true, areas });
    } catch (error) {
        // Sanitized diagnostics only: the failure TAXONOMY, never the API key, token,
        // Authorization header, cookies or customer data. `code` is
        // "CONFIGURATION" | "UPSTREAM" so an operator can tell a missing/invalid
        // provider key (CONFIGURATION -> nothing was even sent upstream) apart from a
        // transient upstream outage (UPSTREAM). The raw upstream HTTP status/body is
        // logged one layer down in biteship.ts (`biteship_request_failed`).
        if (error instanceof BiteshipUnavailableError) {
            console.error("shipping_areas_unavailable", { path: "/v1/maps/areas", code: error.code, kind: error.kind, message: error.message });
            return NextResponse.json({ message: error.message }, { status: 503 });
        }
        if (error instanceof BiteshipError) {
            console.error("shipping_areas_rejected", { path: "/v1/maps/areas", kind: error.kind, message: error.message });
            return NextResponse.json({ message: error.message }, { status: 400 });
        }
        console.error("shipping_areas_failed", { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ message: "Terjadi kesalahan server." }, { status: 500 });
    }
}
