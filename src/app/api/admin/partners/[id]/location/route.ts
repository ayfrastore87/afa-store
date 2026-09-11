import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

// READ-ONLY admin view of a partner's latest location snapshot (Tahap IX §22).
// The partner id comes from the URL but the caller is always verified as an
// admin via getCurrentAdmin(). No mutations, no client-supplied authorization.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    try {
        const partner = await prisma.partner.findUnique({
            where: { id },
            select: {
                id: true,
                partnerCode: true,
                displayName: true,
                businessName: true,
                partnerType: true,
                status: true,
            },
        });
        if (!partner) return NextResponse.json({ message: "Mitra tidak ditemukan." }, { status: 404 });

        const location = await prisma.partnerLocation.findFirst({
            where: { partnerId: id },
            orderBy: { recordedAt: "desc" },
            select: {
                id: true,
                latitude: true,
                longitude: true,
                accuracy: true,
                source: true,
                consent: true,
                recordedAt: true,
            },
        });

        return NextResponse.json({
            partner: {
                id: partner.id,
                partnerCode: partner.partnerCode,
                name: partner.businessName || partner.displayName,
                partnerType: partner.partnerType,
                status: partner.status,
            },
            location,
        });
    } catch (error) {
        console.error("admin_partner_location_failed", {
            category: "admin_partner_location",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Lokasi mitra gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
