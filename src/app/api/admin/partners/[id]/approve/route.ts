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
    if (!partner.user || partner.user.isActive === false) return NextResponse.json({ message: "Akun pengguna tidak aktif atau tidak ditemukan." }, { status: 409 });

    const updated = await prisma.$transaction(async (tx) => {
        // Only promote role for users who are still plain customers. Admins keep
        // their role; the ACTIVE partner record is the authorization source.
        if (partner.user.role === "customer") {
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
