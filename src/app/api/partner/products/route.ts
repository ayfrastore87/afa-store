import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentPartner } from "@/lib/server-auth";

export const runtime = "nodejs";

// Catalog for the partner POS and the stock-movement product picker. Returns
// every active product annotated with the partner's current stock and cost
// price. The POS filters to products with stock > 0 on the client.
export async function GET() {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;

    try {
        const [products, stocks, priceRows] = await Promise.all([
            prisma.product.findMany({
                where: { isActive: true },
                orderBy: { name: "asc" },
                select: { id: true, name: true, price: true, size: true, flavor: true, image: true },
            }),
            prisma.partnerStock.findMany({
                where: { partnerId },
                select: { productId: true, quantity: true },
            }),
            prisma.partnerProductPrice.findMany({
                where: { partnerId, effectiveTo: null },
                orderBy: { effectiveFrom: "desc" },
                select: { productId: true, price: true },
            }),
        ]);

        const stockMap = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
        const costMap = new Map<string, number>();
        for (const row of priceRows) {
            if (!costMap.has(row.productId)) costMap.set(row.productId, row.price);
        }

        const list = products.map((product) => ({
            productId: product.id,
            name: product.name,
            price: product.price,
            costPrice: costMap.get(product.id) ?? product.price,
            partnerStock: stockMap.get(product.id) ?? 0,
            size: product.size,
            flavor: product.flavor,
            image: product.image,
        }));

        return NextResponse.json({ products: list });
    } catch (error) {
        console.error("partner_products_failed", {
            category: "partner_products",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Produk gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
