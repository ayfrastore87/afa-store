// Shared helpers, labels, and constants for the AFA STORE Kasir (POS) UI.
// TAHAP B: UI only — no transactions are created and no stock is mutated here.

import type { KasirDeliveryTimeline } from "@/lib/kasir-delivery";

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
    TATAP_MUKA: "COD",
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
    /** Ongkir actually charged (0 for a pickup order). */
    shipping: number;
    total: number;
    cashReceived: number | null;
    change: number | null;
    createdAt: string;
    /** JENIS PESANAN, derived server-side from the persisted Order shipping fields. */
    orderType: KasirOrderType;
    /** PENGIRIMAN data, or null for a pickup order. Public data only. */
    delivery: KasirDeliveryDetail | null;
    items: KasirOrderDetailItem[];
};

/**
 * JENIS PESANAN. Kept separate from `source` (COD / WhatsApp): the transaction
 * source never represents the courier or the fulfilment type.
 */
export type KasirOrderType = "PICKUP" | "DELIVERY";

/** Normalized delivery status shown in the UI, with the raw provider status preserved. */
export type KasirDeliveryStatusView = {
    key: string;
    label: string;
    raw: string;
    known: boolean;
};

/**
 * Delivery data returned by GET /api/admin/kasir/orders/[id]. It deliberately carries NO
 * internal identifier (Biteship area id, quote ref, provider order id or coordinates):
 * the same payload feeds the on-screen struk, so a receipt structurally cannot leak them.
 */
export type KasirDeliveryDetail = {
    recipientName: string;
    recipientPhone: string;
    address: string;
    note: string | null;
    shipping: number;
    courier: string | null;
    service: string | null;
    status: KasirDeliveryStatusView;
    /**
     * Tahapan pengiriman yang benar-benar sudah dilalui, diturunkan server-side dari
     * status provider yang tersimpan (src/lib/kasir-delivery.ts). Tidak ada tahap yang
     * dihitung di browser, jadi timeline tidak pernah mendahului provider.
     */
    timeline: KasirDeliveryTimeline;
    hasShipment: boolean;
    trackingId: string | null;
    labelUrl: string | null;
    /** Persisted timestamp of the last stored shipment/order state (ISO string). */
    lastUpdatedAt: string | null;
    shipmentAction: { canCreate: boolean; canRefresh: boolean; label: string; hint: string };
    destination: {
        province: string | null;
        city: string | null;
        district: string | null;
        village: string | null;
        postalCode: string | null;
    };
};

/** Delivery status badge colors, keyed by the normalized status key. */
export const DELIVERY_STATUS_BADGE: Record<string, string> = {
    MENUNGGU_PENGIRIMAN: "bg-amber-100 text-amber-800",
    KURIR_DICARI: "bg-sky-100 text-sky-800",
    DIPROSES: "bg-sky-100 text-sky-800",
    KURIR_MENUJU_PICKUP: "bg-indigo-100 text-indigo-800",
    PESANAN_DIAMBIL: "bg-indigo-100 text-indigo-800",
    DALAM_PENGIRIMAN: "bg-[#184D47] text-white",
    TERKIRIM: "bg-emerald-100 text-emerald-800",
    DIKEMBALIKAN: "bg-orange-100 text-orange-800",
    DITAHAN: "bg-orange-100 text-orange-800",
    GAGAL: "bg-red-100 text-red-700",
    TIDAK_DIKENAL: "bg-neutral-200 text-neutral-700",
};

export function deliveryStatusBadgeClass(key: string | null | undefined) {
    return DELIVERY_STATUS_BADGE[String(key ?? "")] ?? DELIVERY_STATUS_BADGE.TIDAK_DIKENAL;
}
