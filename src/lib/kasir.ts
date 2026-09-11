import "server-only";

// ---------------------------------------------------------------------------
// Shared server-side constants and helpers for the AFA STORE Kasir (POS) API.
//
// TAHAP C: validation + read-only contracts only. These helpers never create
// transactions and never mutate stock. Atomic persistence (order + payment +
// invoice + stock decrement) is deferred to TAHAP D.
// ---------------------------------------------------------------------------

export const KASIR_SOURCES = ["TATAP_MUKA", "WHATSAPP"] as const;
export type KasirSource = (typeof KASIR_SOURCES)[number];

// Payment methods accepted by the Kasir API. These match the Kasir UI contract
// (KasirPaymentMethod). TRANSFER and QRIS are persisted with the existing
// canonical Payment.method vocabulary; TUNAI is the cash method backed by the
// Order.cashReceived / Order.change columns already present in the schema.
export const KASIR_PAYMENT_METHODS = ["TUNAI", "TRANSFER", "QRIS"] as const;
export type KasirPaymentMethod = (typeof KASIR_PAYMENT_METHODS)[number];

export const KASIR_PAYMENT_METHOD_CANONICAL: Record<KasirPaymentMethod, string> = {
    TUNAI: "TUNAI",
    TRANSFER: "TRANSFER_BANK",
    QRIS: "QRIS",
};

// Defensive bounds so a single line item can never produce an absurd quantity
// or overflow a monetary computation.
export const MAX_KASIR_QUANTITY = 999;
export const MAX_KASIR_ITEMS = 100;

export function isKasirSource(value: unknown): value is KasirSource {
    return typeof value === "string" && (KASIR_SOURCES as readonly string[]).includes(value);
}

export function isKasirPaymentMethod(value: unknown): value is KasirPaymentMethod {
    return typeof value === "string" && (KASIR_PAYMENT_METHODS as readonly string[]).includes(value);
}

// Structural serialization for a kasir order read (used by GET list + detail).
type KasirOrderItem = {
    id: string;
    name: string;
    quantity: number;
    price: number;
    subtotal: number;
    product: { image: string | null; size: string | null } | null;
};

type KasirOrderRecord = {
    id: string;
    invoice: string;
    customer: string;
    phone: string;
    source: string;
    paymentMethod: string;
    paymentStatus: string;
    status: string;
    subtotal: number;
    total: number;
    cashReceived: number | null;
    change: number | null;
    createdAt: Date;
    items: KasirOrderItem[];
    payment: { status: string; method: string } | null;
};

export function formatKasirOrder(order: KasirOrderRecord) {
    return {
        id: order.id,
        invoice: order.invoice,
        customer: order.customer,
        phone: order.phone,
        source: order.source,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.payment?.status ?? order.paymentStatus,
        status: order.status,
        subtotal: order.subtotal,
        total: order.total,
        cashReceived: order.cashReceived,
        change: order.change,
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.subtotal,
            size: item.product?.size ?? null,
            image: item.product?.image ?? null,
        })),
    };
}
