import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import {
    computeVisitItem,
    computeVisitTotals,
    ConsignmentError,
    isConsignmentPaymentMethod,
    MAX_CONSIGNMENT_PAYMENT,
    normalizeIdempotencyKey,
    parseVisitItems,
    PAYMENT_STATUS_VALID,
    VISIT_STATUS_COMPLETED,
} from "@/lib/consignment";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/sales/visits — record one consignment visit atomically.
//
// Server-side rules (client totals are NEVER trusted):
//  * the visit is only accepted for a store ASSIGNED to the current sales,
//  * openingStock and unitPrice come from the database, not the payload,
//  * closingStock is recomputed (opening + supplied - sold - returned - damaged),
//  * supplied quantity conditionally decrements central Product.stock,
//  * ConsignmentStock is updated with an optimistic currentStock guard so a
//    concurrent visit to the same store/product cannot double-move stock,
//  * an optional payment (CASH/TRANSFER/OTHER) is stored in the SAME
//    transaction; piutang is always derived, never stored,
//  * idempotencyKey makes double submits return the first result.
// ---------------------------------------------------------------------------

const visitSchema = z.object({
    storeId: z.string().trim().min(1, "Toko wajib dipilih."),
    items: z.array(z.unknown()).min(1, "Minimal satu produk harus diisi."),
    payment: z
        .object({
            amount: z.number().int().min(1).max(MAX_CONSIGNMENT_PAYMENT),
            method: z.string().trim(),
        })
        .nullable()
        .optional(),
    notes: z.string().trim().max(500).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    idempotencyKey: z.string().trim().max(128).optional(),
});

export async function GET(request: Request) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);

    const visits = await prisma.salesVisit.findMany({
        where: { salesId: current.sales.id },
        orderBy: { visitedAt: "desc" },
        take: limit,
        select: {
            id: true,
            visitedAt: true,
            totalSold: true,
            totalSupplied: true,
            salesAmount: true,
            status: true,
            store: { select: { id: true, name: true } },
            payments: { where: { status: PAYMENT_STATUS_VALID }, select: { amount: true, paymentMethod: true } },
        },
    });

    return NextResponse.json({
        visits: visits.map((visit) => ({
            id: visit.id,
            visitedAt: visit.visitedAt,
            storeId: visit.store.id,
            storeName: visit.store.name,
            totalSold: visit.totalSold,
            totalSupplied: visit.totalSupplied,
            salesAmount: visit.salesAmount,
            paidAmount: visit.payments.reduce((sum, payment) => sum + payment.amount, 0),
            status: visit.status,
        })),
    });
}

