import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { getQrisProvider, QrisProvider } from "@/lib/qris-config";
import { paymentTransition } from "@/lib/payment-transition";

export const runtime = "nodejs";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: orderId } = await params;
    const admin = await getCurrentAdmin();
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

        // Midtrans ownership is established by stored provider metadata. Do not
        // use paymentType alone: Midtrans's QRIS value (`qris`) is also a
        // legitimate generic payment type and is not sufficient provenance.
        if (order.payment.transactionId || order.payment.transactionRef || order.payment.qrisUrl) {
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
                orderStatus: order.status,
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

        const transition = paymentTransition(
            payment.status as "PENDING" | "PAID" | "EXPIRED" | "CANCELLED",
            order.status.toUpperCase() as "PENDING" | "PROCESSING" | "PACKED" | "SHIPPED" | "COMPLETED" | "CANCELLED",
            "settlement",
        );
        if (!transition.mutationAllowed) {
            return NextResponse.json({ message: "Payment requires reconciliation" }, { status: 409 });
        }

        // Confirm payment atomically. The conditional payment update is the
        // compare-and-set that makes browser/network retries harmless.
        const now = new Date();
        const updatedOrder = await prisma.$transaction(async (tx) => {
            const changed = await tx.payment.updateMany({
                where: { id: payment.id, status: "PENDING" },
                data: { status: "PAID", paidAt: now },
            });
            if (!changed.count) return tx.order.findUniqueOrThrow({ where: { id: order.id } });
            const wasPending = order.status.toUpperCase() === "PENDING";
            return tx.order.update({
                where: { id: order.id },
                data: {
                    paymentStatus: "PAID",
                    status: transition.orderStatus,
                    paidAt: now,
                    processedAt: wasPending ? now : undefined,
                },
            });
        });

        return NextResponse.json({
            success: true,
            message: "Payment confirmed successfully",
            orderId: order.id,
            invoice: order.invoice,
            paymentStatus: "PAID",
            orderStatus: updatedOrder.status,
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
