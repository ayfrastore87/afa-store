import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const partner = await prisma.partner.findUnique({
        where: { id },
        include: { user: { select: { id: true, isActive: true, role: true } } },
    });

    if (!partner) return NextResponse.json({ message: "Pengajuan mitra tidak ditemukan." }, { status: 404 });
    if (partner.status !== "PENDING") return NextResponse.json({ message: "Hanya pengajuan berstatus PENDING yang dapat disetujui." }, { status: 409 });

    const updated = await prisma.$transaction(async (tx) => {
        // Partner approval no longer depends on a customer User. A standalone
        // partner (userId = null, driven by MitraAccount) must still be
        // approvable. Role promotion is only a legacy compatibility step and is
        // performed solely when a linked user exists and is active.
        if (partner.user && partner.userId && partner.user.role === "customer" && partner.user.isActive !== false) {
            await tx.user.update({ where: { id: partner.userId }, data: { role: "partner" } });
        }
        return tx.partner.update({
            where: { id },
            data: { status: "ACTIVE" },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
    });

    return NextResponse.json({ message: "Mitra berhasil disetujui.", partner: updated });
}