export async function POST(request: Request) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const salesId = current.sales.id;

    const parsed = visitSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data kunjungan tidak valid." }, { status: 400 });
    }

    const { storeId, payment, notes, latitude, longitude } = parsed.data;
    const idempotencyKey = normalizeIdempotencyKey(parsed.data.idempotencyKey);

    if (payment && !isConsignmentPaymentMethod(payment.method)) {
        return NextResponse.json({ message: "Metode pembayaran tidak valid." }, { status: 400 });
    }

    let items;
    try {
        items = parseVisitItems(parsed.data.items);
    } catch (error) {
        if (error instanceof ConsignmentError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        throw error;
    }

    // Duplicate submission protection: the same key returns the FIRST visit.
    if (idempotencyKey) {
        const existing = await prisma.salesVisit.findUnique({
            where: { idempotencyKey },
            select: { id: true, salesId: true, salesAmount: true, totalSold: true, totalSupplied: true },
        });
        if (existing) {
            if (existing.salesId !== salesId) {
                return NextResponse.json({ message: "Kunjungan tidak dapat diproses." }, { status: 409 });
            }
            return NextResponse.json({ visit: { id: existing.id, salesAmount: existing.salesAmount, totalSold: existing.totalSold, totalSupplied: existing.totalSupplied }, duplicated: true }, { status: 200 });
        }
    }

    try {
        const created = await prisma.$transaction(async (tx) => {
            // Ownership check INSIDE the transaction: only an active store that
            // is assigned to this sales person can receive a visit.
            const store = await tx.consignmentStore.findFirst({
                where: { id: storeId, isActive: true, assignedSalesId: salesId },
                select: { id: true },
            });
            if (!store) throw new ConsignmentError(404, "Toko tidak ditemukan atau bukan tugas Anda.");

            const productIds = items.map((item) => item.productId);
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, isActive: true },
                select: { id: true, name: true, price: true },
            });
            const productMap = new Map(products.map((product) => [product.id, product]));
            for (const id of productIds) {
                if (!productMap.has(id)) throw new ConsignmentError(404, "Produk tidak ditemukan.");
            }

            const stocks = await tx.consignmentStock.findMany({
                where: { storeId, productId: { in: productIds } },
                select: { id: true, productId: true, currentStock: true, unitPrice: true },
            });
            const stockMap = new Map(stocks.map((stock) => [stock.productId, stock]));

            const now = new Date();
            const computedItems = [];

            // Deterministic order so concurrent visits lock rows consistently.
            const orderedItems = [...items].sort((a, b) => a.productId.localeCompare(b.productId));

            for (const item of orderedItems) {
                const product = productMap.get(item.productId)!;
                const existingStock = stockMap.get(item.productId) ?? null;

                // openingStock + unitPrice snapshot: DATABASE authority only.
                const openingStock = existingStock?.currentStock ?? 0;
                const unitPrice = existingStock?.unitPrice ?? product.price;

                const computed = computeVisitItem(item, openingStock, unitPrice);

                // New supply leaves the central AFA warehouse exactly ONCE:
                // here, with a conditional decrement that can never overdraw.
                if (item.quantitySupplied > 0) {
                    const changed = await tx.product.updateMany({
                        where: { id: item.productId, isActive: true, stock: { gte: item.quantitySupplied } },
                        data: { stock: { decrement: item.quantitySupplied } },
                    });
                    if (changed.count !== 1) {
                        throw new ConsignmentError(409, `Stok gudang tidak mencukupi untuk ${product.name}.`);
                    }
                }

                if (existingStock) {
                    // Optimistic guard: only apply if nobody moved this stock
                    // since we read it, so stock can never go negative or be
                    // decremented twice by concurrent submissions.
                    const changed = await tx.consignmentStock.updateMany({
                        where: { id: existingStock.id, currentStock: openingStock },
                        data: {
                            currentStock: computed.closingStock,
                            quantitySupplied: { increment: item.quantitySupplied },
                            quantitySold: { increment: item.quantitySold },
                            quantityReturned: { increment: item.quantityReturned },
                            quantityDamaged: { increment: item.quantityDamaged },
                            ...(item.quantitySupplied > 0 ? { suppliedAt: now } : {}),
                        },
                    });
                    if (changed.count !== 1) {
                        throw new ConsignmentError(409, "Stok toko berubah. Muat ulang dan coba lagi.");
                    }
                } else {
                    await tx.consignmentStock.create({
                        data: {
                            storeId,
                            productId: item.productId,
                            currentStock: computed.closingStock,
                            quantitySupplied: item.quantitySupplied,
                            quantitySold: item.quantitySold,
                            quantityReturned: item.quantityReturned,
                            quantityDamaged: item.quantityDamaged,
                            unitPrice,
                            suppliedAt: now,
                        },
                    });
                }

                computedItems.push({ ...computed, productName: product.name });
            }

            const totals = computeVisitTotals(computedItems);

            const visit = await tx.salesVisit.create({
                data: {
                    storeId,
                    salesId,
                    idempotencyKey,
                    visitedAt: now,
                    latitude: latitude ?? null,
                    longitude: longitude ?? null,
                    notes: notes || null,
                    totalSold: totals.totalSold,
                    totalSupplied: totals.totalSupplied,
                    salesAmount: totals.salesAmount,
                    status: VISIT_STATUS_COMPLETED,
                    items: {
                        create: computedItems.map((item) => ({
                            productId: item.productId,
                            productName: item.productName,
                            openingStock: item.openingStock,
                            quantitySupplied: item.quantitySupplied,
                            quantitySold: item.quantitySold,
                            quantityReturned: item.quantityReturned,
                            quantityDamaged: item.quantityDamaged,
                            closingStock: item.closingStock,
                            unitPrice: item.unitPrice,
                            salesAmount: item.salesAmount,
                        })),
                    },
                },
                select: { id: true, salesAmount: true, totalSold: true, totalSupplied: true },
            });

            if (payment) {
                await tx.storePayment.create({
                    data: {
                        storeId,
                        salesId,
                        visitId: visit.id,
                        amount: payment.amount,
                        paymentMethod: payment.method,
                        paymentDate: now,
                        status: PAYMENT_STATUS_VALID,
                    },
                });
            }

            return visit;
        });

        return NextResponse.json({ visit: created }, { status: 201 });
    } catch (error) {
        if (error instanceof ConsignmentError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        // Unique-violation on idempotencyKey = concurrent duplicate submit.
        if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
            return NextResponse.json({ message: "Kunjungan sudah tersimpan." }, { status: 409 });
        }
        console.error("sales_visit_create_failed", {
            category: "sales_visit_create",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Kunjungan gagal disimpan. Silakan coba lagi." }, { status: 500 });
    }
}