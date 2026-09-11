import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { formatKasirOrder, KASIR_SOURCES } from "@/lib/kasir";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/admin/kasir/orders/[id]
//
// Admin-only. Returns a single kasir order only when its source is TATAP_MUKA
// or WHATSAPP. ONLINE orders are treated as not found (404).
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const order = await prisma.order.findFirst({
        where: { id, source: { in: [...KASIR_SOURCES] } },
        include: {
            items: { include: { product: { select: { image: true, size: true } } } },
            payment: { select: { status: true, method: true } },
        },
    });

    if (!order) {
        return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json({ order: formatKasirOrder(order) });
}
