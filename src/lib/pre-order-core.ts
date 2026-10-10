// ---------------------------------------------------------------------------
// Pre-Order (PO) core rules — PURE and dependency-free (no Prisma, no React).
//
// Single source of truth for every PO money/status decision so the admin API,
// the kasir API, the receipt and the report can never disagree:
//   - paid amount   = sum of VERIFIED ledger rows only (PENDING never counts)
//   - remaining     = total - paid (never negative)
//   - paymentStatus = UNPAID | PARTIAL | PAID, derived — never trusted from input
//   - payment kind  = DP | INSTALLMENT | SETTLEMENT, decided by the server from
//                     how much is already verified and how much is being paid
//   - overpayment is rejected before any row is written
//   - handover requires PAID and a non-terminal status
// ---------------------------------------------------------------------------

export const PRE_ORDER_STATUSES = ["DRAFT", "CONFIRMED", "READY_FOR_PICKUP", "HANDED_OVER", "CANCELLED"] as const;
export type PreOrderStatus = (typeof PRE_ORDER_STATUSES)[number];

export const PRE_ORDER_PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID"] as const;
export type PreOrderPaymentStatus = (typeof PRE_ORDER_PAYMENT_STATUSES)[number];

export const PRE_ORDER_SOURCES = ["ADMIN_MANUAL", "WEBSITE", "KASIR"] as const;
export type PreOrderSource = (typeof PRE_ORDER_SOURCES)[number];

export const PRE_ORDER_PAYMENT_METHODS = ["TUNAI", "QRIS", "TRANSFER_BANK"] as const;
export type PreOrderPaymentMethod = (typeof PRE_ORDER_PAYMENT_METHODS)[number];

export const PRE_ORDER_PAYMENT_KINDS = ["DP", "INSTALLMENT", "SETTLEMENT"] as const;
export type PreOrderPaymentKind = (typeof PRE_ORDER_PAYMENT_KINDS)[number];

export const PRE_ORDER_LEDGER_STATUSES = ["PENDING", "VERIFIED", "CANCELLED", "EXPIRED"] as const;
export type PreOrderLedgerStatus = (typeof PRE_ORDER_LEDGER_STATUSES)[number];

/** Statuses from which a PO can no longer receive payments or change. */
export const PRE_ORDER_TERMINAL_STATUSES: readonly PreOrderStatus[] = ["HANDED_OVER", "CANCELLED"];

/** PO number: PO-YYYYMMDD-XXXX (daily sequence, zero padded). */
export function getPreOrderNumberPrefix(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `PO-${yyyy}${mm}${dd}-`;
}

export function formatPreOrderNumber(date = new Date(), sequence = 1) {
    return `${getPreOrderNumberPrefix(date)}${String(sequence).padStart(4, "0")}`;
}

export function isPreOrderStatus(value: unknown): value is PreOrderStatus {
    return typeof value === "string" && (PRE_ORDER_STATUSES as readonly string[]).includes(value);
}

