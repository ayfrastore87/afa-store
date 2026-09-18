/*
 * AFA STORE Kasir (POS) delivery policy — pure, dependency-free helpers.
 *
 * WHY: the cashier can now create DELIVERY orders that reuse the SAME Google Maps +
 * Biteship architecture as the customer checkout. Everything that is a KASIR-SPECIFIC
 * DECISION lives here (order type, quote signature, totals, receipt exposure, delivery
 * status wording, shipment action availability) so the admin API, the POS UI, the
 * receipt and the node:test suite share ONE contract.
 *
 * Deliberately dependency-free (no imports at all, exactly like src/lib/shipping-weight.ts,
 * src/lib/shipping-destination.ts and src/lib/area-match.ts): importable by the browser
 * bundle, by the server routes and by plain `node --test`. The actual engine stays where it
 * already is — this module NEVER re-implements it:
 *   - Google reverse geocoding      -> src/lib/google-geocoding.ts
 *   - free reverse-geocode fallback -> src/lib/reverse-geocode-fallback.ts
 *   - Biteship area matching        -> src/lib/area-match.ts
 *   - Biteship rates / orders       -> src/lib/biteship.ts (+ src/lib/biteship-order.ts)
 *   - quote signature + address     -> src/lib/checkout-address.ts
 *
 * NO new database column and NO new shipping engine: the existing Order shipping fields
 * already represent pickup vs delivery (see `resolveKasirOrderType`).
 */

/* ==========================================================================
 * Order type (JENIS PESANAN)
 * ========================================================================== */

export const KASIR_ORDER_TYPES = ["PICKUP", "DELIVERY"] as const;
export type KasirOrderType = (typeof KASIR_ORDER_TYPES)[number];

/** Cashier checkout defaults to pickup: the existing transaction flow is unchanged. */
export const DEFAULT_KASIR_ORDER_TYPE: KasirOrderType = "PICKUP";

export const KASIR_ORDER_TYPE_LABELS: Record<KasirOrderType, string> = {
    PICKUP: "Ambil Sendiri",
    DELIVERY: "Kirim",
};

export function isKasirOrderType(value: unknown): value is KasirOrderType {
    return typeof value === "string" && (KASIR_ORDER_TYPES as readonly string[]).includes(value);
}

export function kasirOrderTypeLabel(value: unknown): string {
    return isKasirOrderType(value) ? KASIR_ORDER_TYPE_LABELS[value] : KASIR_ORDER_TYPE_LABELS[DEFAULT_KASIR_ORDER_TYPE];
}

/* ==========================================================================
 * Persisted-field derivation — existing columns only (no migration)
 * ========================================================================== */

export type KasirDeliveryFootprint = {
    address?: string | null;
    shipping?: number | null;
    courier?: string | null;
    courierCode?: string | null;
    service?: string | null;
    serviceCode?: string | null;
    shippingQuoteRef?: string | null;
    destinationAreaId?: string | null;
    originAreaId?: string | null;
    destinationLatitude?: number | null;
    destinationLongitude?: number | null;
    destinationProvince?: string | null;
    destinationCity?: string | null;
    destinationDistrict?: string | null;
    destinationVillage?: string | null;
    destinationPostalCode?: string | null;
    biteshipOrderId?: string | null;
};

function nonEmptyText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * True when a persisted order really carries DELIVERY evidence. A pickup order (the
 * historical kasir order shape: `address = ""`, `shipping = 0`, no courier/area/coordinates)
 * has no footprint at all, so the two order types can never be confused.
 */
export function hasKasirDeliveryFootprint(record: KasirDeliveryFootprint | null | undefined): boolean {
    if (!record) return false;
    const texts = [
        record.address,
        record.courier,
        record.courierCode,
        record.service,
        record.serviceCode,
        record.shippingQuoteRef,
        record.destinationAreaId,
        record.originAreaId,
        record.destinationProvince,
        record.destinationCity,
        record.destinationDistrict,
        record.destinationVillage,
        record.destinationPostalCode,
        record.biteshipOrderId,
    ];
    if (texts.some((value) => nonEmptyText(value).length > 0)) return true;
    if (isFiniteNumber(record.shipping) && record.shipping > 0) return true;
    return isFiniteNumber(record.destinationLatitude) || isFiniteNumber(record.destinationLongitude);
}

