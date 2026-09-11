import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { formatKasirOrder, isKasirSource, KASIR_SOURCES } from "@/lib/kasir";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/admin/kasir/orders
//
// Admin-only. Reads only kasir orders (source TATAP_MUKA / WHATSAPP) and never
// mixes in ONLINE orders. Supports simple pagination, invoice/customer search,
// and a source filter. Filtering happens in the database, not in memory.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const sourceParam = (searchParams.get("source") ?? "").trim().toUpperCase();
    if (sourceParam && !isKasirSource(sourceParam)) {
        return NextResponse.json({ message: "Filter source tidak valid." }, { status: 400 });
    }

    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));

    const where: Prisma.OrderWhereInput = {
        source: { in: sourceParam ? [sourceParam] : [...KASIR_SOURCES] },
        ...(q
            ? {
                  OR: [
                      { invoice: { contains: q, mode: "insensitive" } },
                      { customer: { contains: q, mode: "insensitive" } },
                  ],
              }
            : {}),
    };

    const [total, orders] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                items: { include: { product: { select: { image: true, size: true } } } },
                payment: { select: { status: true, method: true } },
            },
        }),
    ]);

    return NextResponse.json({
        orders: orders.map(formatKasirOrder),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    });
}
