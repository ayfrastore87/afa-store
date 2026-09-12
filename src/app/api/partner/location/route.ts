import { NextResponse } from "next/server";

import { PARTNER_LOCATION_SOURCE_BROWSER_GPS, partnerLocationInputSchema } from "@/lib/partner-location";
import { prisma } from "@/lib/prisma";
import { getCurrentPartner } from "@/lib/server-auth";

export const runtime = "nodejs";

// Partner location snapshot (Tahap IX). Privacy-first: no background tracking,
// no polling — the client only calls this after an explicit user action (the
// "Gunakan Lokasi Saya" button) and after the browser grants permission.
//
// Authorization is always the ACTIVE partner from the session; `partnerId` is
// never accepted from the client (IDOR-safe). `source` and `recordedAt` are
// server-assigned, so a spoofed timestamp or source in the body is ignored.

const locationSelect = {
    id: true,
    latitude: true,
    longitude: true,
    accuracy: true,
    source: true,
    consent: true,
    recordedAt: true,
} as const;

// Latest snapshot for the current partner only.
export async function GET() {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;

    try {
        const location = await prisma.partnerLocation.findFirst({
            where: { partnerId },
            orderBy: { recordedAt: "desc" },
            select: locationSelect,
        });

        return NextResponse.json(
            { location },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("partner_location_get_failed", {
            category: "partner_location_get",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Lokasi gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const parsed = partnerLocationInputSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Data lokasi tidak valid." }, { status: 400 });
    }

    try {
        const location = await prisma.partnerLocation.create({
            data: {
                partnerId,
                latitude: parsed.data.latitude,
                longitude: parsed.data.longitude,
                accuracy: parsed.data.accuracy ?? null,
                source: PARTNER_LOCATION_SOURCE_BROWSER_GPS,
                consent: true,
                recordedAt: new Date(), // server timestamp, never client-supplied
            },
            select: locationSelect,
        });

        return NextResponse.json({ message: "Lokasi berhasil diperbarui.", location }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("partner_location_create_failed", {
            category: "partner_location_create",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Gagal menyimpan lokasi. Silakan coba lagi." }, { status: 500 });
    }
}
