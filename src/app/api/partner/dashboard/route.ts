import { NextResponse } from "next/server";

import { PARTNER_LOW_STOCK_THRESHOLD } from "@/lib/partner-dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentPartner } from "@/lib/server-auth";
import { wibStartOfDay, wibStartOfMonth } from "@/lib/wib";

export const runtime = "nodejs";

// WIB calendar helpers moved to lib/wib.ts (shared with the sales report).

export async function GET() {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;
    const now = new Date();
    const startOfDay = wibStartOfDay(now);
    const startOfMonth = wibStartOfMonth(now);

    try {
        const [today, month, profitMonth, stockAgg, lowStock, inStock, outOfStock, recentSales, bestSellerGroup, lowStockRows] = await Promise.all([
            prisma.partnerSale.aggregate({
                where: { partnerId, soldAt: { gte: startOfDay } },
                _count: { _all: true },
                _sum: { total: true, grossProfit: true },
            }),
            prisma.partnerSale.aggregate({
                where: { partnerId, soldAt: { gte: startOfMonth } },
                _count: { _all: true },
                _sum: { total: true },
            }),
            prisma.partnerSale.aggregate({
                where: { partnerId, soldAt: { gte: startOfMonth } },
                _sum: { grossProfit: true },
            }),
            prisma.partnerStock.aggregate({
                where: { partnerId },
                _sum: { quantity: true },
                _count: { _all: true },
            }),
            prisma.partnerStock.count({ where: { partnerId, quantity: { gt: 0, lte: PARTNER_LOW_STOCK_THRESHOLD } } }),
            prisma.partnerStock.count({ where: { partnerId, quantity: { gt: 0 } } }),
            prisma.partnerStock.count({ where: { partnerId, quantity: 0 } }),
            prisma.partnerSale.findMany({
                where: { partnerId },
                orderBy: { soldAt: "desc" },
                take: 5,
                select: {
                    id: true,
                    saleNumber: true,
                    soldAt: true,
                    total: true,
                    grossProfit: true,
                    items: { select: { quantity: true } },
                },
            }),
            prisma.partnerSaleItem.groupBy({
                by: ["name"],
                where: { sale: { partnerId } },
                _sum: { quantity: true, subtotalRevenue: true },
                orderBy: { _sum: { quantity: "desc" } },
                take: 5,
            }),
            prisma.partnerStock.findMany({
                where: { partnerId, quantity: { gt: 0, lte: PARTNER_LOW_STOCK_THRESHOLD } },
                orderBy: { quantity: "asc" },
                select: {
                    productId: true,
                    quantity: true,
                    product: { select: { name: true, image: true } },
                },
            }),
        ]);

        return NextResponse.json({
            today: {
                revenue: today._sum.total ?? 0,
                count: today._count._all,
                grossProfit: today._sum.grossProfit ?? 0,
            },
            month: {
                revenue: month._sum.total ?? 0,
                count: month._count._all,
                grossProfit: profitMonth._sum.grossProfit ?? 0,
            },
            stock: {
                totalUnits: stockAgg._sum.quantity ?? 0,
                skuCount: stockAgg._count._all,
                inStock,
                lowStock,
                outOfStock,
                lowStockItems: lowStockRows.map((row) => ({
                    productId: row.productId,
                    name: row.product.name,
                    image: row.product.image,
                    quantity: row.quantity,
                })),
            },
            bestSellers: bestSellerGroup.map((row) => ({
                name: row.name,
                quantity: row._sum.quantity ?? 0,
                revenue: row._sum.subtotalRevenue ?? 0,
            })),
            recentSales: recentSales.map((sale) => ({
                id: sale.id,
                saleNumber: sale.saleNumber,
                soldAt: sale.soldAt,
                total: sale.total,
                grossProfit: sale.grossProfit,
                itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
            })),
        });
    } catch (error) {
        console.error("partner_dashboard_failed", {
            category: "partner_dashboard",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Ringkasan gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