/** The order type of a PERSISTED order (read-only derivation, never a new column). */
export function resolveKasirOrderType(record: KasirDeliveryFootprint | null | undefined): KasirOrderType {
    return hasKasirDeliveryFootprint(record) ? "DELIVERY" : "PICKUP";
}

/* ==========================================================================
 * Quote signature — products + quantities + destination + coordinates + area
 * ========================================================================== */

export type KasirCartLine = { productId: string; quantity: number };

/**
 * Order-insensitive identity of the cart. Two carts with the same products and the same
 * quantities share a key, so a quote stays valid; anything else (product added/removed,
 * quantity changed) produces a different key and therefore invalidates the quote.
 */
export function kasirCartKey(items: KasirCartLine[] | null | undefined): string {
    if (!Array.isArray(items) || items.length === 0) return "";
    const grouped = new Map<string, number>();
    for (const item of items) {
        const id = nonEmptyText(item?.productId);
        const qty = Number(item?.quantity);
        if (!id || !Number.isInteger(qty) || qty < 1) continue;
        grouped.set(id, (grouped.get(id) ?? 0) + qty);
    }
    return [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, qty]) => `${id}:${qty}`)
        .join(",");
}

/**
 * Everything a kasir shipping quote depends on: the cart signature plus the destination
 * signature (`locationSignature()` from src/lib/checkout-address.ts — the very same
 * pin + destinationAreaId + formatted address identity the customer checkout uses).
 */
export function kasirDeliverySignature(cartKey: string, locationKey: string): string {
    const cart = nonEmptyText(cartKey);
    const location = nonEmptyText(locationKey);
    if (!cart && !location) return "";
    return `${cart}|${location}`;
}

/** True when a previously fetched quote may no longer be used for this destination. */
export function mustRequoteKasirShipping(previousSignature: string, nextSignature: string): boolean {
    return previousSignature !== nextSignature;
}

/* ==========================================================================
 * Totals — authoritative subtotal (+ authoritative ongkir only for delivery)
 * ========================================================================== */

/** Ongkir that may be charged for this order type: pickup never carries shipping. */
export function kasirShippingTotal(orderType: KasirOrderType, shipping: number | null | undefined): number {
    if (orderType !== "DELIVERY") return 0;
    const value = Number(shipping);
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value);
}

export type KasirOrderTotalInput = {
    subtotal: number;
    orderType: KasirOrderType;
    shipping?: number | null;
};

/** TOTAL = authoritative subtotal + authoritative ongkir (0 for pickup). */
export function kasirOrderTotal(input: KasirOrderTotalInput): number {
    const subtotal = Number.isFinite(input.subtotal) && input.subtotal > 0 ? Math.round(input.subtotal) : 0;
    return subtotal + kasirShippingTotal(input.orderType, input.shipping);
}

/* ==========================================================================
 * Draft + request payload (UI -> admin API)
 * ========================================================================== */

/**
 * Everything the cashier collects for a Kirim order. `detail` is the cashier's OWN
 * address detail (nomor rumah / blok / RT-RW / patokan) and is never overwritten by
 * map or Biteship-area metadata — the same rule as the customer checkout.
 */
export type KasirDeliveryDraft = {
    latitude: number | null;
    longitude: number | null;
    /** Resolved display address from Google reverse geocoding OR the free fallback. */
    address: string;
    detail: string;
    /** Authoritative Biteship area id (never a Google place id / fallback provider id). */
    areaId: string;
    areaLabel: string;
    province: string;
    city: string;
    district: string;
    village: string;
    postalCode: string;
    courierCode: string;
    courierName: string;
    serviceCode: string;
    serviceName: string;
    /** Ongkir from the last server quote (display + total only; the server re-quotes). */
    shipping: number;
    /** Signature the current quote belongs to (cart + destination + pin + area). */
    quoteSignature: string;
};

export function emptyKasirDeliveryDraft(): KasirDeliveryDraft {
    return {
        latitude: null,
        longitude: null,
        address: "",
        detail: "",
        areaId: "",
        areaLabel: "",
        province: "",
        city: "",
        district: "",
        village: "",
        postalCode: "",
        courierCode: "",
        courierName: "",
        serviceCode: "",
        serviceName: "",
        shipping: 0,
        quoteSignature: "",
    };
}

