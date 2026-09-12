import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

// SUSPENDED -> ACTIVE (admin moderation, no schema change; status is a string).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) return NextResponse.json({ message: "Mitra tidak ditemukan." }, { status: 404 });
    if (partner.status !== "SUSPENDED") return NextResponse.json({ message: "Hanya mitra berstatus DITANGGUHKAN yang dapat diaktifkan kembali." }, { status: 409 });

    const updated = await prisma.partner.update({ where: { id }, data: { status: "ACTIVE" } });

    return NextResponse.json({ message: "Mitra diaktifkan kembali.", partner: updated });
}
