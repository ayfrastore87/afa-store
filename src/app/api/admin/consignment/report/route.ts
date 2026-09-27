import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { computeReceivable, PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";

export const runtime = "nodejs";

// GET /api/admin/consignment/report — Laporan Titip Jual.
// Filters: from, to (ISO dates), salesId, storeId, productId,
// paymentStatus=paid|partial|unpaid. Rows are COMPLETED visit items; summary
// totals are recomputed server-side from the filtered set.

const MAX_ROWS = 500;

export async function GET(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const salesId = (searchParams.get("salesId") ?? "").trim();
    const storeId = (searchParams.get("storeId") ?? "").trim();
    const productId = (searchParams.get("productId") ?? "").trim();
    const paymentStatus = (searchParams.get("paymentStatus") ?? "").trim();

    const from = fromParam ? new Date(fromParam) : null;
    const to = toParam ? new Date(toParam) : null;
    const visitedAt = {
        ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
        ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
    };

    const visitWhere = {
        status: VISIT_STATUS_COMPLETED,
        ...(Object.keys(visitedAt).length ? { visitedAt } : {}),
        ...(salesId ? { salesId } : {}),
        ...(storeId ? { storeId } : {}),
    };

    const items = await prisma.salesVisitItem.findMany({
        where: {
            visit: visitWhere,
            ...(productId ? { productId } : {}),
        },
        select: {
            id: true,
            productName: true,
            quantitySupplied: true,
            quantitySold: true,
            quantityReturned: true,
            quantityDamaged: true,
            closingStock: true,
            unitPrice: true,
            salesAmount: true,
            visit: {
                select: {
                    id: true,
                    visitedAt: true,
                    storeId: true,
                    store: { select: { name: true } },
                    sales: { select: { name: true } },
                    payments: { where: { status: PAYMENT_STATUS_VALID }, select: { amount: true } },
                    salesAmount: true,
                },
            },
        },
        orderBy: { visit: { visitedAt: "desc" } },
        take: MAX_ROWS,
    });

    let rows = items.map((item) => {
        const visitPaid = item.visit.payments.reduce((sum, payment) => sum + payment.amount, 0);
        // Attribute the visit payment proportionally is over-engineering for an
        // operational report; expose visit-level paid amount alongside the row.
        const visitReceivable = computeReceivable(item.visit.salesAmount, visitPaid);
        return {
            id: item.id,
            visitId: item.visit.id,
            visitedAt: item.visit.visitedAt,
            salesName: item.visit.sales.name,
            storeName: item.visit.store.name,
            storeId: item.visit.storeId,
            productName: item.productName,
            supplied: item.quantitySupplied,
            sold: item.quantitySold,
            returned: item.quantityReturned,
            damaged: item.quantityDamaged,
            remaining: item.closingStock,
            unitPrice: item.unitPrice,
            salesAmount: item.salesAmount,
            visitPaid,
            visitReceivable,
        };
    });

    if (paymentStatus === "paid") rows = rows.filter((row) => row.visitReceivable === 0);
    else if (paymentStatus === "unpaid") rows = rows.filter((row) => row.visitPaid === 0 && row.visitReceivable > 0);
    else if (paymentStatus === "partial") rows = rows.filter((row) => row.visitPaid > 0 && row.visitReceivable > 0);

    // Summary recomputed server-side from the filtered rows + global stock.
    const stockAgg = await prisma.consignmentStock.aggregate({
        _sum: { currentStock: true },
        ...(storeId || productId
            ? { where: { ...(storeId ? { storeId } : {}), ...(productId ? { productId } : {}) } }
            : {}),
    });

    const summary = {
        totalSupply: rows.reduce((sum, row) => sum + row.supplied, 0),
        totalSold: rows.reduce((sum, row) => sum + row.sold, 0),
        totalReturned: rows.reduce((sum, row) => sum + row.returned, 0),
        totalDamaged: rows.reduce((sum, row) => sum + row.damaged, 0),
        totalStock: stockAgg._sum.currentStock ?? 0,
        totalSales: rows.reduce((sum, row) => sum + row.salesAmount, 0),
        totalSettlement: 0,
        totalReceivable: 0,
    };

    // Settlement/receivable summary is visit-scoped (avoid double counting the
    // same visit across its item rows).
    const visitTotals = new Map<string, { salesAmount: number; paid: number }>();
    for (const item of items) {
        if (!visitTotals.has(item.visit.id)) {
            visitTotals.set(item.visit.id, {
                salesAmount: item.visit.salesAmount,
                paid: item.visit.payments.reduce((sum, payment) => sum + payment.amount, 0),
            });
        }
    }
    for (const totals of visitTotals.values()) {
        summary.totalSettlement += totals.paid;
        summary.totalReceivable += computeReceivable(totals.salesAmount, totals.paid);
    }

    return NextResponse.json({ rows, summary, truncated: items.length === MAX_ROWS });
}