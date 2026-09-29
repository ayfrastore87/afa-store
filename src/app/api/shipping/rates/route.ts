import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCashier, getCurrentUser } from "@/lib/server-auth";
import { getBiteshipRates, getBiteshipCoordinateRates, BiteshipError, BiteshipUnavailableError, type BiteshipCategorizedRate } from "@/lib/biteship";
import { BITESHIP_FAILURE_MESSAGES } from "@/lib/biteship-failure";
import { denyArbitraryAreaId, normalizeAreaId } from "@/lib/shipping-destination";
import { calculateTotalWeight } from "@/lib/shipping-weight";

export const runtime = "nodejs";

type RateRequest = { destinationAreaId?: string; destinationLatitude?: number; destinationLongitude?: number; shippingMode?: "instant" | "package"; items?: Array<{ id: string; qty: number }> };

function parseItems(value: unknown): Array<{ id: string; qty: number }> {
    if (!Array.isArray(value)) return [];
    const result: Array<{ id: string; qty: number }> = [];
    for (const entry of value) {
        const item = entry as Record<string, unknown>;
        if (typeof item?.id !== "string" || !item.id.trim()) continue;
        const qty = Number(item.qty);
        if (!Number.isInteger(qty) || qty < 1) continue;
        result.push({ id: item.id.trim(), qty });
    }
    return result;
}

/*
 * POST /api/shipping/rates
 * Authoritative rate quote: re-reads products from the DB, computes total weight
 * server-side, and asks Biteship for live rates. Never trusts client price/weight.
 */
export async function POST(request: Request) {
    try {
        const user = (await getCurrentUser()) ?? (await getCurrentCashier());
        if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as RateRequest;
        const destinationAreaId = normalizeAreaId(body.destinationAreaId);
        const instantOnly = body.shippingMode === "instant";
        if (!instantOnly && (!destinationAreaId || denyArbitraryAreaId(destinationAreaId))) {
            return NextResponse.json({ message: BITESHIP_FAILURE_MESSAGES.invalid_destination }, { status: 400 });
        }
        const items = parseItems(body.items);
        if (!items.length) return NextResponse.json({ message: "Keranjang kosong." }, { status: 400 });

        const products = await prisma.product.findMany({
            where: { id: { in: items.map((item) => item.id) }, isActive: true },
            select: { id: true, name: true, weight: true, stock: true, price: true },
        });
        const productMap = new Map(products.map((product) => [product.id, product]));
        const authoritative = items.map((item) => {
            const product = productMap.get(item.id);
            if (!product) return null;
            return { id: item.id, name: product.name, weight: product.weight, qty: item.qty, price: product.price, stock: product.stock };
        });
        if (authoritative.includes(null)) {
            return NextResponse.json({ message: "Produk tidak ditemukan atau tidak tersedia." }, { status: 404 });
        }
        const valid = authoritative.filter((item): item is NonNullable<typeof item> => item !== null);
        if (valid.some((item) => item.qty > item.stock)) {
            return NextResponse.json({ message: "Stok produk tidak mencukupi." }, { status: 409 });
        }

        const totalWeight = calculateTotalWeight(valid);
        if (totalWeight < 1) {
            return NextResponse.json({ message: "Berat produk tidak valid. Hubungi admin." }, { status: 400 });
        }

        const packageResult = destinationAreaId ? await getBiteshipRates({
            destinationAreaId,
            items: valid.map((item) => ({ name: item.name, weight: item.weight, quantity: item.qty, value: item.price })),
        }) : null;

        const lat = body.destinationLatitude;
        const lon = body.destinationLongitude;
        const validCoordinates = typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
        let instantRates: BiteshipCategorizedRate[] = [];
        if (validCoordinates && (instantOnly || body.shippingMode !== "package")) {
            try { instantRates = (await getBiteshipCoordinateRates({ destinationLatitude: lat, destinationLongitude: lon, items: valid.map((item) => ({ name: item.name, weight: item.weight, quantity: item.qty, value: item.price })) })).rates; }
            catch (error) { if (error instanceof BiteshipUnavailableError && error.kind !== "provider") instantRates = []; else throw error; }
        }
        const seen = new Set<string>();
        const rates = [...instantRates.filter((r) => r.shipmentCategory === "instant" || r.shipmentCategory === "same_day"), ...(instantOnly ? [] : (packageResult?.rates ?? []).filter((r) => r.shipmentCategory === "regular"))]
            .filter((rate) => { const key = `${rate.courierCode}|${rate.serviceCode}`; if (seen.has(key)) return false; seen.add(key); return true; });
        if (!rates.length) {
            // Genuine "no service for this destination" — distinct from an upstream
            // outage so the UI never blames the address for a provider problem.
            return NextResponse.json({ message: BITESHIP_FAILURE_MESSAGES.no_rates, code: "NO_RATES" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            destinationAreaId: packageResult?.destinationAreaId ?? destinationAreaId ?? null,
            totalWeight,
            rates: rates.map((rate) => ({
                courierCode: rate.courierCode,
                courierName: rate.courierName,
                serviceCode: rate.serviceCode,
                serviceName: rate.serviceName,
                description: rate.description,
                price: rate.price,
                duration: rate.duration,
                shipmentCategory: rate.shipmentCategory,
                quoteRef: rate.quoteRef,
            })),
        });
    } catch (error) {
        if (error instanceof BiteshipUnavailableError) {
            const code = error.code === "CONFIGURATION" ? "CONFIGURATION" : error.kind === "provider" ? "PROVIDER" : "UPSTREAM";
            // Never expose env/API key/upstream details — return a generic message plus a safe code.
            // A provider/account failure (e.g. insufficient Biteship balance) is reported as its own
            // code so the customer is never told the address is unsupported.
            const message =
                code === "CONFIGURATION"
                    ? "Layanan pengiriman belum dapat digunakan."
                    : code === "PROVIDER"
                        ? BITESHIP_FAILURE_MESSAGES.provider
                        : "Layanan pengiriman sedang mengalami gangguan. Silakan coba lagi.";
            return NextResponse.json({ message, code }, { status: 503 });
        }
        if (error instanceof BiteshipError) {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }
        console.error("shipping_rates_failed", { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ message: "Terjadi kesalahan server." }, { status: 500 });
    }
}
