// Shared types, labels, and formatters for the AFA STORE partner dashboard
// (Tahap IV). Pure client-side helpers — no data fetching or mutation here.

export const rupiah = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
});

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
    }).format(date);
}

export type PartnerProduct = {
    productId: string;
    name: string;
    price: number;
    costPrice: number;
    partnerStock: number;
    size: string | null;
    flavor: string | null;
    image: string | null;
};

export type StockRow = {
    productId: string;
    name: string;
    image: string | null;
    quantity: number;
    unitCost: number;
    updatedAt: string;
};

export type StockMovement = {
    id: string;
    productId: string | null;
    productName: string;
    type: string;
    quantity: number;
    unitPrice: number | null;
    referenceType: string | null;
    referenceId: string | null;
    note: string | null;
    createdAt: string;
};

export type SaleItem = {
    productId: string | null;
    name: string;
    quantity: number;
    sellingPrice: number;
    subtotalRevenue: number;
};

export type SaleRow = {
    id: string;
    saleNumber: string;
    soldAt: string;
    subtotal: number;
    total: number;
    grossProfit: number;
    status: string;
    note: string | null;
    itemCount: number;
    items: SaleItem[];
};

export type DashboardSummary = {
    today: { revenue: number; count: number };
    month: { revenue: number; count: number; grossProfit: number };
    stock: { totalUnits: number; skuCount: number; inStock: number; lowStock: number; outOfStock: number };
    recentSales: {
        id: string;
        saleNumber: string;
        soldAt: string;
        total: number;
        grossProfit: number;
        itemCount: number;
    }[];
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    IN: "Stok Masuk",
    OUT: "Stok Keluar",
};

export const movementTypeLabel = (type: string) => MOVEMENT_TYPE_LABELS[type] ?? type;

// ---------------------------------------------------------------------------
// Stock status is a pure UI/read model (Tahap VII §19-20). It is derived from
// PartnerStock.quantity and never persisted. The 0 and 5 boundaries mirror
// PARTNER_LOW_STOCK_THRESHOLD on the server so the summary and the stock list
// render identical buckets.
// ---------------------------------------------------------------------------
export const PARTNER_LOW_STOCK_DISPLAY_THRESHOLD = 5;

export const PARTNER_STOCK_STATUS_LABELS = {
    HABIS: "Habis",
    MENIPIS: "Menipis",
    TERSEDIA: "Tersedia",
} as const;

export type PartnerStockStatus = keyof typeof PARTNER_STOCK_STATUS_LABELS;

export function getPartnerStockStatus(quantity: number): PartnerStockStatus {
    if (quantity <= 0) return "HABIS";
    if (quantity <= PARTNER_LOW_STOCK_DISPLAY_THRESHOLD) return "MENIPIS";
    return "TERSEDIA";
}

// PartnerStockMovement.referenceType display labels. The schema stores these as
// free text (no enum); the authoritative constants live server-side in
// lib/partner-dashboard.ts. This map is for rendering only.
export const PARTNER_REFERENCE_LABELS: Record<string, string> = {
    TRANSFER_IN: "Transfer Masuk",
    MANUAL: "Penyesuaian",
    SALE: "Penjualan",
};

export const referenceLabel = (type: string | null) => (type ? PARTNER_REFERENCE_LABELS[type] ?? type : "-");
