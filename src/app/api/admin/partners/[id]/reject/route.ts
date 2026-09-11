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

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) return NextResponse.json({ message: "Pengajuan mitra tidak ditemukan." }, { status: 404 });
    if (partner.status !== "PENDING") return NextResponse.json({ message: "Hanya pengajuan berstatus PENDING yang dapat ditolak." }, { status: 409 });

    const updated = await prisma.partner.update({ where: { id }, data: { status: "REJECTED" } });

    return NextResponse.json({ message: "Pengajuan mitra ditolak.", partner: updated });
}
