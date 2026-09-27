import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import { computeReceivable, PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";

export const runtime = "nodejs";

// GET /api/sales/stores/[id] — store detail + current stock per product for
// the visit form. 404 (not 403) when the store belongs to ANOTHER sales
// person, so store ids cannot be enumerated across sales accounts.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const store = await prisma.consignmentStore.findFirst({
        where: { id, isActive: true, assignedSalesId: current.sales.id },
        select: {
            id: true,
            name: true,
            ownerName: true,
            address: true,
            phone: true,
            latitude: true,
            longitude: true,
            stocks: {
                select: {
                    productId: true,
                    currentStock: true,
                    unitPrice: true,
                    product: { select: { name: true, image: true, stock: true } },
                },
                orderBy: { product: { name: "asc" } },
            },
            visits: {
                where: { status: VISIT_STATUS_COMPLETED },
                select: { id: true, visitedAt: true, totalSold: true, totalSupplied: true, salesAmount: true },
                orderBy: { visitedAt: "desc" },
                take: 10,
            },
            payments: { where: { status: PAYMENT_STATUS_VALID }, select: { amount: true } },
        },
    });

    if (!store) return NextResponse.json({ message: "Toko tidak ditemukan." }, { status: 404 });

    // Products the sales can supply: active catalog with the store's snapshot
    // price when a consignment line already exists.
    const products = await prisma.product.findMany({
        where: { isActive: true },
        select: { id: true, name: true, price: true, stock: true, size: true },
        orderBy: { name: "asc" },
    });

    const stockMap = new Map(store.stocks.map((stock) => [stock.productId, stock]));
    const totalSales = await prisma.salesVisit.aggregate({
        where: { storeId: store.id, status: VISIT_STATUS_COMPLETED },
        _sum: { salesAmount: true },
    });
    const totalPaid = store.payments.reduce((sum, payment) => sum + payment.amount, 0);

    return NextResponse.json({
        store: {
            id: store.id,
            name: store.name,
            ownerName: store.ownerName,
            address: store.address,
            phone: store.phone,
            latitude: store.latitude,
            longitude: store.longitude,
            receivable: computeReceivable(totalSales._sum.salesAmount ?? 0, totalPaid),
        },
        products: products.map((product) => {
            const stock = stockMap.get(product.id);
            return {
                id: product.id,
                name: product.name,
                size: product.size,
                unitPrice: stock?.unitPrice ?? product.price,
                currentStock: stock?.currentStock ?? 0,
                warehouseStock: product.stock,
            };
        }),
        visits: store.visits,
    });
}

const locationSchema = z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
}).strict();

// Store coordinates are current store metadata, never a SalesVisit location.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const parsed = locationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Lokasi toko tidak valid." }, { status: 400 });
    const store = await prisma.consignmentStore.findFirst({ where: { id, assignedSalesId: current.sales.id, isActive: true }, select: { id: true } });
    if (!store) return NextResponse.json({ message: "Toko tidak ditemukan." }, { status: 404 });
    const updated = await prisma.consignmentStore.update({ where: { id }, data: { latitude: parsed.data.latitude, longitude: parsed.data.longitude, mapsUrl: `https://www.google.com/maps/search/?api=1&query=${parsed.data.latitude},${parsed.data.longitude}` }, select: { id: true, latitude: true, longitude: true } });
    return NextResponse.json({ store: updated });
}