export function isPreOrderPaymentMethod(value: unknown): value is PreOrderPaymentMethod {
    return typeof value === "string" && (PRE_ORDER_PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Normalizes loose client labels ("Tunai", "cash", "TRANSFER") to the ledger method. */
export function normalizePreOrderPaymentMethod(value: unknown): PreOrderPaymentMethod | null {
    const key = String(value ?? "").trim().toUpperCase();
    if (key === "TUNAI" || key === "CASH") return "TUNAI";
    if (key === "QRIS") return "QRIS";
    if (key === "TRANSFER" || key === "TRANSFER_BANK" || key === "BANK_TRANSFER") return "TRANSFER_BANK";
    return null;
}

export function isPositiveInt(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// ─── Items / totals ──────────────────────────────────────────────────────────

export type PreOrderItemInput = {
    productId?: string | null;
    name: string;
    notes?: string | null;
    quantity: number;
    price: number;
};

export type PreOrderItemSnapshot = PreOrderItemInput & { subtotal: number };

export const PRE_ORDER_MAX_ITEMS = 50;
export const PRE_ORDER_MAX_QTY = 1_000;
export const PRE_ORDER_MAX_PRICE = 100_000_000;

/**
 * Validates and snapshots items with server-computed subtotals. Returns an
 * error string (Bahasa) when invalid. Catalog prices are resolved by the API
 * from the DB before this is called, so client prices are never trusted there.
 */
export function buildPreOrderItems(raw: unknown, options: { allowZeroTotal?: boolean } = {}): { ok: true; items: PreOrderItemSnapshot[]; subtotal: number } | { ok: false; message: string } {
    if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: "Minimal satu item pre-order diperlukan." };
    if (raw.length > PRE_ORDER_MAX_ITEMS) return { ok: false, message: `Maksimal ${PRE_ORDER_MAX_ITEMS} item per pre-order.` };
    const items: PreOrderItemSnapshot[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") return { ok: false, message: "Item pre-order tidak valid." };
        const row = entry as Record<string, unknown>;
        const name = typeof row.name === "string" ? row.name.trim() : "";
        if (!name || name.length > 160) return { ok: false, message: "Nama item wajib diisi (maks. 160 karakter)." };
        const quantity = Number(row.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > PRE_ORDER_MAX_QTY) return { ok: false, message: `Jumlah item "${name}" tidak valid.` };
        const price = Number(row.price);
        if (!Number.isSafeInteger(price) || price < 0 || price > PRE_ORDER_MAX_PRICE) return { ok: false, message: `Harga item "${name}" tidak valid.` };
        const notes = typeof row.notes === "string" && row.notes.trim() ? row.notes.trim().slice(0, 300) : null;
        const productId = typeof row.productId === "string" && row.productId.trim() ? row.productId.trim() : null;
        items.push({ productId, name, notes, quantity, price, subtotal: quantity * price });
    }
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    if (!options.allowZeroTotal && subtotal <= 0) return { ok: false, message: "Total pre-order harus lebih dari Rp 0." };
    return { ok: true, items, subtotal };
}

export function computePreOrderTotal(subtotal: number, discount: number) {
    const safeDiscount = Number.isSafeInteger(discount) && discount > 0 ? Math.min(discount, subtotal) : 0;
    return { discount: safeDiscount, total: subtotal - safeDiscount };
}

// ─── Ledger summary ──────────────────────────────────────────────────────────

export type LedgerRow = { amount: number; status: string };

export type PreOrderPaymentSummary = {
    total: number;
    paid: number;
    pending: number;
    remaining: number;
    paymentStatus: PreOrderPaymentStatus;
};

/** Only VERIFIED rows count as paid. PENDING is reported separately and never reduces `remaining`. */
export function computePaymentSummary(total: number, ledger: readonly LedgerRow[]): PreOrderPaymentSummary {
    let paid = 0;
    let pending = 0;
    for (const row of ledger) {
        if (row.status === "VERIFIED") paid += row.amount;
        else if (row.status === "PENDING") pending += row.amount;
    }
    const remaining = Math.max(total - paid, 0);
    const paymentStatus: PreOrderPaymentStatus = paid <= 0 ? "UNPAID" : paid >= total ? "PAID" : "PARTIAL";
    return { total, paid, pending, remaining, paymentStatus };
}

/** DP = first money in; SETTLEMENT = this payment clears the balance; otherwise INSTALLMENT. */
export function determinePaymentKind(total: number, alreadyPaid: number, amount: number): PreOrderPaymentKind {
    if (alreadyPaid + amount >= total) return "SETTLEMENT";
    return alreadyPaid <= 0 ? "DP" : "INSTALLMENT";
}

export type PaymentAttemptDecision =
    | { ok: true; kind: PreOrderPaymentKind; remainingAfter: number }
    | { ok: false; code: "INVALID_AMOUNT" | "OVERPAYMENT" | "ALREADY_PAID" | "PO_CLOSED"; message: string };

/**
 * Decides whether a payment attempt may be recorded. Pure so it can be unit
 * tested; the DB layer re-evaluates it under an advisory lock so two parallel
 * attempts can never both pass.
 */
export function evaluatePaymentAttempt(input: {
    status: string;
    total: number;
    alreadyPaid: number;
    amount: number;
}): PaymentAttemptDecision {
    if (PRE_ORDER_TERMINAL_STATUSES.includes(input.status as PreOrderStatus) || input.status === "DRAFT") {
        return { ok: false, code: "PO_CLOSED", message: "Pre-order ini tidak dapat menerima pembayaran." };
    }
    if (!isPositiveInt(input.amount)) return { ok: false, code: "INVALID_AMOUNT", message: "Nominal pembayaran harus lebih dari Rp 0." };
    const remaining = input.total - input.alreadyPaid;
    if (remaining <= 0) return { ok: false, code: "ALREADY_PAID", message: "Pre-order sudah lunas." };
    if (input.amount > remaining) {
        return { ok: false, code: "OVERPAYMENT", message: `Nominal melebihi sisa tagihan (maks. Rp ${remaining.toLocaleString("id-ID")}).` };
    }
    return { ok: true, kind: determinePaymentKind(input.total, input.alreadyPaid, input.amount), remainingAfter: remaining - input.amount };
}

/** Tunai: cashReceived must cover the amount; change = cashReceived - amount. */
export function computeCashChange(amount: number, cashReceived: unknown): { ok: true; cashReceived: number; change: number } | { ok: false; message: string } {
    const received = cashReceived == null || cashReceived === "" ? amount : Number(cashReceived);
    if (!Number.isSafeInteger(received) || received < amount) return { ok: false, message: "Uang diterima kurang dari nominal pembayaran." };
    return { ok: true, cashReceived: received, change: received - amount };
}

// ─── Status transitions ──────────────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<PreOrderStatus, readonly PreOrderStatus[]> = {
    DRAFT: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["READY_FOR_PICKUP", "CANCELLED"],
    READY_FOR_PICKUP: ["HANDED_OVER", "CONFIRMED", "CANCELLED"],
    HANDED_OVER: [],
    CANCELLED: [],
};

export function canTransitionPreOrder(from: string, to: string): boolean {
    if (!isPreOrderStatus(from) || !isPreOrderStatus(to)) return false;
    return STATUS_TRANSITIONS[from].includes(to);
}

export type HandoverDecision = { ok: true } | { ok: false; code: "NOT_PAID" | "ALREADY_HANDED_OVER" | "CANCELLED" | "INVALID_STATUS"; message: string };

/** Serah terima hanya saat LUNAS (dari ledger VERIFIED) dan status belum terminal. */
export function evaluateHandover(status: string, summary: Pick<PreOrderPaymentSummary, "paymentStatus">): HandoverDecision {
    if (status === "HANDED_OVER") return { ok: false, code: "ALREADY_HANDED_OVER", message: "Pre-order sudah diserahkan." };
    if (status === "CANCELLED") return { ok: false, code: "CANCELLED", message: "Pre-order sudah dibatalkan." };
    if (status !== "CONFIRMED" && status !== "READY_FOR_PICKUP") return { ok: false, code: "INVALID_STATUS", message: "Status pre-order belum siap untuk diserahkan." };
    if (summary.paymentStatus !== "PAID") return { ok: false, code: "NOT_PAID", message: "Pre-order belum lunas. Selesaikan pelunasan sebelum serah terima." };
    return { ok: true };
}

/** A PO may be cancelled only before handover and only when no verified money is held. */
export function evaluateCancellation(status: string, summary: Pick<PreOrderPaymentSummary, "paid">): { ok: true } | { ok: false; message: string } {
    if (status === "HANDED_OVER") return { ok: false, message: "Pre-order yang sudah diserahkan tidak dapat dibatalkan." };
    if (status === "CANCELLED") return { ok: false, message: "Pre-order sudah dibatalkan." };
    if (summary.paid > 0) return { ok: false, message: "Pre-order sudah menerima pembayaran. Pembatalan memerlukan refund manual oleh admin." };
    return { ok: true };
}

// ─── Labels (shared by UI + receipt) ─────────────────────────────────────────

export const PRE_ORDER_STATUS_LABELS: Record<PreOrderStatus, string> = {
    DRAFT: "Draf",
    CONFIRMED: "Dikonfirmasi",
    READY_FOR_PICKUP: "Siap Diambil",
    HANDED_OVER: "Sudah Diserahkan",
    CANCELLED: "Dibatalkan",
};

export const PRE_ORDER_PAYMENT_STATUS_LABELS: Record<PreOrderPaymentStatus, string> = {
    UNPAID: "Belum Bayar",
    PARTIAL: "DP / Sebagian",
    PAID: "LUNAS",
};

export const PRE_ORDER_KIND_LABELS: Record<PreOrderPaymentKind, string> = {
    DP: "DP",
    INSTALLMENT: "Cicilan",
    SETTLEMENT: "Pelunasan",
};

export const PRE_ORDER_LEDGER_STATUS_LABELS: Record<PreOrderLedgerStatus, string> = {
    PENDING: "Menunggu Verifikasi",
    VERIFIED: "Terverifikasi",
    CANCELLED: "Dibatalkan",
    EXPIRED: "Kedaluwarsa",
};

export function preOrderStatusLabel(status: string | null | undefined) {
    return isPreOrderStatus(status) ? PRE_ORDER_STATUS_LABELS[status] : status || "-";
}

export function preOrderPaymentStatusLabel(status: string | null | undefined) {
    const key = String(status ?? "").toUpperCase() as PreOrderPaymentStatus;
    return PRE_ORDER_PAYMENT_STATUS_LABELS[key] ?? (status || "-");
}

export function preOrderKindLabel(kind: string | null | undefined) {
    const key = String(kind ?? "").toUpperCase() as PreOrderPaymentKind;
    return PRE_ORDER_KIND_LABELS[key] ?? (kind || "-");
}

export function preOrderLedgerStatusLabel(status: string | null | undefined) {
    const key = String(status ?? "").toUpperCase() as PreOrderLedgerStatus;
    return PRE_ORDER_LEDGER_STATUS_LABELS[key] ?? (status || "-");
}

/** Receipt title per payment kind, so DP / cicilan / pelunasan receipts are distinguishable. */
export function preOrderReceiptTitle(kind: string | null | undefined, paymentStatus: string | null | undefined) {
    if (paymentStatus === "PAID") return "STRUK PELUNASAN PRE-ORDER";
    if (kind === "INSTALLMENT") return "STRUK CICILAN PRE-ORDER";
    return "STRUK DP PRE-ORDER";
}

// ─── Report aggregation (pure) ───────────────────────────────────────────────

export type ReportLedgerRow = { amount: number; kind: string; method: string };

export type PreOrderReportSummary = {
    paymentCount: number;
    cashReceived: number;
    byKind: Record<PreOrderPaymentKind, { count: number; total: number }>;
    byMethod: { method: string; count: number; total: number }[];
};

/** Aggregates VERIFIED PO payments. Each ledger row counts exactly once. */
export function summarizePreOrderPayments(rows: readonly ReportLedgerRow[]): PreOrderReportSummary {
    const byKind: PreOrderReportSummary["byKind"] = {
        DP: { count: 0, total: 0 },
        INSTALLMENT: { count: 0, total: 0 },
        SETTLEMENT: { count: 0, total: 0 },
    };
    const methodMap = new Map<string, { count: number; total: number }>();
    let cashReceived = 0;
    for (const row of rows) {
        cashReceived += row.amount;
        const kind: PreOrderPaymentKind = row.kind in byKind ? (row.kind as PreOrderPaymentKind) : "INSTALLMENT";
        byKind[kind].count += 1;
        byKind[kind].total += row.amount;
        const method = methodMap.get(row.method) ?? { count: 0, total: 0 };
        method.count += 1;
        method.total += row.amount;
        methodMap.set(row.method, method);
    }
    return {
        paymentCount: rows.length,
        cashReceived,
        byKind,
        byMethod: Array.from(methodMap.entries()).map(([method, value]) => ({ method, ...value })),
    };
}
