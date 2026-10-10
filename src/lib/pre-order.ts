import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createMidtransQrisCharge, getQrisActionUrl } from "@/lib/midtrans";
import { getQrisProvider } from "@/lib/qris-config";
import {
    buildPreOrderItems,
    computeCashChange,
    computePaymentSummary,
    computePreOrderTotal,
    evaluateCancellation,
    evaluateHandover,
    evaluatePaymentAttempt,
    formatPreOrderNumber,
    getPreOrderNumberPrefix,
    normalizePreOrderPaymentMethod,
    canTransitionPreOrder,
    type PreOrderPaymentMethod,
    type PreOrderPaymentSummary,
    type PreOrderSource,
    type PreOrderStatus,
} from "@/lib/pre-order-core";

// ---------------------------------------------------------------------------
// Pre-Order server service. Every money mutation runs inside ONE transaction
// that first takes `pg_advisory_xact_lock(hashtext('po:' || id))`, re-reads
// the VERIFIED ledger, re-evaluates the pure rules, and only then writes.
// Two concurrent "pelunasan" calls therefore serialize: the second one sees
// the PO already PAID and is rejected (or returns the same row when it carries
// the same idempotencyKey). Order / Payment tables are never touched.
// ---------------------------------------------------------------------------

export class PreOrderError extends Error {
    constructor(message: string, public status = 400, public code = "PRE_ORDER_ERROR") {
        super(message);
        this.name = "PreOrderError";
    }
}

const preOrderInclude = {
    items: { orderBy: { id: "asc" as const } },
    payments: { orderBy: { sequence: "asc" as const } },
} satisfies Prisma.PreOrderInclude;

export type PreOrderRecord = Prisma.PreOrderGetPayload<{ include: typeof preOrderInclude }>;

type Tx = Prisma.TransactionClient;

