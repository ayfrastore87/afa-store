import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { computeReceivable, PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";

export const runtime = "nodejs";

// GET /api/admin/consignment/salespeople/[id] — operational detail: assigned
// stores, visit history, consigned stock, sales value and settlements.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const sales = await prisma.salesPerson.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            phone: true,
            isActive: true,
            createdAt: true,
            user: { select: { email: true } },
            stores: {
                where: { isActive: true },
                select: {
                    id: true,
                    name: true,
                    address: true,
                    stocks: { select: { currentStock: true } },
                },
                orderBy: { name: "asc" },
            },
            visits: {
                select: {
                    id: true,
                    visitedAt: true,
                    totalSold: true,
                    totalSupplied: true,
                    salesAmount: true,
                    status: true,
                    store: { select: { name: true } },
                },
                orderBy: { visitedAt: "desc" },
                take: 30,
            },
            payments: {
                where: { status: PAYMENT_STATUS_VALID },
                select: { id: true, amount: true, paymentMethod: true, paymentDate: true, store: { select: { name: true } } },
                orderBy: { paymentDate: "desc" },
                take: 30,
            },
        },
    });

    if (!sales) return NextResponse.json({ message: "Sales tidak ditemukan." }, { status: 404 });

    const [visitAgg, paymentAgg] = await Promise.all([
        prisma.salesVisit.aggregate({
            where: { salesId: id, status: VISIT_STATUS_COMPLETED },
            _sum: { totalSold: true, totalSupplied: true, salesAmount: true },
            _count: { id: true },
        }),
        prisma.storePayment.aggregate({ where: { salesId: id, status: PAYMENT_STATUS_VALID }, _sum: { amount: true } }),
    ]);

    const totalSales = visitAgg._sum.salesAmount ?? 0;
    const totalPaid = paymentAgg._sum.amount ?? 0;

    return NextResponse.json({
        salesPerson: {
            id: sales.id,
            name: sales.name,
            phone: sales.phone,
            email: sales.user?.email ?? null,
            isActive: sales.isActive,
            createdAt: sales.createdAt,
        },
        totals: {
            storeCount: sales.stores.length,
            visitCount: visitAgg._count.id,
            totalSold: visitAgg._sum.totalSold ?? 0,
            totalSupplied: visitAgg._sum.totalSupplied ?? 0,
            totalSales,
            totalSettlement: totalPaid,
            receivable: computeReceivable(totalSales, totalPaid),
        },
        stores: sales.stores.map((store) => ({
            id: store.id,
            name: store.name,
            address: store.address,
            totalStock: store.stocks.reduce((sum, stock) => sum + stock.currentStock, 0),
        })),
        visits: sales.visits.map((visit) => ({
            id: visit.id,
            visitedAt: visit.visitedAt,
            storeName: visit.store.name,
            totalSold: visit.totalSold,
            totalSupplied: visit.totalSupplied,
            salesAmount: visit.salesAmount,
            status: visit.status,
        })),
        payments: sales.payments.map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            paymentDate: payment.paymentDate,
            storeName: payment.store.name,
        })),
    });
}