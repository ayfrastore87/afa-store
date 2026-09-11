import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

const CANCELLABLE_STATUSES = ["PENDING", "pending"];

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const order = await prisma.order.findFirst({ where: { id, userId: user.id } });
    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

    if (order.status === "CANCELLED") {
        return NextResponse.json({ success: true, message: "Pesanan berhasil dibatalkan." });
    }

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
        return NextResponse.json({ message: "Pesanan ini tidak dapat dibatalkan." }, { status: 409 });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
        const changed = await tx.order.updateMany({
            where: { id, userId: user.id, status: { in: CANCELLABLE_STATUSES } },
            data: { status: "CANCELLED", paymentStatus: "CANCELLED", cancelledAt: now },
        });
        if (!changed.count) throw new Error("order_no_longer_cancellable");
        await tx.payment.updateMany({ where: { orderId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
    });

    return NextResponse.json({ success: true, message: "Pesanan berhasil dibatalkan." });
}