async function lockPreOrder(tx: Tx, id: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`po:${id}`}))`;
}

async function loadLocked(tx: Tx, id: string): Promise<PreOrderRecord> {
    await lockPreOrder(tx, id);
    const po = await tx.preOrder.findFirst({ where: { id, deletedAt: null }, include: preOrderInclude });
    if (!po) throw new PreOrderError("Pre-order tidak ditemukan.", 404, "NOT_FOUND");
    return po;
}

export function summarize(po: PreOrderRecord): PreOrderPaymentSummary {
    return computePaymentSummary(po.total, po.payments);
}

/** Persist the derived paymentStatus so list filters stay cheap. Never the source of truth. */
async function syncPaymentStatus(tx: Tx, po: PreOrderRecord) {
    const summary = summarize(po);
    if (summary.paymentStatus !== po.paymentStatus) {
        await tx.preOrder.update({ where: { id: po.id }, data: { paymentStatus: summary.paymentStatus } });
        po.paymentStatus = summary.paymentStatus;
    }
    return summary;
}

// ─── Serialization ───────────────────────────────────────────────────────────

export function serializePreOrder(po: PreOrderRecord) {
    const summary = summarize(po);
    return {
        id: po.id,
        poNumber: po.poNumber,
        publicToken: po.publicToken,
        customer: po.customer,
        phone: po.phone,
        note: po.note,
        pickupDate: po.pickupDate ? po.pickupDate.toISOString() : null,
        subtotal: po.subtotal,
        discount: po.discount,
        total: po.total,
        status: po.status,
        paymentStatus: summary.paymentStatus,
        source: po.source,
        paid: summary.paid,
        pending: summary.pending,
        remaining: summary.remaining,
        handedOverAt: po.handedOverAt ? po.handedOverAt.toISOString() : null,
        cancelledAt: po.cancelledAt ? po.cancelledAt.toISOString() : null,
        readyAt: po.readyAt ? po.readyAt.toISOString() : null,
        createdAt: po.createdAt.toISOString(),
        updatedAt: po.updatedAt.toISOString(),
        items: po.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            name: item.name,
            notes: item.notes,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.subtotal,
        })),
        payments: po.payments.map(serializePreOrderPayment),
    };
}

export function serializePreOrderPayment(payment: PreOrderRecord["payments"][number]) {
    return {
        id: payment.id,
        sequence: payment.sequence,
        amount: payment.amount,
        method: payment.method,
        kind: payment.kind,
        status: payment.status,
        cashReceived: payment.cashReceived,
        change: payment.change,
        qrisUrl: payment.qrisUrl,
        transactionRef: payment.transactionRef,
        expiredAt: payment.expiredAt ? payment.expiredAt.toISOString() : null,
        verifiedAt: payment.verifiedAt ? payment.verifiedAt.toISOString() : null,
        note: payment.note,
        createdAt: payment.createdAt.toISOString(),
    };
}

export type SerializedPreOrder = ReturnType<typeof serializePreOrder>;
export type SerializedPreOrderPayment = ReturnType<typeof serializePreOrderPayment>;

// ─── Create ──────────────────────────────────────────────────────────────────

export type CreatePreOrderInput = {
    customer: unknown;
    phone: unknown;
    note?: unknown;
    pickupDate?: unknown;
    discount?: unknown;
    items: unknown;
    source: PreOrderSource;
    createdById?: string | null;
    userId?: string | null;
    /** WEBSITE submissions start as DRAFT until admin confirms. */
    initialStatus?: PreOrderStatus;
    /** Issue an unguessable public tracking token (guest / website POs). */
    withPublicToken?: boolean;
};

/** 24 random bytes -> 32-char base64url; same pattern as the kasir Order publicToken. */
export function generatePreOrderPublicToken() {
    return randomBytes(24).toString("base64url");
}

/** Public-safe view: no internal id, no ledger internals, no operator fields. */
export function serializePublicPreOrder(po: PreOrderRecord) {
    const summary = summarize(po);
    return {
        poNumber: po.poNumber,
        customer: po.customer,
        pickupDate: po.pickupDate ? po.pickupDate.toISOString() : null,
        note: po.note,
        subtotal: po.subtotal,
        discount: po.discount,
        total: po.total,
        status: po.status,
        paymentStatus: summary.paymentStatus,
        paid: summary.paid,
        remaining: summary.remaining,
        createdAt: po.createdAt.toISOString(),
        confirmedAt: po.confirmedAt ? po.confirmedAt.toISOString() : null,
        readyAt: po.readyAt ? po.readyAt.toISOString() : null,
        handedOverAt: po.handedOverAt ? po.handedOverAt.toISOString() : null,
        cancelledAt: po.cancelledAt ? po.cancelledAt.toISOString() : null,
        items: po.items.map((item) => ({ name: item.name, notes: item.notes, quantity: item.quantity, price: item.price, subtotal: item.subtotal })),
        payments: po.payments
            .filter((row) => row.status === "VERIFIED")
            .map((row) => ({ sequence: row.sequence, amount: row.amount, method: row.method, kind: row.kind, verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null })),
    };
}

export type SerializedPublicPreOrder = ReturnType<typeof serializePublicPreOrder>;

export async function getPreOrderByPublicToken(publicToken: string) {
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(publicToken)) return null;
    return prisma.preOrder.findFirst({ where: { publicToken, deletedAt: null }, include: preOrderInclude });
}

function parsePhone(value: unknown) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) throw new PreOrderError("Nomor WhatsApp tidak valid.");
    return digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
}

function parsePickupDate(value: unknown) {
    if (value == null || value === "") return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new PreOrderError("Tanggal pengambilan tidak valid.");
    return date;
}

/**
 * Items referencing a catalog product get their price from the DB (never from
 * the client). Manual items (no productId) keep the operator-entered price and
 * are admin-only.
 */
async function resolveItems(tx: Tx, raw: unknown, trustClientPrice: boolean) {
    // Guest catalog rows intentionally carry price 0 until the product is
    // re-read below. Do not reject that placeholder before server resolution.
    const built = buildPreOrderItems(raw, { allowZeroTotal: true });
    if (!built.ok) throw new PreOrderError(built.message);
    const productIds = built.items.map((item) => item.productId).filter((id): id is string => Boolean(id));
    const products = productIds.length
        ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, price: true, isActive: true } })
        : [];
    const map = new Map(products.map((product) => [product.id, product]));
    for (const item of built.items) {
        if (!item.productId) {
            if (!trustClientPrice) throw new PreOrderError("Item manual hanya dapat ditambahkan oleh admin.");
            continue;
        }
        const product = map.get(item.productId);
        if (!product) throw new PreOrderError(`Produk dengan ID "${item.productId}" tidak ditemukan.`);
        if (!product.isActive) throw new PreOrderError(`Produk "${product.name}" sedang tidak aktif.`);
        // Prisma currently maps Product.price to Int, but normalize at this
        // boundary as a defense against Decimal/string runtime values from
        // older schemas or alternate Prisma adapters.
        const price = Number(product.price);
        if (!Number.isSafeInteger(price) || price <= 0 || price > 100_000_000) {
            throw new PreOrderError(`Harga produk "${product.name}" tidak valid.`);
        }
        item.name = product.name;
        item.price = price;
        item.subtotal = price * item.quantity;
    }
    const subtotal = built.items.reduce((sum, item) => sum + item.subtotal, 0);
    if (subtotal <= 0) throw new PreOrderError("Total pre-order harus lebih dari Rp 0.");
    return { items: built.items, subtotal };
}

export async function createPreOrder(input: CreatePreOrderInput) {
    const customer = String(input.customer ?? "").trim();
    if (!customer || customer.length > 120) throw new PreOrderError("Nama pelanggan wajib diisi.");
    const phone = parsePhone(input.phone);
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 500) : null;
    const pickupDate = parsePickupDate(input.pickupDate);
    const isAdmin = input.source !== "WEBSITE";
    const rawDiscount = isAdmin ? Number(input.discount ?? 0) : 0;
    if (!Number.isSafeInteger(rawDiscount) || rawDiscount < 0) throw new PreOrderError("Diskon tidak valid.");

    return prisma.$transaction(async (tx) => {
        const { items, subtotal } = await resolveItems(tx, input.items, isAdmin);
        const { discount, total } = computePreOrderTotal(subtotal, rawDiscount);
        const now = new Date();
        const prefix = getPreOrderNumberPrefix(now);
        // Same daily-sequence + advisory lock pattern as the kasir invoice generator.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`;
        const todayCount = await tx.preOrder.count({ where: { poNumber: { startsWith: prefix } } });
        const status: PreOrderStatus = input.initialStatus ?? (isAdmin ? "CONFIRMED" : "DRAFT");
        return tx.preOrder.create({
            data: {
                poNumber: formatPreOrderNumber(now, todayCount + 1),
                publicToken: input.withPublicToken ? generatePreOrderPublicToken() : null,
                customer,
                phone,
                note,
                pickupDate,
                subtotal,
                discount,
                total,
                status,
                paymentStatus: "UNPAID",
                source: input.source,
                userId: input.userId ?? null,
                createdById: input.createdById ?? null,
                confirmedAt: status === "CONFIRMED" ? now : null,
                items: { create: items.map((item) => ({ productId: item.productId ?? null, name: item.name, notes: item.notes ?? null, quantity: item.quantity, price: item.price, subtotal: item.subtotal })) },
            },
            include: preOrderInclude,
        });
    });
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getPreOrder(id: string) {
    return prisma.preOrder.findFirst({ where: { id, deletedAt: null }, include: preOrderInclude });
}

