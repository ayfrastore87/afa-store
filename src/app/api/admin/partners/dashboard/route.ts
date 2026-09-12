import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { wibDaysAgo, wibStartOfDay, wibStartOfMonth, wibStartOfYear } from "@/lib/wib";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/admin/partners/dashboard?period=hari|7hari|bulan|bulanlalu|tahun
//
// Admin-only, READ-ONLY aggregation across ALL partners ("Pusat Pengembangan
// Bisnis"). Aggregates PartnerSale / PartnerSaleItem server-side via groupBy +
// aggregate + Promise.all so the UI never issues N+1 partner/product queries.
// No writes of any kind. The period is the only client input; authorization is
// always derived from getCurrentAdmin().
// ---------------------------------------------------------------------------

const PERIODS = ["hari", "7hari", "bulan", "bulanlalu", "tahun"] as const;
type Period = (typeof PERIODS)[number];

const WIB_TZ = "Asia/Jakarta";
const WIB_DAY = 86_400_000;

type Bounds = { from: Date | null; to: Date | null };

function boundsFor(period: Period, now = new Date()): Bounds {
    switch (period) {
        case "hari":
            return { from: wibStartOfDay(now), to: null };
        case "7hari":
            return { from: wibDaysAgo(6, now), to: null };
        case "bulan":
            return { from: wibStartOfMonth(now), to: null };
        case "tahun":
            return { from: wibStartOfYear(now), to: null };
        case "bulanlalu": {
            const monthStart = wibStartOfMonth(now);
            const prevStart = new Date(monthStart);
            prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
            return { from: prevStart, to: monthStart };
        }
    }
}

// Lower bound of the immediately preceding equivalent period, used for growth
// comparison. `to` is exclusive so current and previous periods never overlap.
function previousBoundsFor(period: Period, now = new Date()): Bounds {
    switch (period) {
        case "hari": {
            const start = wibStartOfDay(now);
            return { from: new Date(start.getTime() - WIB_DAY), to: start };
        }
        case "7hari": {
            const start = wibDaysAgo(6, now);
            return { from: wibDaysAgo(13, now), to: start };
        }
        case "bulan": {
            const monthStart = wibStartOfMonth(now);
            const prevStart = new Date(monthStart);
            prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
            return { from: prevStart, to: monthStart };
        }
        case "bulanlalu": {
            const monthStart = wibStartOfMonth(now);
            const prevStart = new Date(monthStart);
            prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
            const prevPrevStart = new Date(prevStart);
            prevPrevStart.setUTCMonth(prevPrevStart.getUTCMonth() - 1);
            return { from: prevPrevStart, to: prevStart };
        }
        case "tahun": {
            const yearStart = wibStartOfYear(now);
            const prevYearStart = new Date(yearStart);
            prevYearStart.setUTCFullYear(prevYearStart.getUTCFullYear() - 1);
            return { from: prevYearStart, to: yearStart };
        }
    }
}

function soldAtFilter({ from, to }: Bounds): Record<string, unknown> {
    const soldAt: Record<string, Date> = {};
    if (from) soldAt.gte = from;
    if (to) soldAt.lt = to;
    return Object.keys(soldAt).length ? { soldAt } : {};
}

const dayLabel = new Intl.DateTimeFormat("id-ID", { timeZone: WIB_TZ, day: "2-digit", month: "short" });
const monthLabel = new Intl.DateTimeFormat("id-ID", { timeZone: WIB_TZ, month: "short", year: "2-digit" });

function wibHour(date: Date): number {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: WIB_TZ, hour: "numeric", hour12: false }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    return hour === 24 ? 0 : hour;
}

type TrendPoint = { label: string; revenue: number; count: number };

// Build an ordered, zero-filled time series whose granularity follows the period.
function buildTrend(rows: { soldAt: Date; total: number }[], period: Period, now: Date): TrendPoint[] {
    if (period === "hari") {
        const buckets = new Map<number, { label: string; revenue: number; count: number }>();
        for (let hour = 0; hour < 24; hour += 1) {
            buckets.set(hour, { label: `${String(hour).padStart(2, "0")}:00`, revenue: 0, count: 0 });
        }
        for (const row of rows) {
            const current = buckets.get(wibHour(row.soldAt));
            if (current) {
                current.revenue += row.total;
                current.count += 1;
            }
        }
        return Array.from(buckets.values());
    }

    if (period === "tahun") {
        const buckets = new Map<number, { label: string; revenue: number; count: number }>();
        let cursor = wibStartOfYear(now);
        for (let month = 0; month < 12; month += 1) {
            buckets.set(cursor.getTime(), { label: monthLabel.format(cursor), revenue: 0, count: 0 });
            const next = new Date(cursor);
            next.setUTCMonth(next.getUTCMonth() + 1);
            cursor = next;
        }
        for (const row of rows) {
            const key = wibStartOfMonth(row.soldAt).getTime();
            const current = buckets.get(key);
            if (current) {
                current.revenue += row.total;
                current.count += 1;
            }
        }
        return Array.from(buckets.values());
    }

    // Daily buckets for 7hari / bulan / bulanlalu.
    const bounds = boundsFor(period, now);
    const first = bounds.from ? wibStartOfDay(bounds.from) : wibStartOfDay(now);
    const endSource = bounds.to ? new Date(bounds.to.getTime() - 1) : now;
    const last = wibStartOfDay(endSource);

    const buckets = new Map<number, { label: string; revenue: number; count: number }>();
    let cursor = first;
    while (cursor.getTime() <= last.getTime()) {
        buckets.set(cursor.getTime(), { label: dayLabel.format(cursor), revenue: 0, count: 0 });
        cursor = new Date(cursor.getTime() + WIB_DAY);
    }
    for (const row of rows) {
        const key = wibStartOfDay(row.soldAt).getTime();
        const current = buckets.get(key);
        if (current) {
            current.revenue += row.total;
            current.count += 1;
        }
    }
    return Array.from(buckets.values());
}

