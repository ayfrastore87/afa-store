import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCashier } from "@/lib/server-auth";

export const runtime = "nodejs";
const SOURCES = ["TATAP_MUKA", "WHATSAPP", "MARKETPLACE", "OTHER"] as const;

export async function GET(request: Request) {
    const user = await getCurrentCashier();
    if (!user) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const period = new URL(request.url).searchParams.get("period") || "today";
    const days = period === "30d" ? 30 : period === "7d" ? 7 : 1;
    const from = new Date(Date.now() - days * 86_400_000);
    const where = { createdAt: { gte: from }, source: { in: [...SOURCES] } };
    const [orders, payments, sources] = await Promise.all([
        prisma.order.aggregate({ where, _count: { _all: true }, _sum: { total: true } }),
        prisma.order.groupBy({ by: ["paymentMethod"], where, _count: { _all: true }, _sum: { total: true } }),
        prisma.order.groupBy({ by: ["source"], where, _count: { _all: true }, _sum: { total: true } }),
    ]);
    return NextResponse.json({ period, total: orders._sum.total ?? 0, count: orders._count._all, payments, sources });
}