import type { BiteshipRate } from "@/lib/biteship-normalize";

/**
 * Pure, dependency-free shipping helpers. Importable by both the server routes
 * and the node:test suite (no `server-only`, no Prisma, no Next imports).
 */

export const DEFAULT_PRODUCT_WEIGHT_GRAMS = 1000;
export const MIN_PRODUCT_WEIGHT_GRAMS = 1;
export const MAX_PRODUCT_WEIGHT_GRAMS = 1_000_000;

export type WeightedItem = { id: string; name?: string; weight: number; qty: number };

export function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Validate a raw product-weight value (grams). Returns a valid integer or null. */
export function validateProductWeightInput(value: unknown): number | null {
    if (typeof value !== "number" && typeof value !== "string") return null;
    const parsed = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
    if (parsed < MIN_PRODUCT_WEIGHT_GRAMS || parsed > MAX_PRODUCT_WEIGHT_GRAMS) return null;
    return parsed;
}

/** Backfill weight for products that predate the weight column (never trust size text). */
export function resolveProductWeight(weight: number | null | undefined): number {
    if (weight !== null && weight !== undefined && Number.isInteger(weight) && weight > 0) return weight;
    return DEFAULT_PRODUCT_WEIGHT_GRAMS;
}

/** Authoritative total weight (grams) across the requested items. */
export function calculateTotalWeight(items: WeightedItem[]): number {
    return items.reduce((sum, item) => {
        const weight = resolveProductWeight(item.weight);
        const qty = Number.isInteger(item.qty) && item.qty > 0 ? item.qty : 1;
        return sum + weight * qty;
    }, 0);
}

export type RateSelection = { courierCode: string; serviceCode: string };

/**
 * Tamper-proof rate selection: the server re-fetches the live quote and matches
 * only by (courierCode, serviceCode). Client-supplied price is ignored entirely.
 */
export function selectRate(rates: BiteshipRate[], selection: RateSelection): BiteshipRate | null {
    const courier = selection.courierCode.trim();
    const service = selection.serviceCode.trim();
    if (!courier || !service) return null;
    return rates.find((rate) => rate.courierCode === courier && rate.serviceCode === service) ?? null;
}

export function isValidRateSelection(value: unknown): value is RateSelection {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return typeof record.courierCode === "string" && record.courierCode.trim().length > 0 && typeof record.serviceCode === "string" && record.serviceCode.trim().length > 0;
}
