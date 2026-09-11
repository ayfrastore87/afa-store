import { NextResponse } from "next/server";

import { getPartnerPriceStatus } from "@/lib/partner-dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentPartner } from "@/lib/server-auth";

export const runtime = "nodejs";

// Read-only. The partner can only see their own cost price history; the partnerId
// comes exclusively from the authenticated session (never from the request), so a
// partner can never read another partner's prices (IDOR-safe).
export async function GET() {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;
    const now = new Date();

    try {
        const [products, priceRows] = await Promise.all([
            prisma.product.findMany({
                where: { isActive: true },
                orderBy: { name: "asc" },
                select: { id: true, name: true, price: true, size: true, flavor: true },
            }),
            prisma.partnerProductPrice.findMany({
                where: { partnerId },
                orderBy: { effectiveFrom: "desc" },
                include: { product: { select: { name: true } } },
            }),
        ]);

        // Active custom price per product (latest effectiveFrom among active rows),
        // falling back to the catalog price (F-5 pending business decision).
        const activeByProduct = new Map<string, (typeof priceRows)[number]>();
        for (const row of priceRows) {
            if (!activeByProduct.has(row.productId) && getPartnerPriceStatus(row.effectiveFrom, row.effectiveTo, now) === "Aktif") {
                activeByProduct.set(row.productId, row);
            }
        }

        const prices = products.map((product) => {
            const active = activeByProduct.get(product.id);
            return {
                productId: product.id,
                name: product.name,
                price: product.price,
                costPrice: active ? active.price : product.price,
                hasCustomPrice: Boolean(active),
                effectiveFrom: active ? active.effectiveFrom : null,
                effectiveTo: active ? active.effectiveTo : null,
                size: product.size,
                flavor: product.flavor,
            };
        });

        const history = priceRows.map((row) => ({
            id: row.id,
            productId: row.productId,
            productName: row.product.name,
            price: row.price,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
            status: getPartnerPriceStatus(row.effectiveFrom, row.effectiveTo, now),
        }));

        return NextResponse.json({ prices, history });
    } catch (error) {
        console.error("partner_prices_failed", {
            category: "partner_prices",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Harga modal gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
