import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { periodStart, REPORT_PERIODS, type ReportPeriod } from "@/lib/admin-report";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/admin/sales/transactions
//
// Admin-only, READ-ONLY, paginated list of ALL orders (ONLINE + TATAP_MUKA +
// WHATSAPP) that backs the "Detail Seluruh Transaksi" table on the Laporan
// Penjualan page. Supports a WIB period, invoice/customer search, a status
// filter, and pagination — all pushed down to the database.
//
// Status filter (UI → DB order.status vocabulary, see lib/orders.ts):
//   selesai    → COMPLETED
//   pending    → PENDING (belum bayar)
//   diproses   → PROCESSING | PACKED | SHIPPED
//   dibatalkan → CANCELLED | CANCELED
// ---------------------------------------------------------------------------

const STATUS_FILTERS = {
    selesai: ["COMPLETED"],
    pending: ["PENDING"],
    diproses: ["PROCESSING", "PACKED", "SHIPPED"],
    dibatalkan: ["CANCELLED", "CANCELED"],
} as const;

type StatusFilterKey = keyof typeof STATUS_FILTERS;

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const periodParam = (searchParams.get("period") ?? "bulan").trim().toLowerCase();
    const period: ReportPeriod = (REPORT_PERIODS as readonly string[]).includes(periodParam)
        ? (periodParam as ReportPeriod)
        : "bulan";

    const q = (searchParams.get("q") ?? "").trim();
    const statusParam = (searchParams.get("status") ?? "").trim().toLowerCase();

    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));

    const from = periodStart(period);

    const where: Prisma.OrderWhereInput = {
        ...(from ? { createdAt: { gte: from } } : {}),
        ...(q
            ? {
                  OR: [
                      { invoice: { contains: q, mode: "insensitive" } },
                      { customer: { contains: q, mode: "insensitive" } },
                  ],
              }
            : {}),
        ...(statusParam && statusParam in STATUS_FILTERS
            ? { status: { in: [...STATUS_FILTERS[statusParam as StatusFilterKey]] } }
            : {}),
    };

    const [total, orders] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                invoice: true,
                customer: true,
                phone: true,
                source: true,
                paymentMethod: true,
                status: true,
                total: true,
                createdAt: true,
            },
        }),
    ]);

    return NextResponse.json({
        orders: orders.map((o) => ({
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
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    });
}