/** The `delivery` object POST /api/admin/kasir/order expects (trimmed, no extra keys). */
export function kasirDeliveryRequest(draft: KasirDeliveryDraft) {
    return {
        destinationAreaId: draft.areaId.trim(),
        address: draft.address.trim(),
        addressDetail: draft.detail.trim(),
        courierCode: draft.courierCode.trim(),
        serviceCode: draft.serviceCode.trim(),
        latitude: draft.latitude,
        longitude: draft.longitude,
        province: draft.province.trim(),
        city: draft.city.trim(),
        district: draft.district.trim(),
        village: draft.village.trim(),
        postalCode: draft.postalCode.trim(),
    };
}

/* ==========================================================================
 * Delivery readiness (UI gate). The VALIDATORS stay where they already live:
 * the caller passes `isValidRecipientName` / `isValidRecipientPhone` /
 * `isValidDeliveryLocation` results in, and this function only owns the
 * kasir-specific policy + wording.
 * ========================================================================== */

export const KASIR_DELIVERY_MESSAGES = {
    recipient: "Nama penerima dan nomor WhatsApp penerima wajib diisi untuk pesanan Kirim.",
    address: "Tentukan titik lokasi pengiriman di peta sebelum melanjutkan.",
    area: "Pilih kecamatan/kelurahan pengiriman untuk melanjutkan pengecekan ongkir.",
    quote: "Ongkir sudah tidak berlaku untuk lokasi ini. Cek ongkir ulang sebelum memproses transaksi.",
    courier: "Pilih jasa kurir terlebih dahulu.",
} as const;

export type KasirDeliveryReadinessInput = {
    /** `isValidRecipientName(name) && isValidRecipientPhone(phone)` for a Kirim order. */
    recipientValid: boolean;
    /** `isValidDeliveryLocation({ formattedAddress, latitude, longitude, destinationAreaId })`. */
    locationValid: boolean;
    /** A live quote is selected and still belongs to the CURRENT destination. */
    quoteSelected: boolean;
    quoteMatchesDestination: boolean;
};

export type KasirDeliveryReadiness = { ready: boolean; reason: string | null };

/**
 * A Kirim order may only be processed with a recipient identity, a CONFIRMED map
 * location with a real Biteship destinationAreaId, and a quote that still belongs to
 * that destination. Pickup never reaches this function.
 */
export function kasirDeliveryReadiness(input: KasirDeliveryReadinessInput): KasirDeliveryReadiness {
    if (!input.locationValid) return { ready: false, reason: KASIR_DELIVERY_MESSAGES.address };
    if (!input.recipientValid) return { ready: false, reason: KASIR_DELIVERY_MESSAGES.recipient };
    if (!input.quoteSelected) return { ready: false, reason: KASIR_DELIVERY_MESSAGES.courier };
    if (!input.quoteMatchesDestination) return { ready: false, reason: KASIR_DELIVERY_MESSAGES.quote };
    return { ready: true, reason: null };
}

/* ==========================================================================
 * Delivery status — only statuses the EXISTING Biteship integration returns
 * ========================================================================== */

export const KASIR_DELIVERY_STATUS_KEYS = [
    "MENUNGGU_PENGIRIMAN",
    "KURIR_DICARI",
    "DIPROSES",
    "KURIR_MENUJU_PICKUP",
    "PESANAN_DIAMBIL",
    "DALAM_PENGIRIMAN",
    "TERKIRIM",
    "DIKEMBALIKAN",
    "DITAHAN",
    "GAGAL",
    "TIDAK_DIKENAL",
] as const;
export type KasirDeliveryStatusKey = (typeof KASIR_DELIVERY_STATUS_KEYS)[number];

export const KASIR_DELIVERY_STATUS_LABELS: Record<KasirDeliveryStatusKey, string> = {
    MENUNGGU_PENGIRIMAN: "Menunggu Pengiriman",
    KURIR_DICARI: "Kurir Dicari",
    DIPROSES: "Diproses",
    KURIR_MENUJU_PICKUP: "Kurir Menuju Pickup",
    PESANAN_DIAMBIL: "Pesanan Diambil",
    DALAM_PENGIRIMAN: "Dalam Pengiriman",
    TERKIRIM: "Terkirim",
    DIKEMBALIKAN: "Dikembalikan",
    DITAHAN: "Ditahan",
    GAGAL: "Dibatalkan / Gagal",
    TIDAK_DIKENAL: "Status Tidak Dikenal",
};

