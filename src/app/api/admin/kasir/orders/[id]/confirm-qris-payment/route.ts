import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCashier } from "@/lib/server-auth";
import { getQrisProvider, QrisProvider } from "@/lib/qris-config";

export const runtime = "nodejs";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: orderId } = await params;
    const admin = await getCurrentCashier();
    if (!admin) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const provider = getQrisProvider();

    // Only MANUAL QRIS can be confirmed via this endpoint
    if (provider !== QrisProvider.MANUAL) {
        return NextResponse.json(
            { message: "Manual QRIS confirmation is disabled. Current provider: " + provider },
            { status: 400 }
        );
    }

    try {
        const order = await prisma.order.findFirst({
            where: { id: orderId },
            include: { payment: true },
        });

        if (!order || !order.payment) {
            return NextResponse.json({ message: "Order not found" }, { status: 404 });
        }

        // Verify this is a QRIS payment without Midtrans transaction
        if (order.paymentMethod !== "QRIS") {
            return NextResponse.json({ message: "This order was not paid with QRIS" }, { status: 400 });
        }

        // Reject if Midtrans transaction exists (prevent bypassing webhook)
        if (order.payment.transactionId || order.payment.paymentType === "qris") {
            return NextResponse.json(
                { message: "Midtrans QRIS cannot be confirmed manually. Wait for webhook." },
                { status: 400 }
            );
        }

        const payment = order.payment;

        // Idempotent: already paid?
        if (payment.status === "PAID") {
            return NextResponse.json({
                message: "Payment already confirmed",
                alreadyPaid: true,
                paidAt: payment.paidAt?.toISOString(),
            });
        }

        // Only PENDING status can be confirmed
        if (payment.status !== "PENDING") {
            return NextResponse.json(
                { message: "Payment must be in PENDING status to be confirmed" },
                { status: 400 }
            );
        }

        // Confirm payment: Update to PAID
        const now = new Date();
        await prisma.$transaction([
            prisma.payment.update({
                where: { id: payment.id },
                data: { status: "PAID", paidAt: now },
            }),
            prisma.order.update({
                where: { id: order.id },
                data: {
                    paymentStatus: "PAID",
                    status: order.status === "PENDING" ? "PROCESSING" : order.status,
                    paidAt: now,
                },
            }),
        ]);

        return NextResponse.json({
            success: true,
            message: "Payment confirmed successfully",
            orderId: order.id,
            invoice: order.invoice,
            paymentStatus: "PAID",
            orderStatus: order.status === "PENDING" ? "PROCESSING" : order.status,
            paidAt: now.toISOString(),
        });
    } catch (error) {
        console.error("manual_qris_confirm_failed", {
            route: "/api/admin/kasir/orders/[id]/confirm-qris-payment",
            category: "payment_confirmation_failure",
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
            orderId,
        });
        return NextResponse.json({ message: "Gagal mengonfirmasi pembayaran." }, { status: 500 });
    }
}