export type PreOrderListFilter = "all" | "unpaid" | "ready" | "today_pickup" | "handed_over" | "draft";

export async function listPreOrders(options: { q?: string; filter?: PreOrderListFilter; limit?: number }) {
    const q = (options.q ?? "").trim();
    const where: Prisma.PreOrderWhereInput = { deletedAt: null };
    if (q) {
        const digits = q.replace(/\D/g, "");
        where.OR = [
            { poNumber: { contains: q.toUpperCase() } },
            { customer: { contains: q, mode: "insensitive" } },
            ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ];
    }
    switch (options.filter) {
        case "unpaid":
            where.status = { in: ["CONFIRMED", "READY_FOR_PICKUP"] };
            where.paymentStatus = { in: ["UNPAID", "PARTIAL"] };
            break;
        case "ready":
            where.status = "READY_FOR_PICKUP";
            break;
        case "handed_over":
            where.status = "HANDED_OVER";
            break;
        case "draft":
            where.status = "DRAFT";
            break;
        case "today_pickup": {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            where.pickupDate = { gte: start, lt: new Date(start.getTime() + 86_400_000) };
            where.status = { in: ["CONFIRMED", "READY_FOR_PICKUP"] };
            break;
        }
        default:
            break;
    }
    return prisma.preOrder.findMany({ where, include: preOrderInclude, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(options.limit ?? 50, 1), 200) });
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function transitionPreOrderStatus(id: string, to: PreOrderStatus, actorId: string) {
    return prisma.$transaction(async (tx) => {
        const po = await loadLocked(tx, id);
        const summary = await syncPaymentStatus(tx, po);
        if (to === "HANDED_OVER") throw new PreOrderError("Gunakan proses serah terima.", 400, "USE_HANDOVER");
        if (to === "CANCELLED") {
            const decision = evaluateCancellation(po.status, summary);
            if (!decision.ok) throw new PreOrderError(decision.message, 409, "CANNOT_CANCEL");
        }
        if (!canTransitionPreOrder(po.status, to)) throw new PreOrderError("Perubahan status tidak diizinkan.", 409, "INVALID_TRANSITION");
        const now = new Date();
        const data: Prisma.PreOrderUpdateInput = { status: to };
        if (to === "CONFIRMED" && !po.confirmedAt) data.confirmedAt = now;
        if (to === "READY_FOR_PICKUP") data.readyAt = now;
        if (to === "CANCELLED") {
            data.cancelledAt = now;
            // Any still-pending QRIS/transfer rows are closed so they can never be verified later.
            await tx.preOrderPayment.updateMany({ where: { preOrderId: po.id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: now, note: `Dibatalkan bersama PO oleh ${actorId}` } });
        }
        return tx.preOrder.update({ where: { id: po.id }, data, include: preOrderInclude });
    });
}

