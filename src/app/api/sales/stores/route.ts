import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import { computeReceivable, PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";

export const runtime = "nodejs";

// GET /api/sales/stores — ONLY the active stores assigned to the current
// sales person. Receivable per store is derived server-side.
export async function GET(request: Request) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();

    const stores = await prisma.consignmentStore.findMany({
        where: {
            assignedSalesId: current.sales.id,
            isActive: true,
            ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
        },
        orderBy: { name: "asc" },
        select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            latitude: true,
            longitude: true,
            stocks: { select: { productId: true, currentStock: true, product: { select: { name: true } } } },
            visits: {
                where: { status: VISIT_STATUS_COMPLETED },
                select: { salesAmount: true, visitedAt: true },
                orderBy: { visitedAt: "desc" },
            },
            payments: { where: { status: PAYMENT_STATUS_VALID }, select: { amount: true } },
        },
    });

    return NextResponse.json({
        stores: stores.map((store) => {
            const totalSales = store.visits.reduce((sum, visit) => sum + visit.salesAmount, 0);
            const totalPaid = store.payments.reduce((sum, payment) => sum + payment.amount, 0);
            return {
                id: store.id,
                name: store.name,
                address: store.address,
                phone: store.phone,
                hasCoordinates: store.latitude !== null && store.longitude !== null,
                latitude: store.latitude,
                longitude: store.longitude,
                stocks: store.stocks
                    .filter((stock) => stock.currentStock > 0)
                    .map((stock) => ({ productId: stock.productId, name: stock.product.name, currentStock: stock.currentStock })),
                totalStock: store.stocks.reduce((sum, stock) => sum + stock.currentStock, 0),
                receivable: computeReceivable(totalSales, totalPaid),
                lastVisitAt: store.visits[0]?.visitedAt ?? null,
            };
        }),
    });
}