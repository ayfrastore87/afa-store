import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
    formatSaleNumber,
    getPartnerCostPrice,
    getSalePrefix,
    MAX_PARTNER_SALE_ITEMS,
    MAX_PARTNER_SALE_QUANTITY,
    PARTNER_REFERENCE_SALE,
} from "@/lib/partner-dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentPartner } from "@/lib/server-auth";

export const runtime = "nodejs";

const itemSchema = z.object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().min(1).max(MAX_PARTNER_SALE_QUANTITY),
    sellingPrice: z.number().int().min(0).max(1_000_000_000),
});

const saleSchema = z.object({
    items: z.array(itemSchema).min(1, "Tambahkan minimal 1 item.").max(MAX_PARTNER_SALE_ITEMS, `Maksimal ${MAX_PARTNER_SALE_ITEMS} item.`),
    note: z.string().trim().max(255).optional(),
    idempotencyKey: z.string().trim().max(255).optional(),
});

class PartnerSaleError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = "PartnerSaleError";
    }
}


export async function GET(request: Request) {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    try {
        const sales = await prisma.partnerSale.findMany({
            where: { partnerId },
            orderBy: { soldAt: "desc" },
            take: limit,
            include: {
                items: { select: { productId: true, name: true, quantity: true, sellingPriceSnapshot: true, subtotalRevenue: true } },
            },
        });

        return NextResponse.json({
            sales: sales.map((sale) => ({
                id: sale.id,
                saleNumber: sale.saleNumber,
                soldAt: sale.soldAt,
                subtotal: sale.subtotal,
                total: sale.total,
                grossProfit: sale.grossProfit,
                status: sale.status,
                note: sale.note,
                itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
                items: sale.items.map((item) => ({
                    productId: item.productId,
                    name: item.name,
                    quantity: item.quantity,
                    sellingPrice: item.sellingPriceSnapshot,
                    subtotalRevenue: item.subtotalRevenue,
                })),
            })),
        });
    } catch (error) {
        console.error("partner_sales_list_failed", {
            category: "partner_sales_list",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Riwayat gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const current = await getCurrentPartner();
    if (!current) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partnerId = current.partner.id;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const parsed = saleSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data tidak valid." }, { status: 400 });
    }

    const { items, note, idempotencyKey } = parsed.data;
    // Optional idempotency key (nullable globally-unique). Empty string → null so
    // legacy clients without a key remain unaffected.
    const normalizedKey = idempotencyKey?.trim() || null;

    // Fast path: a repeated request with the same key returns the existing sale
    // instead of creating a duplicate. The unique constraint below is the final
    // guard against a concurrent race.
    if (normalizedKey) {
        const existing = await prisma.partnerSale.findUnique({ where: { idempotencyKey: normalizedKey } });
        if (existing) {
            if (existing.partnerId !== partnerId) {
                return NextResponse.json({ message: "Kunci idempotensi sudah digunakan." }, { status: 409 });
            }
            return NextResponse.json(
                {
                    message: "Penjualan sudah tercatat.",
                    sale: { id: existing.id, saleNumber: existing.saleNumber, total: existing.total, grossProfit: existing.grossProfit },
                },
                { status: 200 }
            );
        }
    }

    try {
        const created = await prisma.$transaction(async (tx) => {
            const productIds = [...new Set(items.map((item) => item.productId))];

            const products = await tx.product.findMany({
                where: { id: { in: productIds }, isActive: true },
                select: { id: true, name: true },
            });
            const productMap = new Map(products.map((product) => [product.id, product]));
            for (const id of productIds) {
                if (!productMap.has(id)) throw new PartnerSaleError(404, "Produk tidak ditemukan.");
            }

            const stocks = await tx.partnerStock.findMany({
                where: { partnerId, productId: { in: productIds } },
                select: { productId: true, quantity: true },
            });
            const stockMap = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));

            const now = new Date();
            const prefix = getSalePrefix(now);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`;
            const todayCount = await tx.partnerSale.count({ where: { saleNumber: { startsWith: prefix } } });

            // Decrement stock with a conditional guard. Sort for deterministic lock order.
            const orderedItems = [...items].sort((a, b) => a.productId.localeCompare(b.productId));
            for (const item of orderedItems) {
                const available = stockMap.get(item.productId) ?? 0;
                if (available < item.quantity) {
                    throw new PartnerSaleError(409, "Stok mitra tidak mencukupi untuk salah satu produk.");
                }
                const changed = await tx.partnerStock.updateMany({
                    where: { partnerId, productId: item.productId, quantity: { gte: item.quantity } },
                    data: { quantity: { decrement: item.quantity } },
                });
                if (changed.count !== 1) {
                    throw new PartnerSaleError(409, "Stok mitra tidak mencukupi.");
                }
            }

            const saleItems = [];
            let subtotal = 0;
            let grossProfit = 0;

            for (const item of items) {
                const product = productMap.get(item.productId)!;
                const costPrice = await getPartnerCostPrice(partnerId, item.productId, tx);
                const subtotalCost = costPrice * item.quantity;
                const subtotalRevenue = item.sellingPrice * item.quantity;
                subtotal += subtotalRevenue;
                grossProfit += subtotalRevenue - subtotalCost;

                saleItems.push({
                    productId: item.productId,
                    name: product.name,
                    quantity: item.quantity,
                    costPriceSnapshot: costPrice,
                    sellingPriceSnapshot: item.sellingPrice,
                    subtotalCost,
                    subtotalRevenue,
                });
            }

            const total = subtotal;

            const sale = await tx.partnerSale.create({
                data: {
                    partnerId,
                    saleNumber: formatSaleNumber(now, todayCount + 1),
                    idempotencyKey: normalizedKey,
                    subtotal,
                    total,
                    grossProfit,
                    status: "COMPLETED",
                    note: note || null,
                    soldAt: now,
                    items: { create: saleItems },
                },
                select: { id: true, saleNumber: true, total: true, grossProfit: true },
            });

            await tx.partnerStockMovement.createMany({
                data: saleItems.map((item) => ({
                    partnerId,
                    productId: item.productId,
                    type: "OUT",
                    quantity: item.quantity,
                    unitPrice: item.costPriceSnapshot,
                    referenceType: PARTNER_REFERENCE_SALE,
                    referenceId: sale.id,
                    note: `Penjualan ${sale.saleNumber}`,
                    createdAt: now,
                })),
            });

            return sale;
        });

        return NextResponse.json({ message: "Penjualan berhasil dicatat.", sale: created }, { status: 201 });
    } catch (error) {
        if (error instanceof PartnerSaleError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const target = error.meta?.target;
            const targets = Array.isArray(target) ? target : target ? [target] : [];
            if (targets.includes("idempotencyKey") && normalizedKey) {
                const existing = await prisma.partnerSale.findUnique({ where: { idempotencyKey: normalizedKey } });
                if (existing && existing.partnerId === partnerId) {
                    return NextResponse.json(
                        {
                            message: "Penjualan sudah tercatat.",
                            sale: { id: existing.id, saleNumber: existing.saleNumber, total: existing.total, grossProfit: existing.grossProfit },
                        },
                        { status: 200 }
                    );
                }
                return NextResponse.json({ message: "Kunci idempotensi sudah digunakan." }, { status: 409 });
            }
        }
        console.error("partner_sale_create_failed", {
            category: "partner_sale_create",
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ message: "Gagal mencatat penjualan. Silakan coba lagi." }, { status: 500 });
    }
}
