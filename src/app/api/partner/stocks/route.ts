import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentPartner } from "@/lib/server-auth";

export const runtime = "nodejs";

// Partner stock ledger + recent movements. `movements` is capped to the latest
// 100 rows; the client can page further later if needed.
export async function GET() {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;

    try {
        const [stocks, movements] = await Promise.all([
            prisma.partnerStock.findMany({
                where: { partnerId },
                orderBy: { updatedAt: "desc" },
                select: {
                    productId: true,
                    quantity: true,
                    updatedAt: true,
                    product: { select: { name: true, image: true, price: true } },
                },
            }),
            prisma.partnerStockMovement.findMany({
                where: { partnerId },
                orderBy: { createdAt: "desc" },
                take: 100,
                select: {
                    id: true,
                    productId: true,
                    type: true,
                    quantity: true,
                    unitPrice: true,
                    referenceType: true,
                    referenceId: true,
                    note: true,
                    createdAt: true,
                    product: { select: { name: true } },
                },
            }),
        ]);

        return NextResponse.json({
            stocks: stocks.map((stock) => ({
                productId: stock.productId,
                name: stock.product.name,
                image: stock.product.image,
                quantity: stock.quantity,
                unitCost: stock.product.price,
                updatedAt: stock.updatedAt,
            })),
            movements: movements.map((movement) => ({
                id: movement.id,
                productId: movement.productId,
                productName: movement.product?.name ?? "Produk",
                type: movement.type,
                quantity: movement.quantity,
                unitPrice: movement.unitPrice,
                referenceType: movement.referenceType,
                referenceId: movement.referenceId,
                note: movement.note,
                createdAt: movement.createdAt,
            })),
        });
    } catch (error) {
        console.error("partner_stocks_failed", {
            category: "partner_stocks",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Stok gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
