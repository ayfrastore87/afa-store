import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { paymentTransition, type PaymentEvent } from "@/lib/payment-transition";

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

function parseIdr(value: unknown) {
    if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value.trim())) return null;
    const amount = Number(value);
    return Number.isSafeInteger(amount) ? amount : null;
}

export async function POST(request: Request) {
    try {
        const payload = (await request.json()) as MidtransNotification;
        if (!verifyMidtransSignature(payload)) {
            return NextResponse.json({ message: "Invalid Midtrans signature." }, { status: 401 });
        }

        const invoice = payload.order_id;
        if (!invoice || !/^[A-Za-z0-9_-]{1,100}$/.test(invoice)) return NextResponse.json({ message: "Invalid order_id." }, { status: 400 });
        const event: PaymentEvent | null = payload.transaction_status === "settlement" ? "settlement" : payload.transaction_status === "capture" && payload.fraud_status === "accept" ? "capture_accept" : payload.transaction_status === "expire" ? "expire" : payload.transaction_status === "cancel" || payload.transaction_status === "deny" ? "cancel" : null;
        if (event) {
            const grossAmount = parseIdr(payload.gross_amount);
            await prisma.$transaction(async (tx) => {
                const order = await tx.order.findUnique({ where: { invoice } });
                if (!order || grossAmount === null || grossAmount !== order.total) throw new Error("gross_amount_mismatch");
                const payment = await tx.payment.findUnique({ where: { orderId: order.id } });
                if (!payment) throw new Error("missing_payment");
                if (payment.amount !== grossAmount) throw new Error("payment_amount_mismatch");
                if (payment.transactionRef && payment.transactionRef !== invoice) throw new Error("transaction_identity_mismatch");
                if (payment.transactionId && payment.transactionId !== payload.transaction_id) throw new Error("transaction_identity_mismatch");
                if (payment.paymentType && payment.paymentType !== payload.payment_type) throw new Error("payment_method_mismatch");
                if (order.paymentMethod === "QRIS" && payload.payment_type !== "qris") throw new Error("payment_method_mismatch");
                const identityOwner = payload.transaction_id ? await tx.payment.findFirst({ where: { transactionId: payload.transaction_id, id: { not: payment.id } }, select: { id: true } }) : null;
                if (identityOwner) throw new Error("transaction_identity_mismatch");
                const result = paymentTransition(payment.status as never, order.status as never, event);
                if (!result.mutationAllowed) return;
                const paidAt = result.paymentStatus === "PAID" ? payment.paidAt ?? new Date() : payment.paidAt;
                const changed = await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: result.paymentStatus, transactionRef: payment.transactionRef ?? invoice, transactionId: payment.transactionId ?? payload.transaction_id, paymentType: payload.payment_type, paidAt } });
                if (!changed.count) return;
                await tx.order.update({ where: { id: order.id }, data: { paymentStatus: result.orderPaymentStatus, status: result.orderStatus, paidAt, processedAt: result.orderStatus === "PROCESSING" && order.status === "PENDING" ? new Date() : undefined } });
            });
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.warn("midtrans_webhook_rejected", { classification: error instanceof Error ? error.message : "unknown" });
        return NextResponse.json({ message: "Webhook rejected." }, { status: 400 });
    }
}