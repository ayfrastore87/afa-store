import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { computeReceivable, PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";

export const runtime = "nodejs";

// GET  /api/admin/consignment/stores — all stores + derived stock/receivable.
// POST /api/admin/consignment/stores — create a store (optionally assigned).

const storeSchema = z.object({
    name: z.string().trim().min(1, "Nama toko wajib diisi.").max(150),
    ownerName: z.string().trim().max(150).optional(),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(500).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    mapsUrl: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(500).optional(),
    assignedSalesId: z.string().trim().nullable().optional(),
});

export async function GET(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();
    const withCoordinates = searchParams.get("withCoordinates") === "1";

    const stores = await prisma.consignmentStore.findMany({
        where: {
            ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
            ...(withCoordinates ? { latitude: { not: null }, longitude: { not: null } } : {}),
        },
        orderBy: { name: "asc" },
        select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            latitude: true,
            longitude: true,
            isActive: true,
            assignedSales: { select: { id: true, name: true } },
            stocks: { select: { currentStock: true } },
            visits: {
                where: { status: VISIT_STATUS_COMPLETED },
                select: { salesAmount: true, totalSold: true, visitedAt: true },
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
                latitude: store.latitude,
                longitude: store.longitude,
                isActive: store.isActive,
                salesName: store.assignedSales?.name ?? null,
                salesId: store.assignedSales?.id ?? null,
                totalStock: store.stocks.reduce((sum, stock) => sum + stock.currentStock, 0),
                totalSold: store.visits.reduce((sum, visit) => sum + visit.totalSold, 0),
                receivable: computeReceivable(totalSales, totalPaid),
                lastVisitAt: store.visits[0]?.visitedAt ?? null,
            };
        }),
    });
}

export async function POST(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const parsed = storeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data toko tidak valid." }, { status: 400 });
    }

    const data = parsed.data;

    if (data.assignedSalesId) {
        const sales = await prisma.salesPerson.findFirst({ where: { id: data.assignedSalesId, isActive: true }, select: { id: true } });
        if (!sales) return NextResponse.json({ message: "Sales tidak ditemukan." }, { status: 404 });
    }

    const store = await prisma.consignmentStore.create({
        data: {
            name: data.name,
            ownerName: data.ownerName || null,
            phone: data.phone || null,
            address: data.address || null,
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null,
            mapsUrl: data.mapsUrl || null,
            notes: data.notes || null,
            assignedSalesId: data.assignedSalesId || null,
        },
        select: { id: true, name: true },
    });

    return NextResponse.json({ store }, { status: 201 });
}