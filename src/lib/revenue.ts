import "server-only";

import { prisma } from "@/lib/prisma";
import { periodStart, type ReportPeriod } from "@/lib/admin-report";
import { calculateRevenue, CASHIER_SOURCES, isValidPaidOrder, type RevenueOrder, type RevenueResult, type RevenueRow } from "@/lib/revenue-core";
import { wibStartOfDay, wibStartOfMonth, wibStartOfYear, wibDaysAgo } from "@/lib/wib";

export type RevenueSource = "ONLINE" | (typeof CASHIER_SOURCES)[number];
export { calculateRevenue, isValidPaidOrder } from "@/lib/revenue-core";

/**
 * Compatibility policy: Payment.status is authoritative when a Payment row
 * exists. Legacy POS rows created by the proven Kasir write path may have no
 * Payment row, so they qualify only when paymentStatus=PAID AND paidAt exists.
 * Online orders never use that fallback; this prevents unpaid checkout rows
 * from becoming revenue while preserving historical POS revenue.
 */
export function revenuePeriodStart(period: ReportPeriod, now = new Date()): Date | null {
    if (period === "semua") return null;
    if (period === "hari") return wibStartOfDay(now);
    if (period === "minggu") return wibDaysAgo(6, now);
    if (period === "bulan") return wibStartOfMonth(now);
    return wibStartOfYear(now);
}

export async function getRevenue(period: ReportPeriod = "bulan"): Promise<RevenueResult> {
    const from = revenuePeriodStart(period) ?? periodStart("semua");
    const [orders, visits, payments] = await Promise.all([
        prisma.order.findMany({ where: from ? { OR: [{ paidAt: { gte: from } }, { payment: { paidAt: { gte: from } } }] } : {}, select: { source: true, total: true, paymentStatus: true, status: true, paidAt: true, payment: { select: { status: true, paidAt: true } } } }),
        prisma.salesVisit.findMany({ where: { ...(from ? { visitedAt: { gte: from } } : {}), status: "COMPLETED" }, select: { salesAmount: true, visitedAt: true } }),
        prisma.storePayment.findMany({ where: { ...(from ? { paymentDate: { gte: from } } : {}), status: "VALID" }, select: { amount: true, paymentDate: true } }),
    ]);
    return calculateRevenue({ orders, sales: visits.map((v) => ({ amount: v.salesAmount, at: v.visitedAt })), payments: payments.map((p) => ({ amount: p.amount, at: p.paymentDate })) });
}