import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";
import { getBiteshipRates, BiteshipError, BiteshipUnavailableError } from "@/lib/biteship";
import { denyArbitraryAreaId, normalizeAreaId } from "@/lib/shipping-destination";
import { calculateTotalWeight } from "@/lib/shipping-weight";

export const runtime = "nodejs";

type RateRequest = { destinationAreaId?: string; items?: Array<{ id: string; qty: number }> };

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
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as RateRequest;
        const destinationAreaId = normalizeAreaId(body.destinationAreaId);
        if (!destinationAreaId || denyArbitraryAreaId(destinationAreaId)) {
            return NextResponse.json({ message: "Tujuan pengiriman tidak valid. Pilih kembali alamat tujuan." }, { status: 400 });
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

        const result = await getBiteshipRates({
            destinationAreaId,
            items: valid.map((item) => ({ name: item.name, weight: item.weight, quantity: item.qty, value: item.price })),
        });

        if (!result.rates.length) {
            return NextResponse.json({ message: "Belum ada layanan pengiriman untuk tujuan ini." }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            destinationAreaId: result.destinationAreaId,
            totalWeight,
            rates: result.rates.map((rate) => ({
                courierCode: rate.courierCode,
                courierName: rate.courierName,
                serviceCode: rate.serviceCode,
                serviceName: rate.serviceName,
                price: rate.price,
                duration: rate.duration,
                quoteRef: rate.quoteRef,
            })),
        });
    } catch (error) {
        if (error instanceof BiteshipUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 });
        }
        if (error instanceof BiteshipError) {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }
        console.error("shipping_rates_failed", { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ message: "Terjadi kesalahan server." }, { status: 500 });
    }
}
