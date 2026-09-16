import "server-only";

import { normalizeRecipientPhone } from "@/lib/checkout-address";
import { normalizeBiteshipRatesResponse } from "@/lib/biteship-normalize";
import type { BiteshipRate } from "@/lib/biteship-normalize";
import { classifyShippingService, type CategorizedRate } from "@/lib/shipping-category";
import { BITESHIP_FAILURE_MESSAGES, isBiteshipProviderFailure, type BiteshipFailureKind } from "@/lib/biteship-failure";
import {
    BITESHIP_ORDER_REJECTED_MESSAGE,
    buildBiteshipOrderPayload,
    isBiteshipReferenceIdConflict,
    normalizeBiteshipOrderResponse,
    type BiteshipCreatedOrder,
    type BiteshipOrderInput,
    type BiteshipOriginIdentity,
} from "@/lib/biteship-order";

export type { BiteshipRate };
export type { BiteshipCreatedOrder, BiteshipOrderInput, BiteshipOriginIdentity };

export const BITESHIP_DEFAULT_TIMEOUT_MS = 10_000;

export type BiteshipItem = { name?: string; weight: number; quantity: number; value?: number };
export type BiteshipRateRequest = { destinationAreaId: string; items: BiteshipItem[] };

export type BiteshipArea = {
    id: string;
    name: string;
    type: string;
    postalCode?: string;
    province?: string;
    city?: string;
    district?: string;
    village?: string;
};

export type BiteshipCategorizedRate = BiteshipRate & CategorizedRate;

export type BiteshipRatesResult = {
    originAreaId: string;
    destinationAreaId: string;
    rates: BiteshipCategorizedRate[];
};

type BiteshipRatesRawResponse = {
    success?: boolean;
    origin?: { area_id?: string | null };
    destination?: { area_id?: string | null };
    pricing?: Array<Record<string, unknown>>;
    [key: string]: unknown;
};

type BiteshipAreasRawResponse = {
    success?: boolean;
    areas?: Array<{
        id?: string;
        name?: string;
        type?: string;
        administrative_division_level?: number | string;
        postal_code?: string;
        postalCode?: string;
        province?: string;
        city?: string;
        district?: string;
        administrative_division_level_1_name?: string;
        administrative_division_level_2_name?: string;
        administrative_division_level_3_name?: string;
        administrative_division_level_4_name?: string;
        [key: string]: unknown;
    }>;
    [key: string]: unknown;
};

type BiteshipCourierRaw = { courier_code?: string; courier_name?: string; [key: string]: unknown };

export class BiteshipError extends Error {
    constructor(message: string, public readonly retryable: boolean = false, public readonly kind: BiteshipFailureKind = "unavailable") {
        super(message);
        this.name = "BiteshipError";
    }
}

export class BiteshipUnavailableError extends BiteshipError {
    constructor(
        message = "Layanan pengiriman sedang tidak tersedia. Silakan coba lagi nanti.",
        public readonly code: "CONFIGURATION" | "UPSTREAM" = "UPSTREAM",
        kind: BiteshipFailureKind = "unavailable",
    ) {
        super(message, true, kind);
        this.name = "BiteshipUnavailableError";
    }
}

export function getBiteshipConfig() {
    const apiKey = process.env.BITESHIP_API_KEY?.trim();
    const originAreaId = process.env.BITESHIP_ORIGIN_AREA_ID?.trim();
    const baseUrl = (process.env.BITESHIP_BASE_URL?.trim() || "https://api.biteship.com").replace(/\/+$/, "");
    if (!apiKey) throw new BiteshipUnavailableError("Konfigurasi pengiriman belum lengkap. Silakan hubungi admin.", "CONFIGURATION");
    // NOTE: origin area ID is intentionally NOT required here — area search
    // (`/api/shipping/areas`) only needs the API key. Rates/checkout enforce it
    // separately via getBiteshipOriginAreaId().
    return { apiKey, originAreaId, baseUrl };
}

export function getBiteshipOriginAreaId() {
    const originAreaId = getBiteshipConfig().originAreaId;
    if (!originAreaId) throw new BiteshipUnavailableError("Lokasi pengiriman toko belum diatur. Silakan hubungi admin.", "CONFIGURATION");
    return originAreaId;
}

