import { prisma } from "@/lib/prisma";

export const PAYMENT_STATUSES = ["Pending", "Paid", "Expired", "Cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["QRIS", "TRANSFER_BANK", "COD", "MIDTRANS", "TRIPAY", "XENDIT"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentStatus(value: string): value is PaymentStatus {
    return PAYMENT_STATUSES.includes(value as PaymentStatus);
}

export function isPaymentMethod(value: string): value is PaymentMethod {
    return PAYMENT_METHODS.includes(value as PaymentMethod);
}

export async function syncOrderPaymentByInvoice(invoice: string) {
    const order = await prisma.order.findUnique({ where: { invoice } });
    if (!order) return null;

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    if (!payment) return { order, payment: null };

    const shouldMarkPaid = payment.status === "Paid";

    const updatedOrder = shouldMarkPaid
        ? await prisma.order.update({
            where: { id: order.id },
            data: {
                paymentStatus: "PAID",
                status: order.status === "PENDING" ? "PROCESSING" : order.status,
                paidAt: payment.paidAt ?? order.paidAt ?? new Date(),
            },
        })
        : order;

    return { order: updatedOrder, payment };
}
