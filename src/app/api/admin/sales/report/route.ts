import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { periodStart, REPORT_PERIODS, type ReportPeriod } from "@/lib/admin-report";
import { wibStartOfDay } from "@/lib/wib";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/admin/sales/report
//
// Admin-only, READ-ONLY sales report (Laporan Penjualan) covering ALL orders
// (ONLINE + TATAP_MUKA + WHATSAPP). Aggregates revenue, transaction count,
// items sold, average transaction, discounts, shipping, grand total, status
// buckets, payment-method buckets, top products, customer acquisition stats,
// and three pre-bucketed time series for the chart. No writes of any kind.
// ---------------------------------------------------------------------------

type ChartRow = { createdAt: Date; total: number };
type Granularity = "harian" | "mingguan" | "bulanan";

const WIB_DAY = 86_400_000;

function wibStartOfWeek(date: Date): Date {
    const day = date.getDay(); // 0 = Sunday
    const diff = day === 0 ? 6 : day - 1; // Monday start
    return new Date(date.getTime() - diff * WIB_DAY);
}

function labelFor(date: Date, granularity: Granularity): string {
    if (granularity === "harian") {
        return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(date);
    }
    if (granularity === "mingguan") {
        return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(wibStartOfWeek(date));
    }
    return new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" }).format(date);
}

function bucketChart(rows: ChartRow[], granularity: Granularity): { label: string; revenue: number; count: number }[] {
    const buckets = new Map<string, { start: Date; revenue: number; count: number }>();
    for (const row of rows) {
        let key: string;
        let start: Date;
        if (granularity === "harian") {
            start = wibStartOfDay(row.createdAt);
            key = start.getTime().toString();
        } else if (granularity === "mingguan") {
            start = wibStartOfWeek(row.createdAt);
            key = start.getTime().toString();
        } else {
            const y = row.createdAt.getFullYear();
            const m = row.createdAt.getMonth();
            start = new Date(y, m, 1);
            key = `${y}-${m}`;
        }
        const current = buckets.get(key) ?? { start, revenue: 0, count: 0 };
        current.revenue += row.total;
        current.count += 1;
        buckets.set(key, current);
    }

    return Array.from(buckets.values())
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map((b) => ({ label: labelFor(b.start, granularity), revenue: b.revenue, count: b.count }));
}

const STATUS_GROUPS = {
    completed: ["COMPLETED"],
    cancelled: ["CANCELLED", "CANCELED"],
} as const;

function groupStatus(status: string): string {
    const upper = status.toUpperCase();
    if (STATUS_GROUPS.completed.includes(upper as (typeof STATUS_GROUPS.completed)[number])) return "Selesai";
    if (STATUS_GROUPS.cancelled.includes(upper as (typeof STATUS_GROUPS.cancelled)[number])) return "Dibatalkan";
    return "Diproses";
}

const ORDERED_BARS = ["Selesai", "Diproses", "Dibatalkan"];

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const periodParam = (searchParams.get("period") ?? "bulan").trim().toLowerCase();
    const period: ReportPeriod = (REPORT_PERIODS as readonly string[]).includes(periodParam)
        ? (periodParam as ReportPeriod)
        : "bulan";

    const from = periodStart(period);
    const where: Prisma.OrderWhereInput = from ? { createdAt: { gte: from } } : {};

    try {
        const [orderAgg, itemAgg, groupRows, itemsForTop, customerIds, methodRows, chartRows, recentRows] =
            await Promise.all([
                prisma.order.aggregate({
                    where,
                    _count: { _all: true },
                    _sum: { subtotal: true, discount: true, shipping: true, total: true },
                }),
                prisma.orderItem.aggregate({
                    where: { order: where },
                    _sum: { quantity: true },
                }),
                prisma.order.groupBy({
                    by: ["status"],
                    where,
                    _count: { _all: true },
                }),
                prisma.orderItem.groupBy({
                    by: ["name"],
                    where: { order: where },
                    _sum: { quantity: true, subtotal: true },
                }),
                prisma.order.findMany({
                    where,
                    select: { userId: true },
                    distinct: ["userId"],
                }),
                prisma.order.groupBy({
                    by: ["paymentMethod"],
                    where,
                    _count: { _all: true },
                    _sum: { total: true },
                }),
                prisma.order.findMany({
                    where,
                    select: { createdAt: true, total: true },
                    orderBy: { createdAt: "asc" },
                }),
                prisma.order.findMany({
                    where,
                    select: { id: true, invoice: true, customer: true, phone: true, source: true, paymentMethod: true, status: true, total: true, createdAt: true },
                    orderBy: { createdAt: "desc" },
                    take: 50,
                }),
            ]);

        const transactionCount = orderAgg._count._all;
        const revenue = orderAgg._sum.total ?? 0;
        const itemsSold = itemAgg._sum.quantity ?? 0;

        const grouped: Record<string, number> = { Selesai: 0, Diproses: 0, Dibatalkan: 0 };
        for (const row of groupRows) {
            grouped[groupStatus(row.status)] += row._count._all;
        }

        const topProducts = itemsForTop
            .map((row) => ({
                name: row.name,
                quantity: row._sum.quantity ?? 0,
                revenue: row._sum.subtotal ?? 0,
            }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);

        const customerUserIds = customerIds.map((c) => c.userId).filter((id): id is string => Boolean(id));
        let newCount = 0;
        let returningCount = 0;
        if (customerUserIds.length) {
            const firstOrderByUser = await prisma.order.groupBy({
                by: ["userId"],
                where: { userId: { in: customerUserIds } },
                _min: { createdAt: true },
            });
            const firstMap = new Map<string, Date>();
            for (const row of firstOrderByUser) {
                if (row.userId && row._min.createdAt) firstMap.set(row.userId, row._min.createdAt);
            }
            for (const id of customerUserIds) {
                const first = firstMap.get(id);
                if (first && from && first.getTime() < from.getTime()) returningCount += 1;
                else newCount += 1;
            }
        }

        const paymentMethods = methodRows.map((row) => ({
            method: row.paymentMethod,
            count: row._count._all,
            total: row._sum.total ?? 0,
        }));

        return NextResponse.json({
            period,
            from: from ? from.toISOString() : null,
            generatedAt: new Date().toISOString(),
            summary: {
                revenue,
                transactionCount,
                itemsSold,
                averageTransaction: transactionCount ? Math.round(revenue / transactionCount) : 0,
                subtotal: orderAgg._sum.subtotal ?? 0,
                discount: orderAgg._sum.discount ?? 0,
                shipping: orderAgg._sum.shipping ?? 0,
                grandTotal: revenue,
                completed: grouped.Selesai,
                pending: grouped.Diproses,
                cancelled: grouped.Dibatalkan,
            },
            topProducts,
            customers: { total: customerUserIds.length, newCount, returningCount },
            paymentMethods,
            orderStatuses: ORDERED_BARS.map((status) => ({ status, count: grouped[status] })),
            chart: {
                harian: bucketChart(chartRows, "harian"),
                mingguan: bucketChart(chartRows, "mingguan"),
                bulanan: bucketChart(chartRows, "bulanan"),
            },
            recentOrders: recentRows.map((o) => ({
                id: o.id,
                invoice: o.invoice,
                customer: o.customer,
                phone: o.phone,
                source: o.source,
                paymentMethod: o.paymentMethod,
                status: o.status,
                total: o.total,
                createdAt: o.createdAt,
            })),
        });
    } catch (error) {
        console.error("admin_sales_report_failed", {
            category: "admin_sales_report",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Laporan gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