/** Serah terima: hanya saat LUNAS. Idempotent — a second call returns the same record. */
export async function handoverPreOrder(id: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
        const po = await loadLocked(tx, id);
        const summary = await syncPaymentStatus(tx, po);
        if (po.status === "HANDED_OVER") return { preOrder: po, alreadyHandedOver: true };
        const decision = evaluateHandover(po.status, summary);
        if (!decision.ok) throw new PreOrderError(decision.message, decision.code === "NOT_PAID" ? 402 : 409, decision.code);
        const now = new Date();
        // Compare-and-set: only a non-terminal row can become HANDED_OVER.
        const changed = await tx.preOrder.updateMany({
            where: { id: po.id, status: { in: ["CONFIRMED", "READY_FOR_PICKUP"] } },
            data: { status: "HANDED_OVER", handedOverAt: now, handedOverById: actorId, paymentStatus: "PAID" },
        });
        const fresh = await tx.preOrder.findUniqueOrThrow({ where: { id: po.id }, include: preOrderInclude });
        return { preOrder: fresh, alreadyHandedOver: changed.count === 0 };
    });
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type RecordPreOrderPaymentInput = {
    preOrderId: string;
    amount: unknown;
    method: unknown;
    cashReceived?: unknown;
    note?: unknown;
    /** Client-generated key; replays return the original row instead of a second charge. */
    idempotencyKey?: unknown;
    operatorId: string;
    /** TUNAI by kasir/admin is verified on the spot; TRANSFER/QRIS-manual wait for confirmation. */
    verifyImmediately?: boolean;
};