function growthPct(current: number, previous: number): number | null {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") ?? "bulan";
    const period: Period = (PERIODS as readonly string[]).includes(periodParam) ? (periodParam as Period) : "bulan";

    const now = new Date();
    const bounds = boundsFor(period, now);
    const prevBounds = previousBoundsFor(period, now);
    const saleWhere = soldAtFilter(bounds);
    const prevSaleWhere = soldAtFilter(prevBounds);
    const itemWhere = { sale: saleWhere };

    try {
        const [statusAgg, saleAgg, itemAgg, prevSaleAgg, topPartnerGroup, topProductGroup, trendRows] = await Promise.all([
            prisma.partner.groupBy({ by: ["status"], _count: { _all: true } }),
            prisma.partnerSale.aggregate({
                where: saleWhere,
                _count: { _all: true },
                _sum: { total: true, grossProfit: true },
            }),
            prisma.partnerSaleItem.aggregate({
                where: itemWhere,
                _sum: { quantity: true },
            }),
            prisma.partnerSale.aggregate({
                where: prevSaleWhere,
                _count: { _all: true },
                _sum: { total: true },
            }),
            prisma.partnerSale.groupBy({
                by: ["partnerId"],
                where: saleWhere,
                _sum: { total: true },
                _count: { _all: true },
                orderBy: { _sum: { total: "desc" } },
                take: 8,
            }),
            prisma.partnerSaleItem.groupBy({
                by: ["name"],
                where: itemWhere,
                _sum: { quantity: true, subtotalRevenue: true },
                orderBy: { _sum: { quantity: "desc" } },
                take: 10,
            }),
            prisma.partnerSale.findMany({
                where: saleWhere,
                select: { soldAt: true, total: true },
            }),
        ]);

        const statusCount: Record<string, number> = {};
        let totalPartners = 0;
        for (const row of statusAgg) {
            const count = row._count._all;
            statusCount[row.status] = count;
            totalPartners += count;
        }

        // Resolve partner display names for the top partners in a single query.
        const partnerIds = topPartnerGroup.map((row) => row.partnerId).filter((id): id is string => Boolean(id));
        const partnersById = new Map<string, { name: string; partnerCode: string; partnerType: string }>();
        if (partnerIds.length) {
            const found = await prisma.partner.findMany({
                where: { id: { in: partnerIds } },
                select: { id: true, displayName: true, businessName: true, partnerCode: true, partnerType: true },
            });
            for (const partner of found) {
                partnersById.set(partner.id, {
                    name: partner.businessName || partner.displayName,
                    partnerCode: partner.partnerCode,
                    partnerType: partner.partnerType,
                });
            }
        }

        const topPartners = topPartnerGroup
            .filter((row) => row.partnerId)
            .map((row) => {
                const meta = partnersById.get(row.partnerId) ?? { name: "Mitra", partnerCode: row.partnerId, partnerType: "" };
                return {
                    id: row.partnerId,
                    name: meta.name,
                    partnerCode: meta.partnerCode,
                    partnerType: meta.partnerType,
                    revenue: row._sum.total ?? 0,
                    transactions: row._count._all,
                };
            });

        const topProducts = topProductGroup.map((row) => ({
            name: row.name,
            quantity: row._sum.quantity ?? 0,
            revenue: row._sum.subtotalRevenue ?? 0,
        }));

        const revenue = saleAgg._sum.total ?? 0;
        const transactionCount = saleAgg._count._all;
        const itemsSold = itemAgg._sum.quantity ?? 0;
        const grossProfit = saleAgg._sum.grossProfit ?? 0;
        const prevRevenue = prevSaleAgg._sum.total ?? 0;
        const prevTransactions = prevSaleAgg._count._all;

        return NextResponse.json({
            period,
            generatedAt: now.toISOString(),
            summary: {
                revenue,
                transactionCount,
                itemsSold,
                grossProfit,
                averageTransaction: transactionCount ? Math.round(revenue / transactionCount) : 0,
            },
            growth: {
                revenuePct: growthPct(revenue, prevRevenue),
                transactionPct: growthPct(transactionCount, prevTransactions),
                prevRevenue,
                prevTransactions,
            },
            partners: {
                total: totalPartners,
                active: statusCount.ACTIVE ?? 0,
                pending: statusCount.PENDING ?? 0,
                rejected: statusCount.REJECTED ?? 0,
                suspended: statusCount.SUSPENDED ?? 0,
            },
            topPartners,
            topProducts,
            trend: buildTrend(trendRows, period, now),
        });
    } catch (error) {
        console.error("admin_partners_dashboard_failed", {
            category: "admin_partners_dashboard",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Ringkasan mitra gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
