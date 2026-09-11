import { NextResponse } from "next/server";
import { z } from "zod";

import {
    isPartnerStockMovementType,
    MAX_PARTNER_STOCK_QUANTITY,
    PARTNER_REFERENCE_MANUAL_OUT,
    PARTNER_REFERENCE_TRANSFER_IN,
} from "@/lib/partner-dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentPartner } from "@/lib/server-auth";

export const runtime = "nodejs";

const movementSchema = z.object({
    type: z.string().trim(),
    productId: z.string().trim().min(1, "Produk wajib dipilih."),
    quantity: z.number().int().min(1, "Jumlah minimal 1.").max(MAX_PARTNER_STOCK_QUANTITY, "Jumlah terlalu besar."),
    unitPrice: z.number().int().min(0).max(MAX_PARTNER_STOCK_QUANTITY * 10).optional(),
    note: z.string().trim().max(255, "Catatan maksimal 255 karakter.").optional(),
});

class PartnerStockMovementError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = "PartnerStockMovementError";
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

    const parsed = movementSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data tidak valid." }, { status: 400 });
    }

    const { type, productId, quantity, unitPrice, note } = parsed.data;
    if (!isPartnerStockMovementType(type)) {
        return NextResponse.json({ message: "Jenis mutasi harus IN atau OUT." }, { status: 400 });
    }

    try {
        const now = new Date();

        await prisma.$transaction(async (tx) => {
            // Verify the product exists and is active so we never move orphan stock.
            const product = await tx.product.findUnique({
                where: { id: productId },
                select: { id: true, isActive: true },
            });
            if (!product || product.isActive === false) {
                throw new PartnerStockMovementError(404, "Produk tidak ditemukan.");
            }

            if (type === "IN") {
                // F-1: IN = transfer from AFA Store to the partner. Decrement
                // Product.stock atomically first so the transfer cannot overdraw
                // AFA inventory, then top up PartnerStock and record the ledger.
                const productChanged = await tx.product.updateMany({
                    where: { id: productId, isActive: true, stock: { gte: quantity } },
                    data: { stock: { decrement: quantity } },
                });
                if (productChanged.count !== 1) {
                    throw new PartnerStockMovementError(409, "Stok AFA tidak mencukupi.");
                }

                await tx.partnerStock.upsert({
                    where: { partnerId_productId: { partnerId, productId } },
                    create: { partnerId, productId, quantity },
                    update: { quantity: { increment: quantity } },
                });

                await tx.partnerStockMovement.create({
                    data: {
                        partnerId,
                        productId,
                        type: "IN",
                        quantity,
                        unitPrice: unitPrice ?? null,
                        referenceType: PARTNER_REFERENCE_TRANSFER_IN,
                        note: note || null,
                        createdAt: now,
                    },
                });
                return;
            }

            // F-2: OUT = partner stock reduction. Use a conditional decrement so a
            // concurrent writer cannot push PartnerStock.quantity below zero.
            const stockChanged = await tx.partnerStock.updateMany({
                where: { partnerId, productId, quantity: { gte: quantity } },
                data: { quantity: { decrement: quantity } },
            });
            if (stockChanged.count !== 1) {
                throw new PartnerStockMovementError(409, "Stok mitra tidak mencukupi.");
            }

            await tx.partnerStockMovement.create({
                data: {
                    partnerId,
                    productId,
                    type: "OUT",
                    quantity,
                    unitPrice: unitPrice ?? null,
                    referenceType: PARTNER_REFERENCE_MANUAL_OUT,
                    note: note || null,
                    createdAt: now,
                },
            });
        });

        return NextResponse.json({ message: "Stok berhasil diperbarui." }, { status: 201 });
    } catch (error) {
        if (error instanceof PartnerStockMovementError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        console.error("partner_stock_movement_failed", {
            category: "partner_stock_movement",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Gagal memperbarui stok. Silakan coba lagi." }, { status: 500 });
    }
}