export type RecordPreOrderPaymentResult = {
    preOrder: PreOrderRecord;
    payment: PreOrderRecord["payments"][number];
    replayed: boolean;
};

const QRIS_EXPIRY_MINUTES = 60;

function parseIdempotencyKey(value: unknown) {
    if (value == null || value === "") return null;
    const key = String(value).trim();
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new PreOrderError("idempotencyKey tidak valid.");
    return key;
}

/**
 * Records one ledger row. Guarantees, in order:
 *  1. idempotencyKey replay  -> returns the existing row (no new charge)
 *  2. advisory lock on the PO -> concurrent attempts serialize
 *  3. rules re-evaluated on the locked, fresh ledger (status, overpayment)
 *  4. TUNAI (verifyImmediately) -> VERIFIED now; otherwise PENDING
 *  5. QRIS + MIDTRANS provider -> charge created with order_id = "<poNumber>-P<seq>"
 *     and stored as transactionRef so the shared webhook can verify it.
 */
export async function recordPreOrderPayment(input: RecordPreOrderPaymentInput): Promise<RecordPreOrderPaymentResult> {
    const amount = Number(input.amount);
    const method = normalizePreOrderPaymentMethod(input.method);
    if (!method) throw new PreOrderError("Metode pembayaran tidak dikenal.");
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 300) : null;
    const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);

    return prisma.$transaction(async (tx) => {
        if (idempotencyKey) {
            const existing = await tx.preOrderPayment.findUnique({ where: { idempotencyKey } });
            if (existing) {
                if (existing.preOrderId !== input.preOrderId) throw new PreOrderError("idempotencyKey sudah dipakai PO lain.", 409, "IDEMPOTENCY_CONFLICT");
                const po = await tx.preOrder.findUniqueOrThrow({ where: { id: existing.preOrderId }, include: preOrderInclude });
                return { preOrder: po, payment: existing, replayed: true };
            }
        }

        const po = await loadLocked(tx, input.preOrderId);
        const summary = await syncPaymentStatus(tx, po);
        const decision = evaluatePaymentAttempt({ status: po.status, total: po.total, alreadyPaid: summary.paid, amount });
        if (!decision.ok) throw new PreOrderError(decision.message, decision.code === "OVERPAYMENT" || decision.code === "ALREADY_PAID" ? 409 : 400, decision.code);

        // A still-PENDING QRIS/transfer row blocks a second non-cash attempt so the
        // customer can never be charged twice for the same balance.
        const openPending = po.payments.find((row) => row.status === "PENDING" && row.method !== "TUNAI");
        if (openPending && method !== "TUNAI") {
            throw new PreOrderError(`Masih ada pembayaran ${openPending.method} #${openPending.sequence} yang menunggu verifikasi. Batalkan atau verifikasi dulu.`, 409, "PENDING_EXISTS");
        }

        const sequence = po.payments.reduce((max, row) => Math.max(max, row.sequence), 0) + 1;
        const now = new Date();
        let cashReceived: number | null = null;
        let change: number | null = null;
        if (method === "TUNAI") {
            const cash = computeCashChange(amount, input.cashReceived);
            if (!cash.ok) throw new PreOrderError(cash.message);
            cashReceived = cash.cashReceived;
            change = cash.change;
        }
        const verifyNow = method === "TUNAI" && input.verifyImmediately !== false;

        let payment = await tx.preOrderPayment.create({
            data: {
                preOrderId: po.id,
                sequence,
                amount,
                method,
                kind: decision.kind,
                status: verifyNow ? "VERIFIED" : "PENDING",
                idempotencyKey,
                operatorId: input.operatorId,
                verifiedById: verifyNow ? input.operatorId : null,
                verifiedAt: verifyNow ? now : null,
                cashReceived,
                change,
                note,
                expiredAt: method === "QRIS" ? new Date(now.getTime() + QRIS_EXPIRY_MINUTES * 60_000) : null,
            },
        });

        if (method === "QRIS" && getQrisProvider() === "MIDTRANS") {
            const reference = `${po.poNumber}-P${sequence}`;
            const midtrans = await createMidtransQrisCharge({
                invoice: reference,
                amount,
                customer: { name: po.customer, phone: po.phone },
                items: [{ id: `${po.poNumber}-${decision.kind}`, name: `${decision.kind} Pre-Order ${po.poNumber}`.slice(0, 50), price: amount, quantity: 1 }],
                expiryMinutes: QRIS_EXPIRY_MINUTES,
            });
            payment = await tx.preOrderPayment.update({
                where: { id: payment.id },
                data: {
                    qrisUrl: getQrisActionUrl(midtrans),
                    transactionId: midtrans.transaction_id ?? null,
                    transactionRef: midtrans.order_id ?? reference,
                    paymentType: midtrans.payment_type ?? "qris",
                    rawResponse: midtrans as Prisma.InputJsonValue,
                    expiredAt: midtrans.expiry_time ? new Date(midtrans.expiry_time.replace(" ", "T")) : payment.expiredAt,
                },
            });
        }

        const fresh = await tx.preOrder.findUniqueOrThrow({ where: { id: po.id }, include: preOrderInclude });
        await syncPaymentStatus(tx, fresh);
        return { preOrder: fresh, payment, replayed: false };
    });
}

