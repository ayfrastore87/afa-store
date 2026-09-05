import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMidtransSignature } from "@/lib/midtrans";

export const runtime = "nodejs";

type MidtransNotification = {
    order_id?: string;
    transaction_id?: string;
    transaction_status?: string;
    fraud_status?: string;
    payment_type?: string;
    gross_amount?: string;
    status_code?: string;
    signature_key?: string;
};

export async function POST(request: Request) {
    try {
        const payload = (await request.json()) as MidtransNotification;
        if (!verifyMidtransSignature(payload)) {
            return NextResponse.json({ message: "Invalid Midtrans signature." }, { status: 401 });
        }

        const invoice = payload.order_id;
        if (!invoice) return NextResponse.json({ message: "Missing order_id." }, { status: 400 });

        const status = payload.transaction_status;
        const isPaid = status === "settlement" || (status === "capture" && payload.fraud_status === "accept");
        const isExpired = status === "expire";
        const isCancelled = status === "cancel" || status === "deny";
        const nextStatus = isPaid ? "PAID" : isExpired ? "EXPIRED" : isCancelled ? "CANCELLED" : null;

        if (nextStatus) {
            const terminalStatuses = ["PAID", "EXPIRED", "CANCELLED"];
            const paidAt = nextStatus === "PAID" ? new Date() : undefined;
            await prisma.$transaction(async (tx) => {
                const order = await tx.order.findUnique({ where: { invoice }, select: { id: true } });
                if (!order) return;
                const changed = await tx.order.updateMany({
                    where: { id: order.id, status: { notIn: terminalStatuses }, paymentStatus: { notIn: terminalStatuses } },
                    data: { status: nextStatus, paymentStatus: nextStatus, paidAt },
                });
                if (!changed.count) return;
                await tx.payment.updateMany({
                    where: { orderId: order.id, status: { notIn: terminalStatuses } },
                    data: {
                        status: nextStatus,
                        transactionId: payload.transaction_id ?? undefined,
                        paymentType: payload.payment_type ?? undefined,
                        paidAt,
                    },
                });
            });
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Midtrans webhook Error:", error);
        return NextResponse.json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}