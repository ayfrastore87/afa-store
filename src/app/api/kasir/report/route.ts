import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCashier } from "@/lib/server-auth";
import { getPreOrderReportRows } from "@/lib/pre-order";
import { summarizePreOrderPayments } from "@/lib/pre-order-core";

export const runtime = "nodejs";
const SOURCES = ["TATAP_MUKA", "WHATSAPP", "MARKETPLACE", "OTHER"] as const;

// ---------------------------------------------------------------------------
// GET /api/kasir/report
//
// `total` / `count` / `payments` / `sources` are the EXISTING kasir metrics and
// are computed exactly as before (Order rows only). Pre-order money lives in a
// separate ledger and is reported under the additive `preOrder` key — it is
// never added into `total`, so existing revenue definitions are unchanged and
// a PO payment is counted once (as a ledger row), never as an Order.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
    const user = await getCurrentCashier();
    if (!user) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const period = new URL(request.url).searchParams.get("period") || "today";
    const days = period === "30d" ? 30 : period === "7d" ? 7 : 1;
    const now = new Date();
    const from = new Date(now.getTime() - days * 86_400_000);
    const where = { createdAt: { gte: from }, source: { in: [...SOURCES] } };
    const [orders, payments, sources, preOrderRows] = await Promise.all([
        prisma.order.aggregate({ where, _count: { _all: true }, _sum: { total: true } }),
        prisma.order.groupBy({ by: ["paymentMethod"], where, _count: { _all: true }, _sum: { total: true } }),
        prisma.order.groupBy({ by: ["source"], where, _count: { _all: true }, _sum: { total: true } }),
        getPreOrderReportRows(from, new Date(now.getTime() + 1_000)).catch((error) => {
            // PO reporting must never break the legacy report (e.g. before the migration is applied).
            console.error("kasir_report_pre_order_failed", { message: error instanceof Error ? error.message : String(error) });
            return null;
        }),
    ]);
    const preOrder = preOrderRows
        ? {
              ...summarizePreOrderPayments(preOrderRows.payments),
              outstandingCount: preOrderRows.outstandingCount,
              outstandingReceivables: preOrderRows.outstandingReceivables,
              handedOverCount: preOrderRows.handedOverCount,
              handedOverValue: preOrderRows.handedOverValue,
          }
        : null;
    return NextResponse.json({ period, total: orders._sum.total ?? 0, count: orders._count._all, payments, sources, preOrder });
}