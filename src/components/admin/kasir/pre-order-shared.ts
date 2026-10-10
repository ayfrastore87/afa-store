// Client-side shapes + pure receipt mapping for the kasir Pre-Order panel.
// Mirrors serializePreOrder() in src/lib/pre-order.ts (server) — no Prisma here.

import type { ReceiptData } from "@/lib/thermal-printer/printer-types";
import { preOrderKindLabel, preOrderPaymentStatusLabel, preOrderReceiptTitle } from "@/lib/pre-order-core";
import { formatDate, formatRupiah, paymentMethodLabel } from "./kasir-shared";

export type PreOrderPaymentView = {
    id: string;
    sequence: number;
    amount: number;
    method: string;
    kind: string;
    status: string;
    cashReceived: number | null;
    change: number | null;
    qrisUrl: string | null;
    transactionRef: string | null;
    expiredAt: string | null;
    verifiedAt: string | null;
    note: string | null;
    createdAt: string;
};

export type PreOrderView = {
    id: string;
    poNumber: string;
    customer: string;
    phone: string;
    note: string | null;
    pickupDate: string | null;
    subtotal: number;
    discount: number;
    total: number;
    status: string;
    paymentStatus: string;
    source: string;
    paid: number;
    pending: number;
    remaining: number;
    handedOverAt: string | null;
    cancelledAt: string | null;
    readyAt: string | null;
    createdAt: string;
    updatedAt: string;
    items: { id: string; productId: string | null; name: string; notes: string | null; quantity: number; price: number; subtotal: number }[];
    payments: PreOrderPaymentView[];
};

export const PRE_ORDER_STATUS_BADGE: Record<string, string> = {
    DRAFT: "bg-neutral-200 text-neutral-700",
    CONFIRMED: "bg-sky-100 text-sky-800",
    READY_FOR_PICKUP: "bg-amber-100 text-amber-800",
    HANDED_OVER: "bg-emerald-100 text-emerald-800",
    CANCELLED: "bg-red-100 text-red-700",
};

export const PRE_ORDER_PAYMENT_BADGE: Record<string, string> = {
    UNPAID: "bg-red-100 text-red-700",
    PARTIAL: "bg-amber-100 text-amber-800",
    PAID: "bg-emerald-100 text-emerald-800",
};

/** Cumulative VERIFIED amount up to and including `payment` (ledger order). */
export function paidThrough(preOrder: Pick<PreOrderView, "payments">, payment: Pick<PreOrderPaymentView, "sequence">) {
    return preOrder.payments.filter((row) => row.status === "VERIFIED" && row.sequence <= payment.sequence).reduce((sum, row) => sum + row.amount, 0);
}

/**
 * Builds the thermal/browser receipt for ONE PO payment. The DP/cicilan receipt
 * shows amount paid now, accumulated and remaining; a settlement receipt shows
 * LUNAS. Pure so the layout is unit-testable.
 */
export function toPreOrderReceiptData(preOrder: PreOrderView, payment: PreOrderPaymentView, cashierName?: string | null): ReceiptData {
    const paidSoFar = paidThrough(preOrder, payment);
    const remaining = Math.max(preOrder.total - paidSoFar, 0);
    const statusAfter = paidSoFar >= preOrder.total ? "PAID" : paidSoFar > 0 ? "PARTIAL" : "UNPAID";
    const isTunai = payment.method === "TUNAI";
    const extra: Array<[string, string]> = [
        ["Jenis", preOrderKindLabel(payment.kind)],
        ["Dibayar Sekarang", formatRupiah(payment.amount)],
        ["Total Dibayar", formatRupiah(paidSoFar)],
        ["Sisa Tagihan", formatRupiah(remaining)],
    ];
    if (preOrder.pickupDate) extra.push(["Tgl Ambil", formatDate(preOrder.pickupDate)]);
    return {
        storeName: "AFA_STORE",
        title: preOrderReceiptTitle(payment.kind, statusAfter),
        invoice: `${preOrder.poNumber} #${payment.sequence}`,
        date: formatDate(payment.verifiedAt ?? payment.createdAt),
        customer: preOrder.customer || "-",
        phone: preOrder.phone || null,
        cashier: cashierName || null,
        items: preOrder.items.map((item) => ({
            name: item.name,
            size: item.notes,
            quantity: item.quantity,
            priceLabel: formatRupiah(item.price),
            subtotalLabel: formatRupiah(item.subtotal),
        })),
        subtotalLabel: formatRupiah(preOrder.subtotal),
        shippingLabel: null,
        totalLabel: formatRupiah(preOrder.total),
        paymentMethod: paymentMethodLabel(payment.method),
        paymentStatus: preOrderPaymentStatusLabel(statusAfter),
        cashReceivedLabel: isTunai && payment.cashReceived != null ? formatRupiah(payment.cashReceived) : null,
        changeLabel: isTunai && payment.change != null ? formatRupiah(payment.change) : null,
        extraPaymentRows: extra,
        delivery: null,
        footer: statusAfter === "PAID" ? ["LUNAS - Terima kasih", "AFA STORE"] : ["Simpan struk ini untuk pelunasan", "AFA STORE"],
        storeAddress: ["WA 087770000883", "afastore.online"],
    };
}

export function newIdempotencyKey() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
