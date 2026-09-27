import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { computeReceivable, PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";

export const runtime = "nodejs";

// GET   /api/admin/consignment/stores/[id] — full store detail for the admin.
// PATCH /api/admin/consignment/stores/[id] — update profile / assignment /
//        active flag. Stores are never hard-deleted (audit trail).

const updateSchema = z.object({
    name: z.string().trim().min(1).max(150).optional(),
    ownerName: z.string().trim().max(150).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    mapsUrl: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    assignedSalesId: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const store = await prisma.consignmentStore.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            ownerName: true,
            phone: true,
            address: true,
            latitude: true,
            longitude: true,
            mapsUrl: true,
            notes: true,
            isActive: true,
            createdAt: true,
            assignedSales: { select: { id: true, name: true, phone: true } },
            stocks: {
                select: { productId: true, currentStock: true, quantitySupplied: true, quantitySold: true, quantityReturned: true, quantityDamaged: true, unitPrice: true, product: { select: { name: true } } },
                orderBy: { product: { name: "asc" } },
            },
            visits: {
                select: {
                    id: true,
                    visitedAt: true,
                    totalSold: true,
                    totalSupplied: true,
                    salesAmount: true,
                    status: true,
                    sales: { select: { name: true } },
                    payments: { where: { status: PAYMENT_STATUS_VALID }, select: { amount: true } },
                },
                orderBy: { visitedAt: "desc" },
                take: 30,
            },
            payments: {
                select: { id: true, amount: true, paymentMethod: true, paymentDate: true, status: true, reference: true },
                orderBy: { paymentDate: "desc" },
                take: 30,
            },
        },
    });

    if (!store) return NextResponse.json({ message: "Toko tidak ditemukan." }, { status: 404 });

    const [salesAgg, paidAgg, returnsAgg] = await Promise.all([
        prisma.salesVisit.aggregate({ where: { storeId: id, status: VISIT_STATUS_COMPLETED }, _sum: { salesAmount: true, totalSold: true } }),
        prisma.storePayment.aggregate({ where: { storeId: id, status: PAYMENT_STATUS_VALID }, _sum: { amount: true } }),
        prisma.salesVisitItem.aggregate({ where: { visit: { storeId: id, status: VISIT_STATUS_COMPLETED } }, _sum: { quantityReturned: true, quantityDamaged: true } }),
    ]);

    const totalSales = salesAgg._sum.salesAmount ?? 0;
    const totalPaid = paidAgg._sum.amount ?? 0;

    return NextResponse.json({
        store: {
            id: store.id,
            name: store.name,
            ownerName: store.ownerName,
            phone: store.phone,
            address: store.address,
            latitude: store.latitude,
            longitude: store.longitude,
            mapsUrl: store.mapsUrl,
            notes: store.notes,
            isActive: store.isActive,
            createdAt: store.createdAt,
            sales: store.assignedSales,
        },
        stocks: store.stocks.map((stock) => ({
            productId: stock.productId,
            productName: stock.product.name,
            currentStock: stock.currentStock,
            quantitySupplied: stock.quantitySupplied,
            quantitySold: stock.quantitySold,
            quantityReturned: stock.quantityReturned,
            quantityDamaged: stock.quantityDamaged,
            unitPrice: stock.unitPrice,
        })),
        totals: {
            totalStock: store.stocks.reduce((sum, stock) => sum + stock.currentStock, 0),
            totalSold: salesAgg._sum.totalSold ?? 0,
            totalSales,
            totalPaid,
            receivable: computeReceivable(totalSales, totalPaid),
            totalReturned: returnsAgg._sum.quantityReturned ?? 0,
            totalDamaged: returnsAgg._sum.quantityDamaged ?? 0,
        },
        visits: store.visits.map((visit) => ({
            id: visit.id,
            visitedAt: visit.visitedAt,
            salesName: visit.sales.name,
            totalSold: visit.totalSold,
            totalSupplied: visit.totalSupplied,
            salesAmount: visit.salesAmount,
            paidAmount: visit.payments.reduce((sum, payment) => sum + payment.amount, 0),
            status: visit.status,
        })),
        payments: store.payments,
    });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data toko tidak valid." }, { status: 400 });
    }

    const existing = await prisma.consignmentStore.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ message: "Toko tidak ditemukan." }, { status: 404 });

    const data = parsed.data;
    if (data.assignedSalesId) {
        const sales = await prisma.salesPerson.findFirst({ where: { id: data.assignedSalesId, isActive: true }, select: { id: true } });
        if (!sales) return NextResponse.json({ message: "Sales tidak ditemukan." }, { status: 404 });
    }

    const store = await prisma.consignmentStore.update({
        where: { id },
        data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.ownerName !== undefined ? { ownerName: data.ownerName } : {}),
            ...(data.phone !== undefined ? { phone: data.phone } : {}),
            ...(data.address !== undefined ? { address: data.address } : {}),
            ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
            ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
            ...(data.mapsUrl !== undefined ? { mapsUrl: data.mapsUrl } : {}),
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
            ...(data.assignedSalesId !== undefined ? { assignedSalesId: data.assignedSalesId } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
        select: { id: true, name: true, isActive: true },
    });

    return NextResponse.json({ store });
}