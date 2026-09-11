// Shared helpers, labels, and constants for the AFA STORE Kasir (POS) UI.
// TAHAP B: UI only — no transactions are created and no stock is mutated here.

export const rupiah = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
});

export type KasirPaymentMethod = "TUNAI" | "TRANSFER" | "QRIS";

export const PAYMENT_METHODS: { id: KasirPaymentMethod; label: string }[] = [
    { id: "TUNAI", label: "Tunai" },
    { id: "TRANSFER", label: "Transfer" },
    { id: "QRIS", label: "QRIS" },
];

// Sumber transaksi kasir mengacu pada kolom Order.source yang sudah disiapkan
// di tahap migrasi sebelumnya (ONLINE | TATAP_MUKA | WHATSAPP).
export const SOURCE_LABELS: Record<string, string> = {
    ONLINE: "Online",
    TATAP_MUKA: "Tatap Muka",
    WHATSAPP: "WhatsApp",
};

export function sourceLabel(source: string | null | undefined) {
    const key = String(source ?? "").toUpperCase();
    return SOURCE_LABELS[key] ?? (source ? String(source) : "-");
}

export function paymentMethodLabel(method: string | null | undefined) {
    const key = String(method ?? "").toUpperCase();
    if (key === "TUNAI" || key === "CASH") return "Tunai";
    if (key === "TRANSFER" || key === "TRANSFER_BANK" || key === "BANK_TRANSFER") return "Transfer";
    if (key === "QRIS") return "QRIS";
    if (key === "COD") return "COD";
    return method ? String(method) : "-";
}

export const STATUS_LABELS: Record<string, string> = {
    PENDING: "Menunggu",
    WAITING_PAYMENT: "Menunggu Pembayaran",
    PAID: "Lunas",
    PROCESSING: "Diproses",
    COMPLETED: "Selesai",
    CANCELLED: "Dibatalkan",
    CANCELED: "Dibatalkan",
};

export function statusLabel(status: string | null | undefined) {
    const key = String(status ?? "").toUpperCase();
    return STATUS_LABELS[key] ?? (status ? String(status) : "-");
}

export function formatDate(value: string | Date | null | undefined) {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatRupiah(price: number) {
    return `Rp ${price.toLocaleString("id-ID")}`;
}

// Client-side shape of a kasir order returned by GET /api/admin/kasir/orders/[id].
// `size` mirrors the product size captured at read time (nil if not available).
export type KasirOrderDetailItem = {
    id: string;
    name: string;
    quantity: number;
    price: number;
    subtotal: number;
    size: string | null;
    image: string | null;
};

export type KasirOrderDetail = {
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
    createdAt: string;
    items: KasirOrderDetailItem[];
};
