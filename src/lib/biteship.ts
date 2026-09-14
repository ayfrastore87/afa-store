import "server-only";

import { normalizeBiteshipRatesResponse } from "@/lib/biteship-normalize";
import type { BiteshipRate } from "@/lib/biteship-normalize";

export type { BiteshipRate };

export const BITESHIP_DEFAULT_TIMEOUT_MS = 10_000;

export type BiteshipItem = { name?: string; weight: number; quantity: number; value?: number };
export type BiteshipRateRequest = { destinationAreaId: string; items: BiteshipItem[] };

export type BiteshipArea = { id: string; name: string; type: string };

export type BiteshipRatesResult = {
    originAreaId: string;
    destinationAreaId: string;
    rates: BiteshipRate[];
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
    areas?: Array<{ id?: string; name?: string; type?: string; administrative_division_level?: number | string; [key: string]: unknown }>;
    [key: string]: unknown;
};

export class BiteshipError extends Error {
    constructor(message: string, public readonly retryable: boolean = false) {
        super(message);
        this.name = "BiteshipError";
    }
}

export class BiteshipUnavailableError extends BiteshipError {
    constructor(message = "Layanan pengiriman sedang tidak tersedia. Silakan coba lagi nanti.") {
        super(message, true);
        this.name = "BiteshipUnavailableError";
    }
}

export function getBiteshipConfig() {
    const apiKey = process.env.BITESHIP_API_KEY?.trim();
    const originAreaId = process.env.BITESHIP_ORIGIN_AREA_ID?.trim();
    const baseUrl = (process.env.BITESHIP_BASE_URL?.trim() || "https://api.biteship.com").replace(/\/+$/, "");
    if (!apiKey) throw new BiteshipUnavailableError("Konfigurasi pengiriman belum lengkap. Silakan hubungi admin.");
    if (!originAreaId) throw new BiteshipUnavailableError("Lokasi pengiriman toko belum diatur. Silakan hubungi admin.");
    return { apiKey, originAreaId, baseUrl };
}

export function getBiteshipOriginAreaId() {
    return getBiteshipConfig().originAreaId;
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
            const retryable = response.status >= 500;
            console.error("biteship_request_failed", { path, status: response.status });
            if (retryable) throw new BiteshipUnavailableError();
            throw new BiteshipError("Alamat pengiriman tidak dapat diproses. Periksa kembali alamat Anda.");
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

export async function getBiteshipRates(request: BiteshipRateRequest): Promise<BiteshipRatesResult> {
    const { originAreaId: configuredOrigin } = getBiteshipConfig();
    const items = request.items.map((item) => ({
        name: item.name || "Produk",
        weight: item.weight,
        quantity: item.quantity,
        value: item.value ?? 0,
    }));
    const data = await biteshipFetch("/v1/rates/couriers", {
        method: "POST",
        body: JSON.stringify({ origin_area_id: configuredOrigin, destination_area_id: request.destinationAreaId, couriers: "", items }),
    });
    const raw = data as BiteshipRatesRawResponse;
    const rates = await normalizeBiteshipRatesResponse(raw);
    return {
        originAreaId: raw.origin?.area_id || configuredOrigin,
        destinationAreaId: raw.destination?.area_id || request.destinationAreaId,
        rates,
    };
}

export async function searchBiteshipAreas(input: string, type?: "single" | "double"): Promise<BiteshipArea[]> {
    const trimmed = input.trim();
    if (!trimmed) return [];
    const params = new URLSearchParams({ countries: "ID", input: trimmed, type: type || "double" });
    const data = await biteshipFetch(`/v1/maps/areas?${params.toString()}`, { method: "GET" });
    const raw = data as BiteshipAreasRawResponse;
    const areas: BiteshipArea[] = [];
    for (const entry of raw.areas ?? []) {
        if (!entry.id || !entry.name) continue;
        const level = entry.administrative_division_level ?? entry.type ?? "";
        areas.push({ id: entry.id.toString(), name: entry.name.toString(), type: `level_${level}` });
    }
    return areas.slice(0, 30);
}

