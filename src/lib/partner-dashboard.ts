import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shared server-side vocabulary and helpers for the AFA STORE partner
// dashboard (Tahap IV). These helpers are read-only or pure; mutations are
// handled inside the API routes so stock and sales stay atomic.
// ---------------------------------------------------------------------------

// PartnerStockMovement.type vocabulary.
//   IN  = stock transferred from AFA Store to the partner (decrements Product.stock).
//   OUT = partner stock reduction (manual adjustment, or a recorded sale where the
//         sale ledger emits type "OUT" + referenceType "SALE").
export const PARTNER_STOCK_MOVEMENT_TYPES = ["IN", "OUT"] as const;
export type PartnerStockMovementType = (typeof PARTNER_STOCK_MOVEMENT_TYPES)[number];

// PartnerStockMovement.referenceType vocabulary. The schema keeps these as free
// text (no enum), so these constants document the agreed semantics (F-8).
export const PARTNER_REFERENCE_TRANSFER_IN = "TRANSFER_IN";
export const PARTNER_REFERENCE_MANUAL_OUT = "MANUAL";
export const PARTNER_REFERENCE_SALE = "SALE";

export function isPartnerStockMovementType(value: unknown): value is PartnerStockMovementType {
    return typeof value === "string" && (PARTNER_STOCK_MOVEMENT_TYPES as readonly string[]).includes(value);
}

export const PARTNER_LOW_STOCK_THRESHOLD = 5;

export const MAX_PARTNER_SALE_ITEMS = 100;
export const MAX_PARTNER_SALE_QUANTITY = 999;
export const MAX_PARTNER_STOCK_QUANTITY = 99999;
// PartnerProductPrice.price is an integer Rupiah amount. Bound it far below the
// JS safe-integer range and mirror the sale-item price cap used elsewhere.
export const MAX_PARTNER_COST_PRICE = 1_000_000_000;

// PartnerProductPrice lifecycle labels. Status is always computed server-side
// (never trusted from the browser) so the admin/partner UIs only render it.
export const PARTNER_PRICE_STATUS_ACTIVE = "Aktif";
export const PARTNER_PRICE_STATUS_UPCOMING = "Akan Datang";
export const PARTNER_PRICE_STATUS_EXPIRED = "Berakhir";

export function getPartnerPriceStatus(
    effectiveFrom: Date,
    effectiveTo: Date | null,
    now: Date = new Date()
): string {
    if (effectiveTo && effectiveTo.getTime() <= now.getTime()) return PARTNER_PRICE_STATUS_EXPIRED;
    if (effectiveFrom.getTime() > now.getTime()) return PARTNER_PRICE_STATUS_UPCOMING;
    return PARTNER_PRICE_STATUS_ACTIVE;
}


// Sale number mirrors the kasir invoice approach: a date prefix plus a
// zero-padded sequence, guarded by an advisory lock during creation.
export function getSalePrefix(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `PJ-${yyyy}${mm}${dd}-`;
}

export function formatSaleNumber(date = new Date(), sequence = 1) {
    return `${getSalePrefix(date)}${String(sequence).padStart(6, "0")}`;
}

type CostReader = Pick<Prisma.TransactionClient, "partnerProductPrice" | "product">;

// Partner cost price = the latest active partner-specific price, else the
// product's catalog price. This keeps grossProfit meaningful even before a
// partner-specific cost has been recorded.
export async function getPartnerCostPrice(
    partnerId: string,
    productId: string,
    client: CostReader = prisma
): Promise<number> {
    // Only the price that is currently in effect may be used (F-4): effectiveFrom
    // is in the past (or now) and effectiveTo is either open-ended or still in the
    // future. This prevents a future-dated price from being applied too early.
    const now = new Date();
    const price = await client.partnerProductPrice.findFirst({
        where: {
            partnerId,
            productId,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
        select: { price: true },
    });
    if (price) return price.price;

    const product = await client.product.findUnique({
        where: { id: productId },
        select: { price: true },
    });
    return product?.price ?? 0;
}