/**
 * Extracts only safe, non-secret fields from an upstream error payload for
 * diagnostic logging. Never returns the whole body, headers, keys, or env.
 */
function pickBiteshipErrorFields(data: unknown): { code?: string | number; error?: string; message?: string } {
    if (typeof data !== "object" || data === null) return {};
    const record = data as Record<string, unknown>;
    const out: { code?: string | number; error?: string; message?: string } = {};
    const code = record.code;
    if (typeof code === "string" || typeof code === "number") out.code = code;
    if (typeof record.error === "string") out.error = record.error;
    if (typeof record.message === "string") out.message = record.message;
    return out;
}

async function biteshipFetch(path: string, init: RequestInit) {
    const { apiKey, baseUrl } = getBiteshipConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BITESHIP_DEFAULT_TIMEOUT_MS);
    if (init.signal) init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    try {
        const response = await fetch(`${baseUrl}${path}`, {
            ...init,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: apiKey,
                ...(init.headers as Record<string, string> | undefined),
            },
            signal: controller.signal,
        });
        const text = await response.text();
        let data: unknown = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            console.error("biteship_invalid_response", { path, status: response.status });
            throw new BiteshipUnavailableError();
        }
        if (!response.ok) {
            const fields = pickBiteshipErrorFields(data);
            console.error("biteship_request_failed", { path, status: response.status, ...fields });
            // Account/provider failures (for example "No sufficient balance to call
            // rates API") belong to OUR Biteship account, never to the customer's
            // address: they are reported as a retryable provider problem so checkout
            // can never answer "alamat tidak didukung". Only the sanitized fields
            // above are logged — never the raw body, the API key or env names.
            if (isBiteshipProviderFailure(response.status, fields)) {
                throw new BiteshipUnavailableError(BITESHIP_FAILURE_MESSAGES.provider, "UPSTREAM", "provider");
            }
            const retryable = response.status >= 500;
            if (retryable) throw new BiteshipUnavailableError();
            throw new BiteshipError("Pilihan pengiriman sedang tidak tersedia. Silakan coba lagi.");
        }
        return data as Record<string, unknown>;
    } catch (error) {
        if (error instanceof BiteshipError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") throw new BiteshipUnavailableError();
        console.error("biteship_error", { path, message: error instanceof Error ? error.message : String(error) });
        throw new BiteshipUnavailableError();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Raw transport for order creation: returns the parsed body + HTTP status WITHOUT
 * throwing on a non-2xx response, so callers can inspect Biteship's official
 * `reference_id already used` rejection (code 40002060) for idempotency recovery.
 * Network/timeout/parse failures still throw BiteshipUnavailableError.
 */
async function biteshipFetchRaw(path: string, init: RequestInit): Promise<{ status: number; data: unknown }> {
    const { apiKey, baseUrl } = getBiteshipConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BITESHIP_DEFAULT_TIMEOUT_MS);
    if (init.signal) init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    try {
        const response = await fetch(`${baseUrl}${path}`, {
            ...init,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: apiKey,
                ...(init.headers as Record<string, string> | undefined),
            },
            signal: controller.signal,
        });
        const text = await response.text();
        let data: unknown = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            console.error("biteship_invalid_response", { path, status: response.status });
            throw new BiteshipUnavailableError();
        }
        if (!response.ok) {
            // Same sanitized, non-secret diagnostics as biteshipFetch: ONLY the
            // allowlisted code/error/message strings are logged — never the raw body,
            // headers, API key, env names or any order/customer data.
            console.error("biteship_request_failed", { path, status: response.status, ...pickBiteshipErrorFields(data) });
        }
        return { status: response.status, data };
    } catch (error) {
        if (error instanceof BiteshipError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") throw new BiteshipUnavailableError();
        console.error("biteship_error", { path, message: error instanceof Error ? error.message : String(error) });
        throw new BiteshipUnavailableError();
    } finally {
        clearTimeout(timeout);
    }
}

let couriersCache: { codes: string[]; at: number } | null = null;
const COURIERS_CACHE_TTL_MS = 5 * 60_000;