/**
 * Biteship ORDER statuses -> normalized display state.
 *
 * The keys come from the OFFICIAL provider vocabulary audited in the Biteship API
 * reference: the order status flow (docs/api/orders/overview) uses snake_case
 * (`confirmed`, `scheduled`, `allocated`, `picking_up`, `picked`, `in_transit`,
 * `dropping_off`, `delivered`, `cancelled`, `on_hold`, `return_in_transit`,
 * `returned`, `rejected`, `disposed`, `courier_not_found`) while the tracking status
 * vocabulary (docs/api/trackings/status) spells the SAME states in camelCase
 * (`pickingUp`, `inTransit`, `droppingOff`, `returnInTransit`, `onHold`,
 * `courierNotFound`), so both spellings are accepted for one state.
 *
 * Any value that is NOT in this table is never translated into a made-up transition:
 * it is shown verbatim (key TIDAK_DIKENAL) so the raw provider status stays the
 * source of truth in the UI.
 */
const BITESHIP_ORDER_STATUS_MAP: Record<string, KasirDeliveryStatusKey> = {
    confirmed: "KURIR_DICARI",
    // `scheduled` = "Order has been scheduled to be delivered. AWB has been generated"
    // (official flow, step 2). AFA STORE never books a scheduled pickup
    // (`delivery_type` is always "now"), so this only matters for defensive mapping.
    scheduled: "DIPROSES",
    allocated: "DIPROSES",
    picking_up: "KURIR_MENUJU_PICKUP",
    picked: "PESANAN_DIAMBIL",
    // Official flow: `in_transit` is the middle mile and `dropping_off` the last mile,
    // both "on the way to the destination".
    in_transit: "DALAM_PENGIRIMAN",
    dropping_off: "DALAM_PENGIRIMAN",
    delivered: "TERKIRIM",
    cancelled: "GAGAL",
    canceled: "GAGAL",
    rejected: "GAGAL",
    courier_not_found: "GAGAL",
    disposed: "GAGAL",
    returned: "DIKEMBALIKAN",
    return_in_transit: "DIKEMBALIKAN",
    return_in_progress: "DIKEMBALIKAN",
    on_hold: "DITAHAN",
    // The tracking/webhook vocabulary for the very same states.
    pickingup: "KURIR_MENUJU_PICKUP",
    intransit: "DALAM_PENGIRIMAN",
    droppingoff: "DALAM_PENGIRIMAN",
    returnintransit: "DIKEMBALIKAN",
    onhold: "DITAHAN",
    couriernotfound: "GAGAL",
};

export type KasirDeliveryStatus = {
    key: KasirDeliveryStatusKey;
    label: string;
    /** Raw provider status, preserved exactly as persisted (never rewritten). */
    raw: string;
    known: boolean;
};

/**
 * Normalized status for a delivery order. Without a shipment yet the honest state is
 * "Menunggu Pengiriman" — nothing else is assumed about the courier.
 */
export function normalizeKasirDeliveryStatus(input: {
    biteshipStatus?: string | null;
    hasShipment?: boolean;
}): KasirDeliveryStatus {
    const raw = nonEmptyText(input.biteshipStatus);
    const mapped = raw ? BITESHIP_ORDER_STATUS_MAP[raw.toLowerCase()] : undefined;
    if (mapped) return { key: mapped, label: KASIR_DELIVERY_STATUS_LABELS[mapped], raw, known: true };
    if (!input.hasShipment) {
        return { key: "MENUNGGU_PENGIRIMAN", label: KASIR_DELIVERY_STATUS_LABELS.MENUNGGU_PENGIRIMAN, raw, known: true };
    }
    // A real shipment exists but the provider status is not one we know: show it as-is.
    return { key: "TIDAK_DIKENAL", label: raw || KASIR_DELIVERY_STATUS_LABELS.TIDAK_DIKENAL, raw, known: false };
}

/**
 * Provider states that will NOT change again. The cashier may refresh an ACTIVE
 * shipment automatically, but a finished shipment must never keep asking the
 * provider. Only statuses the existing integration really returns are listed here
 * (a return/hold can still move, so it is deliberately NOT terminal).
 */
export const KASIR_TERMINAL_DELIVERY_STATUS_KEYS: readonly KasirDeliveryStatusKey[] = ["TERKIRIM", "GAGAL"];

export function isKasirDeliveryStatusTerminal(key: unknown): boolean {
    return (KASIR_TERMINAL_DELIVERY_STATUS_KEYS as readonly string[]).includes(nonEmptyText(key).toUpperCase());
}

/**
 * Conservative automatic refresh cadence for an OPEN detail page. It is deliberately
 * slow (never aggressive polling) and the manual refresh stays available at all times.
 */
