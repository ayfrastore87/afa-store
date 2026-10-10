import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { periodRange, REPORT_PERIODS, type ReportPeriod } from "@/lib/admin-report";

export const runtime = "nodejs";
const MAX_EXPORT_ROWS = 5000;

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const rawPeriod = (params.get("period") ?? "bulan").toLowerCase();
    const period: ReportPeriod = (REPORT_PERIODS as readonly string[]).includes(rawPeriod) ? rawPeriod as ReportPeriod : "bulan";
    const { from, to } = periodRange(period, params.get("month"));
    const where: Prisma.OrderWhereInput = from ? { createdAt: { gte: from, ...(to ? { lt: to } : {}) } } : {};
    const total = await prisma.order.count({ where });
    if (total > MAX_EXPORT_ROWS) {
        return NextResponse.json({ message: `Data terlalu besar untuk ekspor langsung (${total.toLocaleString("id-ID")} transaksi). Gunakan filter periode yang lebih kecil.` }, { status: 413 });
    }
    const orders = await prisma.order.findMany({
        where, orderBy: { createdAt: "asc" }, take: MAX_EXPORT_ROWS,
        select: { invoice: true, customer: true, source: true, paymentMethod: true, status: true, total: true, createdAt: true },
    });
    return NextResponse.json({ total, orders });
}