/**
 * Manual verification (QRIS MANUAL / transfer). Compare-and-set on
 * status=PENDING so browser retries are harmless; re-checks overpayment on the
 * locked ledger so a verify can never push `paid` above `total`.
 */
export async function verifyPreOrderPayment(preOrderId: string, paymentId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
        const po = await loadLocked(tx, preOrderId);
        const payment = po.payments.find((row) => row.id === paymentId);
        if (!payment) throw new PreOrderError("Pembayaran tidak ditemukan.", 404, "NOT_FOUND");
        if (payment.status === "VERIFIED") return { preOrder: po, payment, alreadyVerified: true };
        if (payment.status !== "PENDING") throw new PreOrderError("Pembayaran tidak dalam status menunggu.", 409, "NOT_PENDING");
        if (payment.method === "QRIS" && (payment.transactionId || payment.transactionRef)) {
            throw new PreOrderError("QRIS Midtrans diverifikasi otomatis via webhook, tidak bisa manual.", 400, "MIDTRANS_MANAGED");
        }
        if (po.status === "CANCELLED" || po.status === "HANDED_OVER") throw new PreOrderError("Pre-order sudah ditutup.", 409, "PO_CLOSED");
        const summary = computePaymentSummary(po.total, po.payments);
        if (summary.paid + payment.amount > po.total) throw new PreOrderError("Verifikasi ini akan melebihi total pre-order.", 409, "OVERPAYMENT");
        const now = new Date();
        const changed = await tx.preOrderPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "VERIFIED", verifiedAt: now, verifiedById: actorId } });
        const fresh = await tx.preOrder.findUniqueOrThrow({ where: { id: po.id }, include: preOrderInclude });
        await syncPaymentStatus(tx, fresh);
        const freshPayment = fresh.payments.find((row) => row.id === paymentId) ?? payment;
        return { preOrder: fresh, payment: freshPayment, alreadyVerified: changed.count === 0 };
    });
}

/** Cancels a PENDING row only (verified money is never silently removed). */
export async function cancelPreOrderPayment(preOrderId: string, paymentId: string, actorId: string, reason?: string) {
    return prisma.$transaction(async (tx) => {
        const po = await loadLocked(tx, preOrderId);
        const payment = po.payments.find((row) => row.id === paymentId);
        if (!payment) throw new PreOrderError("Pembayaran tidak ditemukan.", 404, "NOT_FOUND");
        if (payment.status !== "PENDING") throw new PreOrderError("Hanya pembayaran menunggu yang dapat dibatalkan.", 409, "NOT_PENDING");
        await tx.preOrderPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: new Date(), note: reason ? `${reason} (oleh ${actorId})` : payment.note } });
        const fresh = await tx.preOrder.findUniqueOrThrow({ where: { id: po.id }, include: preOrderInclude });
        await syncPaymentStatus(tx, fresh);
        return fresh;
    });
}