export const KASIR_DELIVERY_AUTO_REFRESH_MS = 60_000;

/**
 * Automatic refresh applies ONLY to a real, still-active shipment: without a provider
 * order there is nothing to sync, and a terminal shipment is final.
 *
 * Accepts either the normalized key (preferred) or the RAW provider status, so an
 * unmapped/finished provider state can never keep the page polling.
 */
export function shouldAutoRefreshKasirDeliveryStatus(input: {
    hasShipment?: boolean | null;
    statusKey?: string | null;
    biteshipStatus?: string | null;
}): boolean {
    if (!input.hasShipment) return false;
    const key =
        nonEmptyText(input.statusKey) ||
        normalizeKasirDeliveryStatus({ biteshipStatus: input.biteshipStatus, hasShipment: true }).key;
    return !isKasirDeliveryStatusTerminal(key);
}

/* ==========================================================================
 * Delivery timeline — the stages a shipment REALLY reached (never fabricated)
 *
 * Every step is derived from the normalized provider status only: a step is
 * "completed" / "current" when the persisted provider state justifies it, and a
 * state that leaves the normal flow (failed / cancelled / returned / still
 * unrecognized) is rendered as an explicit interruption instead of fake progress.
 * An unknown provider status can therefore NEVER advance the timeline to "Terkirim".
 * ========================================================================== */

export const KASIR_DELIVERY_TIMELINE_STAGES = [
    "PESANAN_DIBUAT",
    "KURIR_DICARI",
    "KURIR_MENUJU_PICKUP",
    "PESANAN_DIAMBIL",
    "DALAM_PENGIRIMAN",
    "TERKIRIM",
] as const;
export type KasirDeliveryTimelineStage = (typeof KASIR_DELIVERY_TIMELINE_STAGES)[number];

export const KASIR_DELIVERY_TIMELINE_LABELS: Record<KasirDeliveryTimelineStage, string> = {
    PESANAN_DIBUAT: "Pesanan Dibuat",
    KURIR_DICARI: "Kurir Dicari",
    KURIR_MENUJU_PICKUP: "Kurir Menuju Pickup",
    PESANAN_DIAMBIL: "Pesanan Diambil",
    DALAM_PENGIRIMAN: "Dalam Pengiriman",
    TERKIRIM: "Terkirim",
};

export type KasirDeliveryTimelineState = "completed" | "current" | "pending";

export type KasirDeliveryTimelineStep = {
    stage: KasirDeliveryTimelineStage;
    label: string;
    state: KasirDeliveryTimelineState;
};

export type KasirDeliveryTimeline = {
    steps: KasirDeliveryTimelineStep[];
    /** Normalized state the timeline was derived from (the same object the badge shows). */
    statusKey: KasirDeliveryStatusKey;
    statusLabel: string;
    /** Raw persisted provider status, still shown verbatim next to the timeline. */
    raw: string;
    /** 1-based stage that is "current" (index into `steps` + 1), or null when none is. */
    currentStage: number | null;
    /** True when the shipment did NOT continue the normal delivery flow. */
    interrupted: boolean;
    /** Honest, short explanation for an interrupted timeline (null when normal). */
    note: string | null;
};

type KasirDeliveryTimelineRule = {
    /** How many stages (1-based, in KASIR_DELIVERY_TIMELINE_STAGES order) are done. */
    completedThrough: number;
    /** 1-based stage that is "current", or null when no stage may be claimed. */
    currentStage: number | null;
    interrupted: boolean;
    note: string | null;
};

/**
 * One rule per normalized status. Stage 1 ("Pesanan Dibuat") is always done because the
 * order row exists; every later stage is claimed only when the provider state proves it.
 */
