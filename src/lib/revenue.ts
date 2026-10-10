import "server-only";

import { prisma } from "@/lib/prisma";
import { periodRange, type ReportPeriod } from "@/lib/admin-report";
import { calculateRevenue, CASHIER_SOURCES, isValidPaidOrder, type RevenueOrder, type RevenueResult, type RevenueRow, type DailyRevenue } from "@/lib/revenue-core";
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

export async function getRevenue(period: ReportPeriod = "bulan", month?: string | null): Promise<RevenueResult> {
    const { from, to } = periodRange(period, month);
    const dateRange = from ? { gte: from, ...(to ? { lt: to } : {}) } : undefined;
    const [orders, visits, payments] = await Promise.all([
        prisma.order.findMany({ where: dateRange ? { OR: [{ paidAt: dateRange }, { payment: { paidAt: dateRange } }] } : {}, select: { source: true, total: true, paymentStatus: true, status: true, paidAt: true, payment: { select: { status: true, paidAt: true } } } }),
        prisma.salesVisit.findMany({ where: { ...(dateRange ? { visitedAt: dateRange } : {}), status: "COMPLETED" }, select: { salesAmount: true, visitedAt: true } }),
        prisma.storePayment.findMany({ where: { ...(dateRange ? { paymentDate: dateRange } : {}), status: "VALID" }, select: { amount: true, paymentDate: true } }),
    ]);
    const result = calculateRevenue({ orders, sales: visits.map((v) => ({ amount: v.salesAmount, at: v.visitedAt })), payments: payments.map((p) => ({ amount: p.amount, at: p.paymentDate })) });
    const days = new Map<string, DailyRevenue>();
    const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
    const ensure = (date: string) => days.get(date) ?? (() => { const row = { date, online: 0, cashier: 0, sales: 0, total: 0, transactionCount: 0 }; days.set(date, row); return row; })();
    for (const order of orders) { if (!isValidPaidOrder(order)) continue; const row = ensure(day(order.payment?.paidAt ?? order.paidAt ?? new Date())); if (order.source === "ONLINE") row.online += order.total; else if (CASHIER_SOURCES.includes(order.source as never)) row.cashier += order.total; row.total += order.total; row.transactionCount += 1; }
    for (const visit of visits) { const row = ensure(day(visit.visitedAt)); row.sales += visit.salesAmount; row.total += visit.salesAmount; }
    if (from && to) { for (let cursor = from.getTime(); cursor < to.getTime(); cursor += 86_400_000) ensure(day(new Date(cursor))); }
    result.daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    return result;
}