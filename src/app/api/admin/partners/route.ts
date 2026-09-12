import { NextResponse } from "next/server";

import { isPartnerStatus } from "@/lib/partner";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const where = isPartnerStatus(status) ? { status } : undefined;

    const [partners, salesAgg] = await Promise.all([
        prisma.partner.findMany({
            where,
            include: {
                user: {
                    select: { id: true, name: true, email: true, phone: true, isActive: true },
                },
            },
            orderBy: { createdAt: "desc" },
        }),
        // Per-partner sales aggregate in a single query (avoids N+1 when the UI
        // renders a summary per row). All-time totals across PartnerSale.
        prisma.partnerSale.groupBy({
            by: ["partnerId"],
            _sum: { total: true, grossProfit: true },
            _count: { _all: true },
        }),
    ]);

    // Map partnerId -> aggregate so the client can merge without extra fetches.
    const aggregates: Record<string, { revenue: number; grossProfit: number; transactions: number }> = {};
    for (const row of salesAgg) {
        if (!row.partnerId) continue;
        aggregates[row.partnerId] = {
            revenue: row._sum.total ?? 0,
            grossProfit: row._sum.grossProfit ?? 0,
            transactions: row._count._all,
        };
    }

    return NextResponse.json({ partners, aggregates });
}