const KASIR_DELIVERY_TIMELINE_RULES: Record<KasirDeliveryStatusKey, KasirDeliveryTimelineRule> = {
    MENUNGGU_PENGIRIMAN: {
        completedThrough: 1,
        currentStage: null,
        interrupted: false,
        note: "Pengiriman belum dibuat untuk pesanan ini.",
    },
    KURIR_DICARI: { completedThrough: 1, currentStage: 2, interrupted: false, note: null },
    // `allocated` / `scheduled`: the courier is assigned but not on the way yet, so the
    // timeline deliberately stays at "Kurir Dicari" instead of claiming more progress.
    DIPROSES: { completedThrough: 1, currentStage: 2, interrupted: false, note: null },
    KURIR_MENUJU_PICKUP: { completedThrough: 2, currentStage: 3, interrupted: false, note: null },
    PESANAN_DIAMBIL: { completedThrough: 3, currentStage: 4, interrupted: false, note: null },
    DALAM_PENGIRIMAN: { completedThrough: 4, currentStage: 5, interrupted: false, note: null },
    TERKIRIM: { completedThrough: 5, currentStage: 6, interrupted: false, note: null },
    // A return means the parcel WAS handed to the courier and is going back: "Pesanan
    // Diambil" is therefore reached, while nothing after it may be claimed.
    DIKEMBALIKAN: {
        completedThrough: 4,
        currentStage: null,
        interrupted: true,
        note: "Paket dikembalikan ke pengirim.",
    },
    // A hold can happen at any point, so no position is claimed.
    DITAHAN: {
        completedThrough: 1,
        currentStage: null,
        interrupted: true,
        note: "Pengiriman sedang ditahan oleh jasa kirim.",
    },
    GAGAL: {
        completedThrough: 1,
        currentStage: null,
        interrupted: true,
        note: "Pengiriman gagal atau dibatalkan.",
    },
    TIDAK_DIKENAL: {
        completedThrough: 1,
        currentStage: null,
        interrupted: true,
        note: "Status pengiriman ini belum dikenali, jadi timeline tidak dilanjutkan.",
    },
};

/**
 * Timeline for a delivery order, derived ONLY from the persisted provider status.
 * No caller may pass a stage in, so the UI can never race ahead of the provider.
 */
export function kasirDeliveryTimeline(input: {
    biteshipStatus?: string | null;
    hasShipment?: boolean;
}): KasirDeliveryTimeline {
    const status = normalizeKasirDeliveryStatus({ biteshipStatus: input.biteshipStatus, hasShipment: input.hasShipment });
    const rule = KASIR_DELIVERY_TIMELINE_RULES[status.key];
    const steps: KasirDeliveryTimelineStep[] = KASIR_DELIVERY_TIMELINE_STAGES.map((stage, index) => {
        const position = index + 1;
        const state: KasirDeliveryTimelineState =
            position === rule.currentStage ? "current" : position <= rule.completedThrough ? "completed" : "pending";
        return { stage, label: KASIR_DELIVERY_TIMELINE_LABELS[stage], state };
    });
    return {
        steps,
        statusKey: status.key,
        statusLabel: status.label,
        raw: status.raw,
        currentStage: rule.currentStage,
        interrupted: rule.interrupted,
        note: rule.note,
    };
}

/* ==========================================================================
 * Status progression — duplicated / out-of-order provider updates
 *
 * The provider is the source of truth, but a read can return an OLDER value than the one
 * already stored, the very same value again, or a value this application does not
 * recognize. The persisted status may therefore only be replaced when the incoming value
 * is not a regression, and a repeated value is idempotent by construction. The ranks
 * follow the official order status flow, where the middle mile (`in_transit`) and the
 * last mile (`dropping_off`) share one step and therefore one rank.
 * ========================================================================== */

