import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

// REJECTED -> PENDING (admin can re-open a rejected application, no schema change).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) return NextResponse.json({ message: "Mitra tidak ditemukan." }, { status: 404 });
    if (partner.status !== "REJECTED") return NextResponse.json({ message: "Hanya mitra berstatus DITOLAK yang dapat ditinjau ulang." }, { status: 409 });

    const updated = await prisma.partner.update({ where: { id }, data: { status: "PENDING" } });

    return NextResponse.json({ message: "Pengajuan dibuka kembali untuk ditinjau.", partner: updated });
}