/**
 * List the courier codes enabled for this Biteship account. Rates are quoted
 * per-courier, and `couriers` is a REQUIRED field on POST /v1/rates/couriers —
 * sending an empty string is rejected upstream with 400. We query the account's
 * courier list and pass a real comma-separated value instead of guessing a list.
 */
export async function listBiteshipCouriers(): Promise<string[]> {
    if (couriersCache && Date.now() - couriersCache.at < COURIERS_CACHE_TTL_MS) return couriersCache.codes;
    const data = await biteshipFetch("/v1/couriers", { method: "GET" });
    const entries = Array.isArray(data.couriers) ? (data.couriers as BiteshipCourierRaw[]) : [];
    const codes = new Set<string>();
    for (const entry of entries) {
        const code = typeof entry?.courier_code === "string" ? entry.courier_code.trim() : "";
        if (code) codes.add(code);
    }
    const result = [...codes];
    couriersCache = { codes: result, at: Date.now() };
    return result;
}

export async function getBiteshipRates(request: BiteshipRateRequest): Promise<BiteshipRatesResult> {
    const configuredOrigin = getBiteshipOriginAreaId();
    const couriers = (await listBiteshipCouriers()).join(",");
    if (!couriers) throw new BiteshipUnavailableError();
    const items = request.items.map((item) => ({
        name: item.name || "Produk",
        weight: item.weight,
        quantity: item.quantity,
        value: item.value ?? 0,
    }));
    const data = await biteshipFetch("/v1/rates/couriers", {
        method: "POST",
        body: JSON.stringify({ origin_area_id: configuredOrigin, destination_area_id: request.destinationAreaId, couriers, items }),
    });
    const raw = data as BiteshipRatesRawResponse;
    // Categories are computed server-side from the semantic fields Biteship
    // returned (service/type/description + ETA). Availability is never invented:
    // only pricing rows actually returned here reach the checkout.
    const rates = (await normalizeBiteshipRatesResponse(raw)).map((rate) => ({
        ...rate,
        shipmentCategory: classifyShippingService(rate),
    }));
    return {
        originAreaId: raw.origin?.area_id || configuredOrigin,
        destinationAreaId: raw.destination?.area_id || request.destinationAreaId,
        rates,
    };
}

/**
 * Short-lived, bounded cache of OFFICIAL Biteship area lookups. The same normalized
 * query (kelurahan / postcode label) is asked repeatedly while a customer confirms
 * several nearby pins, and the manual fallback search repeats the same inputs. The
 * cache contains only public administrative data — never user or order data — and it
 * is bounded so it can never grow without limit.
 */
const areasCache = new Map<string, { areas: BiteshipArea[]; at: number }>();
const AREAS_CACHE_TTL_MS = 5 * 60_000;
const AREAS_CACHE_MAX_ENTRIES = 200;

export async function searchBiteshipAreas(input: string, type?: "single" | "double"): Promise<BiteshipArea[]> {
    const trimmed = input.trim();
    if (!trimmed) return [];

    const cacheKey = `${type || "single"}:${trimmed.toLowerCase()}`;
    const cached = areasCache.get(cacheKey);
    if (cached && Date.now() - cached.at < AREAS_CACHE_TTL_MS) return cached.areas;

    const params = new URLSearchParams({ countries: "ID", input: trimmed, type: type || "single" });
    const data = await biteshipFetch(`/v1/maps/areas?${params.toString()}`, { method: "GET" });
    const raw = data as BiteshipAreasRawResponse;
    const areas: BiteshipArea[] = [];
    const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    for (const entry of raw.areas ?? []) {
        if (!entry.id || !entry.name) continue;
        const level = entry.administrative_division_level ?? entry.type ?? "";
        const name = entry.name.toString();
        areas.push({
            id: entry.id.toString(),
            name,
            type: `level_${level}`,
            postalCode: str(entry.postal_code) || str(entry.postalCode) || undefined,
            province: str(entry.province) || str(entry.administrative_division_level_1_name) || undefined,
            city: str(entry.city) || str(entry.administrative_division_level_2_name) || undefined,
            district: str(entry.district) || str(entry.administrative_division_level_3_name) || undefined,
            village: str(entry.administrative_division_level_4_name) || undefined,
        });
    }
    const result = areas.slice(0, 30);
    areasCache.set(cacheKey, { areas: result, at: Date.now() });
    if (areasCache.size > AREAS_CACHE_MAX_ENTRIES) {
        // Map preserves insertion order, so the first key is the oldest entry.
        const oldest = areasCache.keys().next();
        if (!oldest.done) areasCache.delete(oldest.value);
    }
    return result;
}

