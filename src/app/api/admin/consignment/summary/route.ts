import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { computeReceivable, PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";
import { wibDaysAgo, wibStartOfDay, wibStartOfMonth } from "@/lib/wib";

export const runtime = "nodejs";

// GET /api/admin/consignment/summary?period=today|7d|30d|month|custom
// Admin-only dashboard aggregation for Sales & Titip Jual. Money totals are
// computed server-side from COMPLETED visits and VALID payments only.

const PERIODS = ["today", "7d", "30d", "month", "custom"] as const;
type Period = (typeof PERIODS)[number];

function resolveRange(period: Period, fromParam: string | null, toParam: string | null): { gte?: Date; lte?: Date } {
    switch (period) {
        case "today":
            return { gte: wibStartOfDay() };
        case "7d":
            return { gte: wibDaysAgo(6) };
        case "30d":
            return { gte: wibDaysAgo(29) };
        case "month":
            return { gte: wibStartOfMonth() };
        case "custom": {
            const gte = fromParam ? new Date(fromParam) : undefined;
            const lte = toParam ? new Date(toParam) : undefined;
            return {
                ...(gte && !Number.isNaN(gte.getTime()) ? { gte } : {}),
                ...(lte && !Number.isNaN(lte.getTime()) ? { lte } : {}),
            };
        }
    }
}

export async function GET(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") ?? "today";
    const period: Period = (PERIODS as readonly string[]).includes(periodParam) ? (periodParam as Period) : "today";
    const range = resolveRange(period, searchParams.get("from"), searchParams.get("to"));
    const visitedAt = Object.keys(range).length ? range : undefined;

    try {
    const [activeStores, stockAgg, periodVisits, periodReturns, periodPayments, allSales, allPaid, todaySold, monthSold] = await Promise.all([
        prisma.consignmentStore.count({ where: { isActive: true } }),
        prisma.consignmentStock.aggregate({ _sum: { currentStock: true } }),
        prisma.salesVisit.aggregate({
            where: { status: VISIT_STATUS_COMPLETED, ...(visitedAt ? { visitedAt } : {}) },
            _sum: { totalSold: true, totalSupplied: true, salesAmount: true },
            _count: { id: true },
        }),
        prisma.salesVisitItem.aggregate({
            where: { visit: { status: VISIT_STATUS_COMPLETED, ...(visitedAt ? { visitedAt } : {}) } },
            _sum: { quantityReturned: true, quantityDamaged: true },
        }),
        prisma.storePayment.aggregate({
            where: { status: PAYMENT_STATUS_VALID, ...(visitedAt ? { paymentDate: visitedAt } : {}) },
            _sum: { amount: true },
        }),
        prisma.salesVisit.aggregate({ where: { status: VISIT_STATUS_COMPLETED }, _sum: { salesAmount: true } }),
        prisma.storePayment.aggregate({ where: { status: PAYMENT_STATUS_VALID }, _sum: { amount: true } }),
        prisma.salesVisit.aggregate({
            where: { status: VISIT_STATUS_COMPLETED, visitedAt: { gte: wibStartOfDay() } },
            _sum: { totalSold: true },
        }),
        prisma.salesVisit.aggregate({
            where: { status: VISIT_STATUS_COMPLETED, visitedAt: { gte: wibStartOfMonth() } },
            _sum: { totalSold: true },
        }),
    ]);

    return NextResponse.json({
        period,
        activeStores,
        consignedStock: stockAgg._sum.currentStock ?? 0,
        soldToday: todaySold._sum.totalSold ?? 0,
        soldThisMonth: monthSold._sum.totalSold ?? 0,
        periodSold: periodVisits._sum.totalSold ?? 0,
        periodSupplied: periodVisits._sum.totalSupplied ?? 0,
        periodVisitCount: periodVisits._count.id,
        omzet: periodVisits._sum.salesAmount ?? 0,
        settlement: periodPayments._sum.amount ?? 0,
        returned: periodReturns._sum.quantityReturned ?? 0,
        damaged: periodReturns._sum.quantityDamaged ?? 0,
        receivable: computeReceivable(allSales._sum.salesAmount ?? 0, allPaid._sum.amount ?? 0),
    });
    } catch (error) {
        console.error("consignment_query_failed", {
            route: "/api/admin/consignment/summary",
            code: error && typeof error === "object" && "code" in error ? error.code : undefined,
            category: error instanceof Error ? error.name : "unknown",
        });
        return NextResponse.json({ message: "Terjadi kesalahan server." }, { status: 500 });
    }
}