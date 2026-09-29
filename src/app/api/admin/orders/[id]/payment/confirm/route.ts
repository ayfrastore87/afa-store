import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

const CANONICAL_COD_METHODS = new Set(["TUNAI"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const order = await prisma.order.findUnique({
        where: { id },
        include: { payment: true },
    });

    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

    const paymentMethod = (order.paymentMethod || "").trim().toUpperCase();
    if (!CANONICAL_COD_METHODS.has(paymentMethod)) {
        return NextResponse.json(
            { message: "Konfirmasi pembayaran hanya dapat dilakukan untuk pesanan dengan metode COD (TUNAI)." },
            { status: 409 }
        );
    }

    if ((order.paymentStatus ?? "").toUpperCase() === "PAID") {
        return NextResponse.json({
            success: true,
            message: "Pembayaran COD sudah dikonfirmasi sebelumnya.",
            orderId: order.id,
            invoice: order.invoice,
            paymentStatus: "PAID",
            paidAt: order.paidAt?.toISOString(),
        });
    }

    const now = new Date();

    const result = await prisma.$transaction([
        prisma.order.update({
            where: { id },
            data: {
                paymentStatus: "PAID",
                paidAt: now,
            },
        }),
        prisma.payment.update({
            where: { orderId: id },
            data: {
                status: "PAID",
                paidAt: now,
            },
        }),
    ]);

    const [updatedOrder] = result;

    return NextResponse.json({
        success: true,
        message: "Pembayaran COD berhasil dikonfirmasi.",
        orderId: order.id,
        invoice: order.invoice,
        paymentStatus: "PAID",
        paidAt: now.toISOString(),
        updated: {
            orderId: updatedOrder.id,
            paymentStatus: updatedOrder.paymentStatus,
            paidAt: updatedOrder.paidAt?.toISOString(),
        },
    });
}
