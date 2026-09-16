export type BiteshipRate = {
    courierCode: string;
    courierName: string;
    serviceCode: string;
    serviceName: string;
    // Semantic fields kept verbatim from the Biteship pricing row so the rate can
    // be classified (⚡ instant / ☀ same day / 📦 regular) without guessing.
    serviceType: string | null;
    description: string | null;
    price: number;
    duration: string | null;
    quoteRef: string | null;
};

export type BiteshipRawPricing = {
    courier_code?: string;
    courier_name?: string;
    courier_service_code?: string;
    courier_service_name?: string;
    price?: number | string;
    duration?: string | null;
    company?: string;
    courier_company?: string;
    service_type?: string;
    description?: string;
    tier?: string;
    [key: string]: unknown;
};

export type BiteshipRatesRawResponse = {
    success?: boolean;
    origin?: { area_id?: string | null };
    destination?: { area_id?: string | null };
    pricing?: BiteshipRawPricing[];
    [key: string]: unknown;
};

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.round(parsed) : null;
    }
    return null;
}

function readText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

export function normalizeRate(raw: BiteshipRawPricing): BiteshipRate | null {
    const courierCode = (raw.courier_code || raw.company || raw.courier_company || "").toString().trim();
    const serviceCode = (raw.courier_service_code || raw.service_type || raw.tier || "").toString().trim();
    const price = toNumber(raw.price);
    if (!courierCode || !serviceCode || price === null || price < 0) return null;
    const courierName = (raw.courier_name || raw.company || raw.courier_company || courierCode).toString().trim();
    const serviceName = (raw.courier_service_name || serviceCode).toString().trim();
    const duration = typeof raw.duration === "string" && raw.duration.trim() ? raw.duration.trim() : null;
    const quoteRef = [courierCode, serviceCode].join("|");
    return {
        courierCode,
        courierName,
        serviceCode,
        serviceName,
        serviceType: readText(raw.service_type) ?? readText(raw.tier),
        description: readText(raw.description),
        price,
        duration,
        quoteRef,
    };
}

export function normalizeBiteshipRatesResponse(data: unknown): BiteshipRate[] {
    const raw = (data ?? {}) as BiteshipRatesRawResponse;
    const pricing = Array.isArray(raw.pricing) ? raw.pricing : [];
    const rates: BiteshipRate[] = [];
    for (const entry of pricing) {
        const normalized = normalizeRate(entry);
        if (normalized) rates.push(normalized);
    }
    rates.sort((a, b) => a.price - b.price || a.courierName.localeCompare(b.courierName) || a.serviceName.localeCompare(b.serviceName));
    return rates;
}