// ─── Midtrans webhook bridge ─────────────────────────────────────────────────

export function isPreOrderPaymentReference(value: string) {
    return /^PO-\d{8}-\d{4}-P\d+$/.test(value);
}

/**
 * Called by /api/midtrans/webhook when order_id is a PO payment reference.
 * Returns false when the ref is unknown so the caller can fall through to the
 * legacy Order path untouched. Same identity / amount checks as the Order path.
 */
export async function applyMidtransEventToPreOrderPayment(input: {
    transactionRef: string;
    transactionId?: string;
    paymentType?: string;
    grossAmount: number | null;
    event: "settlement" | "capture_accept" | "expire" | "cancel";
}) {
    const target = await prisma.preOrderPayment.findUnique({ where: { transactionRef: input.transactionRef }, select: { id: true, preOrderId: true } });
    if (!target) return false;
    await prisma.$transaction(async (tx) => {
        const po = await loadLocked(tx, target.preOrderId);
        const payment = po.payments.find((row) => row.id === target.id);
        if (!payment) throw new Error("missing_pre_order_payment");
        if (input.grossAmount === null || input.grossAmount !== payment.amount) throw new Error("gross_amount_mismatch");
        if (payment.transactionId && input.transactionId && payment.transactionId !== input.transactionId) throw new Error("transaction_identity_mismatch");
        if (payment.status !== "PENDING") return; // idempotent replay
        const now = new Date();
        if (input.event === "settlement" || input.event === "capture_accept") {
            const summary = computePaymentSummary(po.total, po.payments);
            if (summary.paid + payment.amount > po.total) throw new Error("pre_order_overpayment");
            await tx.preOrderPayment.updateMany({
                where: { id: payment.id, status: "PENDING" },
                data: { status: "VERIFIED", verifiedAt: now, verifiedById: "midtrans", transactionId: payment.transactionId ?? input.transactionId ?? null, paymentType: input.paymentType ?? payment.paymentType },
            });
        } else {
            await tx.preOrderPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: input.event === "expire" ? "EXPIRED" : "CANCELLED", cancelledAt: now } });
        }
        const fresh = await tx.preOrder.findUniqueOrThrow({ where: { id: po.id }, include: preOrderInclude });
        await syncPaymentStatus(tx, fresh);
    });
    return true;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

/** VERIFIED PO payments in [from, to) — used by the kasir/admin report. Separate from Order revenue. */
export async function getPreOrderReportRows(from: Date, to: Date) {
    const [payments, outstanding, handedOver] = await Promise.all([
        prisma.preOrderPayment.findMany({
            where: { status: "VERIFIED", verifiedAt: { gte: from, lt: to }, preOrder: { deletedAt: null } },
            select: { id: true, amount: true, kind: true, method: true, verifiedAt: true, preOrder: { select: { poNumber: true, customer: true } } },
            orderBy: { verifiedAt: "asc" },
        }),
        prisma.preOrder.findMany({
            where: { deletedAt: null, status: { in: ["CONFIRMED", "READY_FOR_PICKUP"] }, paymentStatus: { in: ["UNPAID", "PARTIAL"] } },
            select: { total: true, payments: { select: { amount: true, status: true } } },
        }),
        prisma.preOrder.aggregate({ where: { deletedAt: null, status: "HANDED_OVER", handedOverAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { total: true } }),
    ]);
    const outstandingReceivables = outstanding.reduce((sum, po) => sum + computePaymentSummary(po.total, po.payments).remaining, 0);
    return {
        payments,
        outstandingCount: outstanding.length,
        outstandingReceivables,
        handedOverCount: handedOver._count._all,
        handedOverValue: handedOver._sum.total ?? 0,
    };
}

export type { PreOrderPaymentMethod };
