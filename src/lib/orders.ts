export const ORDER_STATUSES = ["PENDING", "PROCESSING", "PACKED", "SHIPPED", "COMPLETED", "CANCELLED"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusLabels: Record<string, string> = {
    pending: "Belum Bayar",
    PENDING: "Belum Bayar",
    processing: "Diproses",
    PROCESSING: "Diproses",
    packed: "Dikemas",
    PACKED: "Dikemas",
    shipped: "Dikirim",
    SHIPPED: "Dikirim",
    completed: "Selesai",
    COMPLETED: "Selesai",
    cancelled: "Dibatalkan",
    CANCELLED: "Dibatalkan",
};

export function formatOrderInvoice(date = new Date(), sequence = 1) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `AFA-${yyyy}${mm}${dd}-${String(sequence).padStart(6, "0")}`;
}

export function getInvoicePrefix(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `AFA-${yyyy}${mm}${dd}-`;
}
