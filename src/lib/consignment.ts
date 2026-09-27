// ---------------------------------------------------------------------------
// AFA STORE — Sales & Titip Jual (consignment) pure calculation module.
//
// Every number the module persists or reports comes through these functions,
// SERVER-SIDE. Client-provided totals (closing stock, sales amount, piutang)
// are never trusted: routes recompute them here and reject inconsistencies.
// Dependency-free so node:test can import it directly.
//
// All money values are Int Rupiah — the same convention as Order.total and
// PartnerSale (no floating point).
// ---------------------------------------------------------------------------

export const CONSIGNMENT_PAYMENT_METHODS = ["CASH", "TRANSFER", "OTHER"] as const;
export type ConsignmentPaymentMethod = (typeof CONSIGNMENT_PAYMENT_METHODS)[number];

export const VISIT_STATUS_COMPLETED = "COMPLETED";
export const VISIT_STATUS_VOID = "VOID";
export const PAYMENT_STATUS_VALID = "VALID";
export const PAYMENT_STATUS_VOID = "VOID";

/** Hard per-line quantity cap: keeps arithmetic far away from 2^31 overflow. */
export const MAX_CONSIGNMENT_QUANTITY = 100_000;
/** Hard per-payment cap (Rp 1.000.000.000): same bound as partner sales. */
export const MAX_CONSIGNMENT_PAYMENT = 1_000_000_000;
/** Max item lines a single visit may carry. */
export const MAX_VISIT_ITEMS = 100;

export function isConsignmentPaymentMethod(value: unknown): value is ConsignmentPaymentMethod {
    return typeof value === "string" && (CONSIGNMENT_PAYMENT_METHODS as readonly string[]).includes(value);
}

export type VisitItemInput = {
    productId: string;
    quantitySold: number;
    quantitySupplied: number;
    quantityReturned: number;
    quantityDamaged: number;
};

export type VisitItemComputation = {
    productId: string;
    openingStock: number;
    quantitySold: number;
    quantitySupplied: number;
    quantityReturned: number;
    quantityDamaged: number;
    closingStock: number;
    unitPrice: number;
    salesAmount: number;
};

export class ConsignmentError extends Error {
    // No TS parameter-property shorthand here: node --test imports this file in
    // strip-only mode, which rejects `constructor(public readonly ...)`.
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = "ConsignmentError";
    }
}

function isQuantity(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_CONSIGNMENT_QUANTITY;
}

/**
 * The single stock formula of the module:
 *   closing = opening + supplied - sold - returned - damaged
 * Throws when any operand is negative/non-integer or the result would push the
 * store stock below zero (i.e. sold+returned+damaged exceed what is available).
 */
export function computeClosingStock(
    openingStock: number,
    quantitySupplied: number,
    quantitySold: number,
    quantityReturned: number,
    quantityDamaged: number,
): number {
    if (!isQuantity(openingStock) || !isQuantity(quantitySupplied) || !isQuantity(quantitySold) || !isQuantity(quantityReturned) || !isQuantity(quantityDamaged)) {
        throw new ConsignmentError(400, "Jumlah barang tidak valid.");
    }

    const available = openingStock + quantitySupplied;
    const removed = quantitySold + quantityReturned + quantityDamaged;

    if (removed > available) {
        throw new ConsignmentError(409, "Barang keluar melebihi stok yang tersedia di toko.");
    }

    return available - removed;
}

/**
 * Recomputes one visit line server-side. `openingStock` and `unitPrice` come
 * from the DATABASE (ConsignmentStock / Product snapshot), never the client.
 */
export function computeVisitItem(
    input: VisitItemInput,
    openingStock: number,
    unitPrice: number,
): VisitItemComputation {
    if (!Number.isInteger(unitPrice) || unitPrice < 0) {
        throw new ConsignmentError(500, "Harga produk tidak valid.");
    }

    const closingStock = computeClosingStock(
        openingStock,
        input.quantitySupplied,
        input.quantitySold,
        input.quantityReturned,
        input.quantityDamaged,
    );

    return {
        productId: input.productId,
        openingStock,
        quantitySold: input.quantitySold,
        quantitySupplied: input.quantitySupplied,
        quantityReturned: input.quantityReturned,
        quantityDamaged: input.quantityDamaged,
        closingStock,
        unitPrice,
        salesAmount: input.quantitySold * unitPrice,
    };
}