/** Canonical token for a provider status: `picking_up` and `pickingUp` become one token. */
function canonicalKasirProviderStatus(value: unknown): string {
    return nonEmptyText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

const KASIR_PROVIDER_STATUS_RANK: Record<string, number> = {
    confirmed: 1,
    scheduled: 2,
    allocated: 2,
    pickingup: 3,
    picked: 4,
    intransit: 5,
    droppingoff: 5,
    delivered: 6,
};

/** States in which the normal flow has ENDED (success or not). */
const KASIR_FINAL_PROVIDER_STATUSES: readonly string[] = [
    "delivered",
    "cancelled",
    "canceled",
    "rejected",
    "returned",
    "disposed",
    "couriernotfound",
];

/** States that may appear at any point and resolve again later (a hold, a return). */
const KASIR_UNRANKED_PROVIDER_STATUSES: readonly string[] = ["onhold", "returnintransit", "returninprogress"];

const KASIR_FINAL_SUCCESS_STATUS = "delivered";

/** Linear progress rank of an official provider status, or null when it has no rank. */
export function kasirDeliveryStatusRank(value: unknown): number | null {
    const token = canonicalKasirProviderStatus(value);
    if (!token) return null;
    return KASIR_PROVIDER_STATUS_RANK[token] ?? null;
}

/** True when this provider status ends the normal delivery flow. */
export function isFinalKasirDeliveryStatus(value: unknown): boolean {
    const token = canonicalKasirProviderStatus(value);
    return token ? KASIR_FINAL_PROVIDER_STATUSES.includes(token) : false;
}

function isKnownKasirProviderStatus(value: unknown): boolean {
    const token = canonicalKasirProviderStatus(value);
    if (!token) return false;
    return (
        KASIR_PROVIDER_STATUS_RANK[token] !== undefined ||
        KASIR_UNRANKED_PROVIDER_STATUSES.includes(token) ||
        KASIR_FINAL_PROVIDER_STATUSES.includes(token)
    );
}

/**
 * True when an incoming provider status may replace the persisted one. This is the single
 * place that decides whether an update is accepted, so no caller can let a finished
 * shipment move backwards.
 */
export function canAdvanceKasirDeliveryStatus(persisted: unknown, incoming: unknown): boolean {
    const from = canonicalKasirProviderStatus(persisted);
    const to = canonicalKasirProviderStatus(incoming);
    // Nothing to store: an empty provider value never erases a stored status.
    if (!to) return false;
    // First real status for this order.
    if (!from) return true;
    // The identical status again: an accepted, idempotent no-op.
    if (from === to) return true;
    // "delivered" is final success: it never moves to ANY other state.
    if (from === KASIR_FINAL_SUCCESS_STATUS) return false;
    // The other final states (cancelled / rejected / returned / disposed / no courier) are
    // final too, but a newer FINAL truth may replace them (a delivery reported last wins).
    // A still-running state never revives them.
    if (isFinalKasirDeliveryStatus(from)) return isFinalKasirDeliveryStatus(to);
    // A final state always wins over a still-running one.
    if (isFinalKasirDeliveryStatus(to)) return true;
    // An unrecognized value never overwrites a known state; a known value does replace an
    // unrecognized stored one.
    if (!isKnownKasirProviderStatus(to)) return false;
    if (!isKnownKasirProviderStatus(from)) return true;
    const fromRank = kasirDeliveryStatusRank(from);
    const toRank = kasirDeliveryStatusRank(to);
    if (fromRank !== null && toRank !== null) return toRank >= fromRank;
    // At least one side has no rank (a hold / return in progress): those may appear at any
    // point and may clear again, so the newest value is kept.
    return true;
}

/**
 * The status that should be PERSISTED for this order: the incoming provider value when it
 * is not a regression, otherwise the already stored one. Returns null only when neither
 * side has a value. Never invents a status and never fabricates an order of events.
 */
export function resolveKasirDeliveryStatusUpdate(persisted: unknown, incoming: unknown): string | null {
    const stored = nonEmptyText(persisted);
    const next = nonEmptyText(incoming);
    if (!next) return stored || null;
    if (!canAdvanceKasirDeliveryStatus(stored, next)) return stored || null;
    return next;
}

/* ==========================================================================
 * Shipment action availability — mirrors the server rules in
 * POST/GET /api/admin/orders/[id]/biteship (never invents a provider transition)
 * ========================================================================== */

/** Prefix of the compare-and-set claim stored in `Order.biteshipOrderId`. */
export const BITESHIP_CLAIM_PREFIX = "claim:";

/** A real provider order id exists (the claim row is NOT a shipment yet). */
export function hasRealShipment(biteshipOrderId: string | null | undefined): boolean {
    const value = nonEmptyText(biteshipOrderId);
    return value.length > 0 && !value.startsWith(BITESHIP_CLAIM_PREFIX);
}

export type KasirShipmentActionInput = {
    biteshipOrderId?: string | null;
    courierCode?: string | null;
    serviceCode?: string | null;
    destinationAreaId?: string | null;
    paymentStatus?: string | null;
    orderStatus?: string | null;
    // Additional fields for COD detection
    paymentMethod?: string | null;
    source?: string | null;
    orderType?: string | null;
};

export type KasirShipmentAction = {
    canCreate: boolean;
    canRefresh: boolean;
    label: string;
    hint: string;
};

/** Order statuses the existing Biteship route refuses to ship (same set as the route). */
const SHIPMENT_BLOCKED_ORDER_STATUSES = new Set(["CANCELLED", "CANCELED", "COMPLETED", "DIBATALKAN", "BATAL", "SELESAI"]);

/**
 * "BUAT PENGIRIMAN" is offered only when the existing route would really accept the
 * request: no shipment yet, a courier/service code frozen from the server-side quote,
 * a destination area, a PAID payment or PENDING COD (Kasir DELIVERY + TUNAI), and "LACAK PENGIRIMAN"
 * is offered once a real shipment exists (refresh reads the provider through the server).
 */
export function kasirShipmentAction(input: KasirShipmentActionInput): KasirShipmentAction {
    const shipped = hasRealShipment(input.biteshipOrderId);
    if (shipped) {
        return { canCreate: false, canRefresh: true, label: "Lacak Pengiriman", hint: "Perbarui status pengiriman terakhir." };
    }
    const orderStatus = nonEmptyText(input.orderStatus).toUpperCase();
    const paymentStatus = nonEmptyText(input.paymentStatus).toUpperCase();

    // Check for pending COD (Kasir DELIVERY + TUNAI)
    const paymentMethod = (input.paymentMethod ?? "").toUpperCase();
    const source = (input.source || "").toUpperCase();
    const orderType = (input.orderType ?? "").toUpperCase();
    const isKasirOrder = source === "TATAP_MUKA" || source === "WHATSAPP";
    const isDeliveryOrder = orderType === "DELIVERY";
    const isPendingCOD =
        isKasirOrder &&
        isDeliveryOrder &&
        paymentMethod === "TUNAI" &&
        ["PENDING", "WAITING_PAYMENT"].includes(paymentStatus);
    const ready =
        Boolean(nonEmptyText(input.courierCode)) &&
        Boolean(nonEmptyText(input.serviceCode)) &&
        Boolean(nonEmptyText(input.destinationAreaId)) &&
        (paymentStatus === "PAID" || isPendingCOD) &&
        !SHIPMENT_BLOCKED_ORDER_STATUSES.has(orderStatus);
    if (!ready) {
        return { canCreate: false, canRefresh: false, label: "Buat Pengiriman", hint: "Pengiriman belum dapat dibuat untuk pesanan ini." };
    }
    return { canCreate: true, canRefresh: false, label: "Buat Pengiriman", hint: "Buat pengiriman Biteship untuk pesanan ini." };
}

/* ==========================================================================
 * Receipt exposure — printed struk never carries internal/provider identifiers
 * ========================================================================== */

/**
 * Values that MUST NOT be printed on a struk: Biteship area/quote/order identifiers,
 * provider codes and the internal claim marker. Enforced by
 * `kasirReceiptDelivery()` (whitelist) and asserted by the test suite.
 */
export const KASIR_RECEIPT_FORBIDDEN_FIELDS = [
    "destinationAreaId",
    "originAreaId",
    "shippingQuoteRef",
    "biteshipOrderId",
    "courierCode",
    "serviceCode",
    "destinationLatitude",
    "destinationLongitude",
    BITESHIP_CLAIM_PREFIX,
] as const;

export type KasirReceiptDeliverySource = KasirDeliveryFootprint & {
    customer?: string | null;
    phone?: string | null;
    note?: string | null;
    trackingNumber?: string | null;
    biteshipTrackingId?: string | null;
    serviceCode?: string | null;
};

export type KasirReceiptDelivery = {
    recipientName: string;
    recipientPhone: string;
    address: string;
    courier: string | null;
    service: string | null;
    shippingLabel: string;
    trackingId: string | null;
};

/**
 * The ONLY delivery data a receipt may print, or `null` for a pickup order. Internal
 * identifiers are structurally impossible here: every field is selected explicitly and
 * the tracking number is only included when the provider/persisted data really has one.
 */
export function kasirReceiptDelivery(order: KasirReceiptDeliverySource | null | undefined): KasirReceiptDelivery | null {
    if (!order || !hasKasirDeliveryFootprint(order)) return null;
    const shipping = Number(order.shipping);
    const trackingId = nonEmptyText(order.biteshipTrackingId) || nonEmptyText(order.trackingNumber);
    return {
        recipientName: nonEmptyText(order.customer),
        recipientPhone: nonEmptyText(order.phone),
        address: nonEmptyText(order.address),
        courier: nonEmptyText(order.courier) || null,
        service: nonEmptyText(order.service) || null,
        shippingLabel: Number.isFinite(shipping) && shipping > 0 ? String(Math.round(shipping)) : "0",
        trackingId: trackingId || null,
    };
}

/** True when any forbidden internal identifier leaked into a printable string. */
export function receiptLeaksInternalField(text: string): boolean {
    const value = typeof text === "string" ? text : "";
    return KASIR_RECEIPT_FORBIDDEN_FIELDS.some((field) => value.includes(field));
}


