import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import { computeReceivable, PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";
import { wibStartOfDay } from "@/lib/wib";

export const runtime = "nodejs";

// GET /api/sales/summary — the sales home dashboard cards. All aggregation is
// scoped to the CURRENT sales person and computed server-side.
export async function GET() {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const salesId = current.sales.id;
    const todayStart = wibStartOfDay();

    const [activeStores, stockAgg, todayVisits, todayPayments, allSales, allPaid] = await Promise.all([
        prisma.consignmentStore.count({ where: { assignedSalesId: salesId, isActive: true } }),
        prisma.consignmentStock.aggregate({
            where: { store: { assignedSalesId: salesId, isActive: true } },
            _sum: { currentStock: true },
        }),
        prisma.salesVisit.findMany({
            where: { salesId, status: VISIT_STATUS_COMPLETED, visitedAt: { gte: todayStart } },
            select: {
                id: true,
                visitedAt: true,
                totalSold: true,
                totalSupplied: true,
                salesAmount: true,
                store: { select: { name: true } },
            },
            orderBy: { visitedAt: "desc" },
        }),
        prisma.storePayment.aggregate({
            where: { salesId, status: PAYMENT_STATUS_VALID, paymentDate: { gte: todayStart } },
            _sum: { amount: true },
        }),
        prisma.salesVisit.aggregate({
            where: { salesId, status: VISIT_STATUS_COMPLETED },
            _sum: { salesAmount: true },
        }),
        prisma.storePayment.aggregate({
            where: { salesId, status: PAYMENT_STATUS_VALID },
            _sum: { amount: true },
        }),
    ]);

    return NextResponse.json({
        salesName: current.sales.name,
        activeStores,
        consignedStock: stockAgg._sum.currentStock ?? 0,
        soldToday: todayVisits.reduce((sum, visit) => sum + visit.totalSold, 0),
        settlementToday: todayPayments._sum.amount ?? 0,
        receivable: computeReceivable(allSales._sum.salesAmount ?? 0, allPaid._sum.amount ?? 0),
        todayVisits: todayVisits.map((visit) => ({
            id: visit.id,
            visitedAt: visit.visitedAt,
            storeName: visit.store.name,
            totalSold: visit.totalSold,
            totalSupplied: visit.totalSupplied,
            salesAmount: visit.salesAmount,
        })),
    });
}