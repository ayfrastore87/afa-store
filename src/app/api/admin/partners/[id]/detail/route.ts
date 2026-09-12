import { NextResponse } from "next/server";

import { PARTNER_LOW_STOCK_THRESHOLD } from "@/lib/partner-dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { wibStartOfDay, wibStartOfMonth } from "@/lib/wib";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/admin/partners/[id]/detail
//
// Admin-only, READ-ONLY single-partner view ("detail mitra"). Aggregates the
// partner profile, sales summary (today / this month / all-time), stock health,
// latest location, recent sales, recent stock movements, and top products in a
// single Promise.all batch — no N+1 queries. The partner id comes from the URL
// but the caller is always verified via getCurrentAdmin().
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const now = new Date();
    const startOfDay = wibStartOfDay(now);
    const startOfMonth = wibStartOfMonth(now);

    try {
        const partner = await prisma.partner.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, name: true, email: true, phone: true, isActive: true, role: true } },
            },
        });
        if (!partner) return NextResponse.json({ message: "Mitra tidak ditemukan." }, { status: 404 });

        const [today, month, allTime, stockAgg, lowStock, inStock, outOfStock, recentSales, movements, topProducts, location] =
            await Promise.all([
                prisma.partnerSale.aggregate({
                    where: { partnerId: id, soldAt: { gte: startOfDay } },
                    _count: { _all: true },
                    _sum: { total: true, grossProfit: true },
                }),
                prisma.partnerSale.aggregate({
                    where: { partnerId: id, soldAt: { gte: startOfMonth } },
                    _count: { _all: true },
                    _sum: { total: true, grossProfit: true },
                }),
                prisma.partnerSale.aggregate({
                    where: { partnerId: id },
                    _count: { _all: true },
                    _sum: { total: true, grossProfit: true },
                }),
                prisma.partnerStock.aggregate({
                    where: { partnerId: id },
                    _sum: { quantity: true },
                    _count: { _all: true },
                }),
                prisma.partnerStock.count({ where: { partnerId: id, quantity: { gt: 0, lte: PARTNER_LOW_STOCK_THRESHOLD } } }),
                prisma.partnerStock.count({ where: { partnerId: id, quantity: { gt: 0 } } }),
                prisma.partnerStock.count({ where: { partnerId: id, quantity: 0 } }),
                prisma.partnerSale.findMany({
                    where: { partnerId: id },
                    orderBy: { soldAt: "desc" },
                    take: 8,
                    select: {
                        id: true,
                        saleNumber: true,
                        soldAt: true,
                        total: true,
                        grossProfit: true,
                        status: true,
                        items: { select: { quantity: true } },
                    },
                }),
                prisma.partnerStockMovement.findMany({
                    where: { partnerId: id },
                    orderBy: { createdAt: "desc" },
                    take: 10,
                    select: {
                        id: true,
                        type: true,
                        quantity: true,
                        unitPrice: true,
                        referenceType: true,
                        note: true,
                        createdAt: true,
                        product: { select: { name: true } },
                    },
                }),
                prisma.partnerSaleItem.groupBy({
                    by: ["name"],
                    where: { sale: { partnerId: id } },
                    _sum: { quantity: true, subtotalRevenue: true },
                    orderBy: { _sum: { quantity: "desc" } },
                    take: 5,
                }),
                prisma.partnerLocation.findFirst({
                    where: { partnerId: id },
                    orderBy: { recordedAt: "desc" },
                    select: {
                        id: true,
                        latitude: true,
                        longitude: true,
                        accuracy: true,
                        source: true,
                        consent: true,
                        recordedAt: true,
                    },
                }),
            ]);

        return NextResponse.json({
            partner: {
                id: partner.id,
                partnerCode: partner.partnerCode,
                partnerType: partner.partnerType,
                status: partner.status,
                displayName: partner.displayName,
                businessName: partner.businessName,
                phone: partner.phone,
                address: partner.address,
                village: partner.village,
                district: partner.district,
                city: partner.city,
                postalCode: partner.postalCode,
                createdAt: partner.createdAt,
                updatedAt: partner.updatedAt,
                user: partner.user,
            },
            sales: {
                today: { revenue: today._sum.total ?? 0, count: today._count._all, grossProfit: today._sum.grossProfit ?? 0 },
                month: { revenue: month._sum.total ?? 0, count: month._count._all, grossProfit: month._sum.grossProfit ?? 0 },
                allTime: { revenue: allTime._sum.total ?? 0, count: allTime._count._all, grossProfit: allTime._sum.grossProfit ?? 0 },
            },
            stock: {
                totalUnits: stockAgg._sum.quantity ?? 0,
                skuCount: stockAgg._count._all,
                lowStock,
                inStock,
                outOfStock,
            },
            location,
            recentSales: recentSales.map((sale) => ({
                id: sale.id,
                saleNumber: sale.saleNumber,
                soldAt: sale.soldAt,
                total: sale.total,
                grossProfit: sale.grossProfit,
                status: sale.status,
                itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
            })),
            movements: movements.map((movement) => ({
                id: movement.id,
                type: movement.type,
                quantity: movement.quantity,
                unitPrice: movement.unitPrice,
                referenceType: movement.referenceType,
                note: movement.note,
                createdAt: movement.createdAt,
                productName: movement.product?.name ?? "Produk",
            })),
            topProducts: topProducts.map((row) => ({
                name: row.name,
                quantity: row._sum.quantity ?? 0,
                revenue: row._sum.subtotalRevenue ?? 0,
            })),
        });
    } catch (error) {
        console.error("admin_partner_detail_failed", {
            category: "admin_partner_detail",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Detail mitra gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
