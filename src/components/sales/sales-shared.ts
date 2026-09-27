// Shared labels and formatting for the AFA STORE Sales & Titip Jual UI.
// Display-only helpers — every authoritative calculation stays server-side in
// src/lib/consignment.ts.

export function formatRupiah(price: number) {
    return `Rp ${price.toLocaleString("id-ID")}`;
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
        timeZone: "Asia/Jakarta",
    }).format(date);
}

export function formatDateShort(value: string | Date | null | undefined) {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
    }).format(date);
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH: "Tunai",
    TRANSFER: "Transfer",
    OTHER: "Lainnya",
};

export function paymentMethodLabel(method: string | null | undefined) {
    const key = String(method ?? "").toUpperCase();
    return PAYMENT_METHOD_LABELS[key] ?? (method ? String(method) : "-");
}