/*
 * Pure, dependency-free shipping-service classification + grouping helpers.
 *
 * AFA STORE checkout groups the rate rows returned by Biteship into
 * ⚡ INSTANT / ☀ SAME DAY / 📦 REGULAR. A category is derived ONLY from the
 * semantic fields Biteship itself returns on each pricing row (service code,
 * service name, service type, description) plus the ETA string Biteship
 * returned. Price is NEVER used, no courier is hardcoded, availability is never
 * invented and no fake rate is created — a courier only shows up when Biteship
 * actually returned a pricing row for that destination.
 *
 * Importable by both the server routes and the node:test suite (no `server-only`,
 * no Prisma, no React, no Next imports).
 */

export type ShipmentCategory = "instant" | "same_day" | "regular";

/** Any rate object that already carries its (server-derived) category. */
export type CategorizedRate = { shipmentCategory: ShipmentCategory };

/** Fields Biteship returns that carry service semantics (all optional/defensive). */
export type ShippingClassificationInput = {
    serviceCode?: string | null;
    serviceName?: string | null;
    serviceType?: string | null;
    description?: string | null;
    duration?: string | null;
};

/** Canonical display order for the checkout: instant → same day → regular. */
export const SHIPPING_CATEGORY_ORDER: readonly ShipmentCategory[] = ["instant", "same_day", "regular"];

export const SHIPPING_CATEGORY_LABELS: Record<ShipmentCategory, { icon: string; title: string; hint: string }> = {
    instant: { icon: "⚡", title: "INSTANT", hint: "Diantar dalam hitungan jam bila alamat terjangkau kurir instan" },
    same_day: { icon: "☀", title: "SAME DAY", hint: "Diantar di hari yang sama" },
    regular: { icon: "📦", title: "REGULAR", hint: "Estimasi sesuai layanan yang dipilih" },
};

// Same-day is matched first because it is the narrower promise: a row that
// says "same day" must never be advertised as instant.
const SAME_DAY_PATTERN = /\bsame\s?day\b|\bsd\b|\btoday\b|\bhari\s+yang\s+sama\b/;
// Deliberately small: only unambiguous on-demand wording. Terms like "express"
// or "priority" are NOT treated as instant (they are regular next-day services).
const INSTANT_PATTERN = /\binstant\b|\bon\s?demand\b/;
const HOUR_UNIT_PATTERN = /\b(hour|hours|hr|hrs|jam|minute|minutes|min|mins|menit)\b/;
const DAY_UNIT_PATTERN = /\b(day|days|hari)\b/;

/** Lower-cases + flattens separators so `same_day`, `Same-Day` and `same day` all match. */
function semanticText(input: ShippingClassificationInput): string {
    return [input.serviceCode, input.serviceName, input.serviceType, input.description]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .toLowerCase()
        .replace(/[_\-/|.,()]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Conservative classifier: instant only for explicit instant/on-demand wording,
 * same-day only for explicit same-day wording, everything else stays regular.
 * When the wording is silent we fall back to the ETA unit Biteship returned —
 * an hour/minute ETA is an on-demand service by definition (never price-based).
 */
export function classifyShippingService(input: ShippingClassificationInput): ShipmentCategory {
    const text = semanticText(input);
    if (SAME_DAY_PATTERN.test(text)) return "same_day";
    if (INSTANT_PATTERN.test(text)) return "instant";

    const duration = typeof input.duration === "string" ? input.duration.toLowerCase() : "";
    if (duration && HOUR_UNIT_PATTERN.test(duration) && !DAY_UNIT_PATTERN.test(duration)) return "instant";

    return "regular";
}

/**
 * Groups rates into the canonical category order, dropping empty groups so the
 * UI never renders an empty heading. Cheapest → most expensive inside a group;
 * ties keep the order the server/Biteship already returned.
 */
export function groupShippingRatesByCategory<T extends ShippingClassificationInput & { price: number; shipmentCategory?: ShipmentCategory }>(
    rates: T[],
): Array<{ category: ShipmentCategory; rates: T[] }> {
    // Defensive: an older/cached payload without `shipmentCategory` is classified
    // with the very same rule instead of silently disappearing from the UI.
    const categorized = rates.map((rate) => ({
        rate,
        category: rate.shipmentCategory ?? classifyShippingService(rate),
    }));
    return SHIPPING_CATEGORY_ORDER.map((category) => ({
        category,
        rates: categorized.filter((entry) => entry.category === category).map((entry) => entry.rate).sort((a, b) => a.price - b.price),
    })).filter((group) => group.rates.length > 0);
}

/**
 * Displays Biteship's ETA verbatim. A bare numeric range ("2-3") keeps the
 * historic "… hari" suffix; anything that already carries its own unit
 * ("1 - 3 hours") is shown as-is instead of appending a wrong unit.
 */
export function formatShippingDuration(duration: string | null | undefined): string | null {
    const value = typeof duration === "string" ? duration.trim() : "";
    if (!value) return null;
    if (/^\d+\s*[-–—]\s*\d+$/.test(value) || /^\d+$/.test(value)) return `${value} hari`;
    return value;
}