/** Server-side visit totals; ignores whatever the client claims. */
export function computeVisitTotals(items: readonly VisitItemComputation[]): {
    totalSold: number;
    totalSupplied: number;
    totalReturned: number;
    totalDamaged: number;
    salesAmount: number;
} {
    let totalSold = 0;
    let totalSupplied = 0;
    let totalReturned = 0;
    let totalDamaged = 0;
    let salesAmount = 0;

    for (const item of items) {
        totalSold += item.quantitySold;
        totalSupplied += item.quantitySupplied;
        totalReturned += item.quantityReturned;
        totalDamaged += item.quantityDamaged;
        salesAmount += item.salesAmount;
    }

    return { totalSold, totalSupplied, totalReturned, totalDamaged, salesAmount };
}

/**
 * piutang = nilai barang terjual (kunjungan VALID) - setoran VALID.
 * Clamped at zero so an overpayment never renders a negative receivable.
 */
export function computeReceivable(totalSalesAmount: number, totalPaid: number): number {
    if (!Number.isFinite(totalSalesAmount) || !Number.isFinite(totalPaid)) {
        throw new ConsignmentError(500, "Perhitungan piutang tidak valid.");
    }
    return Math.max(0, Math.round(totalSalesAmount) - Math.round(totalPaid));
}

/** A settlement amount must be a positive integer within bounds. */
export function validatePaymentAmount(amount: unknown): number {
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > MAX_CONSIGNMENT_PAYMENT) {
        throw new ConsignmentError(400, "Nominal pembayaran tidak valid.");
    }
    return amount;
}

/**
 * Structural validation for a raw visit-item payload (before any DB access).
 * Enforces quantity bounds, uniqueness per product and the line cap. Lines
 * with all-zero movement are dropped so "untouched" products cost nothing.
 */
export function parseVisitItems(raw: unknown): VisitItemInput[] {
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new ConsignmentError(400, "Minimal satu produk harus diisi.");
    }
    if (raw.length > MAX_VISIT_ITEMS) {
        throw new ConsignmentError(400, `Maksimal ${MAX_VISIT_ITEMS} produk per kunjungan.`);
    }

    const seen = new Set<string>();
    const items: VisitItemInput[] = [];

    for (const entry of raw) {
        if (typeof entry !== "object" || entry === null) {
            throw new ConsignmentError(400, "Data produk tidak valid.");
        }
        const record = entry as Record<string, unknown>;
        const productId = record.productId;
        if (typeof productId !== "string" || !productId.trim()) {
            throw new ConsignmentError(400, "Produk tidak valid.");
        }
        if (seen.has(productId)) {
            throw new ConsignmentError(400, "Produk duplikat dalam satu kunjungan.");
        }
        seen.add(productId);

        const quantitySold = record.quantitySold ?? 0;
        const quantitySupplied = record.quantitySupplied ?? 0;
        const quantityReturned = record.quantityReturned ?? 0;
        const quantityDamaged = record.quantityDamaged ?? 0;

        if (!isQuantity(quantitySold) || !isQuantity(quantitySupplied) || !isQuantity(quantityReturned) || !isQuantity(quantityDamaged)) {
            throw new ConsignmentError(400, "Jumlah barang tidak valid.");
        }

        if (quantitySold + quantitySupplied + quantityReturned + quantityDamaged === 0) continue;

        items.push({
            productId: productId.trim(),
            quantitySold,
            quantitySupplied,
            quantityReturned,
            quantityDamaged,
        });
    }

    if (items.length === 0) {
        throw new ConsignmentError(400, "Tidak ada pergerakan barang yang dicatat.");
    }

    return items;
}

/** Idempotency keys are optional but, when present, must be short and opaque. */
export function normalizeIdempotencyKey(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 128) return null;
    return trimmed;
}