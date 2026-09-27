import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    try {
        const { id } = await params;
        const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payment: { select: { status: true, method: true } } } });
        if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
        return NextResponse.json({ order });
    } catch (error) {
        console.error("Get order detail error:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const result = await prisma.order.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (result.count === 0) {
        const existing = await prisma.order.findUnique({ where: { id }, select: { id: true } });
        if (!existing) return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
        return NextResponse.json({ message: "Pesanan sudah diarsipkan." }, { status: 409 });
    }
    return NextResponse.json({ message: "Pesanan diarsipkan. Histori dan laporan tetap dipertahankan." });
}