/**
 * Physical origin identity for AFA STORE — 100% server-controlled from env.
 * There is NO fake fallback. Returns null when any required field is missing so
 * the caller can refuse the request with a user-friendly error (never exposing
 * env names to the browser).
 */
export function getBiteshipOriginIdentity(): BiteshipOriginIdentity | null {
    const originAreaId = process.env.BITESHIP_ORIGIN_AREA_ID?.trim() ?? "";
    const contactName = process.env.BITESHIP_ORIGIN_CONTACT_NAME?.trim() ?? "";
    const contactPhone = process.env.BITESHIP_ORIGIN_CONTACT_PHONE?.trim() ?? "";
    const address = process.env.BITESHIP_ORIGIN_ADDRESS?.trim() ?? "";
    if (!originAreaId || !contactName || !contactPhone || !address) return null;
    // Biteship validates `origin_contact_phone`, so the EXISTING checkout normalizer
    // is applied here (never a second phone implementation): a formatted env value
    // such as "+62 812-3456-7890" becomes canonical 62-digits. An env value with no
    // digits at all leaves the origin genuinely incomplete -> null (no fake origin).
    const canonicalOriginPhone = normalizeRecipientPhone(contactPhone);
    if (!canonicalOriginPhone) return null;
    return { contactName, contactPhone: canonicalOriginPhone, address, areaId: originAreaId };
}

/**
 * Creates a Biteship shipment (POST /v1/orders). The caller MUST already hold a
 * durable DB claim so concurrent requests cannot both reach this function.
 * Idempotency is further backed upstream by Biteship's official `reference_id`
 * deduplication (code 40002060), which is surfaced via BiteshipReferenceIdError.
 */
export async function createBiteshipOrder(input: BiteshipOrderInput): Promise<BiteshipCreatedOrder> {
    const payload = buildBiteshipOrderPayload(input);
    const { status, data } = await biteshipFetchRaw("/v1/orders", {
        method: "POST",
        body: JSON.stringify(payload),
    });

    if (status >= 200 && status < 300) {
        const normalized = normalizeBiteshipOrderResponse(data);
        if (!normalized) throw new BiteshipUnavailableError();
        return normalized;
    }

    // Upstream idempotency: reference_id already used for this order.
    const conflict = isBiteshipReferenceIdConflict(data);
    if (conflict?.orderId) {
        const error = new BiteshipError("Biteship order sudah dibuat untuk pesanan ini.", false);
        (error as BiteshipError & { biteshipReferenceIdConflict?: typeof conflict }).biteshipReferenceIdConflict = conflict;
        throw error;
    }

    // The REAL provider status/body decides the outcome — never a blanket "try again".
    // Account/provider failures (auth, quota, balance, rate limit) belong to OUR
    // Biteship account, so they are reported as a RETRYABLE provider failure and the
    // admin is told to retry; a transient 5xx is retryable as well. Any other 4xx is a
    // deliberate rejection of the shipment data (courier/service/area/weight) and gets
    // an actionable admin-safe message. Only sanitized fields are ever logged.
    const fields = pickBiteshipErrorFields(data);
    if (isBiteshipProviderFailure(status, fields)) {
        throw new BiteshipUnavailableError(BITESHIP_FAILURE_MESSAGES.provider, "UPSTREAM", "provider");
    }
    if (status >= 500) throw new BiteshipUnavailableError();
    throw new BiteshipError(BITESHIP_ORDER_REJECTED_MESSAGE);
}

/**
 * Retrieves an existing Biteship order (GET /v1/orders/:id) to refresh its
 * status/AWB/label. Used after a `reference_id` conflict to re-read the already
 * created shipment instead of creating a duplicate.
 */
export async function retrieveBiteshipOrder(orderId: string): Promise<BiteshipCreatedOrder | null> {
    const data = await biteshipFetch(`/v1/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
    return normalizeBiteshipOrderResponse(data);
}

