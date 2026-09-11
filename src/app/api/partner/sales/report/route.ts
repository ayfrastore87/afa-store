import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentPartner } from "@/lib/server-auth";
import { wibDaysAgo, wibStartOfDay, wibStartOfMonth, wibStartOfYear } from "@/lib/wib";

export const runtime = "nodejs";

const PERIODS = ["hari", "minggu", "bulan", "tahun", "semua"] as const;
type Period = (typeof PERIODS)[number];

// A period's lower bound in WIB. "semua" has no lower bound (all time).
function periodStart(period: Period): Date | null {
    const now = new Date();
    switch (period) {
        case "hari":
            return wibStartOfDay(now);
        case "minggu":
            return wibDaysAgo(6, now);
        case "bulan":
            return wibStartOfMonth(now);
        case "tahun":
            return wibStartOfYear(now);
        case "semua":
            return null;
    }
}

// READ-ONLY sales report for the partner (Tahap VIII "Laporan penjualan").
// Aggregates PartnerSale / PartnerSaleItem for a WIB-aligned period. The period
// is the only client input; partnerId is always derived from the session.
export async function GET(request: Request) {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") ?? "bulan";
    const period: Period = (PERIODS as readonly string[]).includes(periodParam) ? (periodParam as Period) : "bulan";

    const from = periodStart(period);
    const saleWhere = { partnerId, ...(from ? { soldAt: { gte: from } } : {}) };
    const itemWhere = { sale: { partnerId, ...(from ? { soldAt: { gte: from } } : {}) } };

    try {
        const [sales, summary, itemAgg, groupedItems] = await Promise.all([
            prisma.partnerSale.findMany({
                where: saleWhere,
                orderBy: { soldAt: "desc" },
                take: 200,
                include: {
                    items: { select: { productId: true, name: true, quantity: true, sellingPriceSnapshot: true, subtotalRevenue: true } },
                },
            }),
            prisma.partnerSale.aggregate({
                where: saleWhere,
                _count: { _all: true },
                _sum: { total: true, grossProfit: true },
            }),
            prisma.partnerSaleItem.aggregate({
                where: itemWhere,
                _sum: { quantity: true },
            }),
            prisma.partnerSaleItem.groupBy({
                by: ["name"],
                where: itemWhere,
                _sum: { quantity: true, subtotalRevenue: true, subtotalCost: true },
            }),
        ]);

        const topProducts = groupedItems
            .map((row) => ({
                name: row.name,
                quantity: row._sum.quantity ?? 0,
                revenue: row._sum.subtotalRevenue ?? 0,
                profit: (row._sum.subtotalRevenue ?? 0) - (row._sum.subtotalCost ?? 0),
            }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        return NextResponse.json({
            period,
            summary: {
                revenue: summary._sum.total ?? 0,
                count: summary._count._all,
                grossProfit: summary._sum.grossProfit ?? 0,
                totalItems: itemAgg._sum.quantity ?? 0,
            },
            sales: sales.map((sale) => ({
                id: sale.id,
                saleNumber: sale.saleNumber,
                soldAt: sale.soldAt,
                subtotal: sale.subtotal,
                total: sale.total,
                grossProfit: sale.grossProfit,
                status: sale.status,
                note: sale.note,
                itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
                items: sale.items.map((item) => ({
                    productId: item.productId,
                    name: item.name,
                    quantity: item.quantity,
                    sellingPrice: item.sellingPriceSnapshot,
                    subtotalRevenue: item.subtotalRevenue,
                })),
            })),
            topProducts,
        });
    } catch (error) {
        console.error("partner_sales_report_failed", {
            category: "partner_sales_report",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Laporan gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
