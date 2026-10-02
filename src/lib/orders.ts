export const ORDER_STATUSES = ["PENDING", "PROCESSING", "PACKED", "SHIPPED", "COMPLETED", "CANCELLED"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const BiteshipShippingStatuses = new Set(["picking_up", "picked", "in_transit", "dropping_off", "pickingup", "intransit", "droppingoff"]);
const BiteshipDeliveredStatuses = new Set(["delivered"]);

/** Projects an already persisted, machine-readable provider state to the order lifecycle. */
export function orderStatusFromBiteship(status: unknown, current: unknown): "SHIPPED" | "COMPLETED" | null {
    const value = typeof status === "string" ? status.trim().toLowerCase() : "";
    const existing = typeof current === "string" ? current.trim().toUpperCase() : "";
    if (existing === "COMPLETED" || existing === "CANCELLED") return null;
    if (BiteshipDeliveredStatuses.has(value)) return "COMPLETED";
    if (BiteshipShippingStatuses.has(value) && existing !== "SHIPPED") return "SHIPPED";
    return null;
}

export const orderStatusLabels: Record<string, string> = {
    pending: "Belum Bayar",
    PENDING: "Belum Bayar",
    processing: "Diproses",
    PROCESSING: "Diproses",
    packed: "Dikemas",
    PACKED: "Dikemas",
    shipped: "Sudah Dikirim",
    SHIPPED: "Sudah Dikirim",
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
