import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

// READ-ONLY admin view of a single partner's stock ledger (Tahap VII §21/§25).
// The partner id comes from the URL, but the caller is always verified as an
// admin via getCurrentAdmin(). This route performs no mutations and never
// trusts a role or partnerId from the request body/query.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    try {
        const partner = await prisma.partner.findUnique({
            where: { id },
            select: { id: true, partnerCode: true, displayName: true, businessName: true, status: true },
        });
        if (!partner) return NextResponse.json({ message: "Mitra tidak ditemukan." }, { status: 404 });

        const [stocks, movements] = await Promise.all([
            prisma.partnerStock.findMany({
                where: { partnerId: id },
                orderBy: { updatedAt: "desc" },
                select: {
                    productId: true,
                    quantity: true,
                    updatedAt: true,
                    product: { select: { name: true, image: true, price: true } },
                },
            }),
            prisma.partnerStockMovement.findMany({
                where: { partnerId: id },
                orderBy: { createdAt: "desc" },
                take: 100,
                select: {
                    id: true,
                    productId: true,
                    type: true,
                    quantity: true,
                    unitPrice: true,
                    referenceType: true,
                    referenceId: true,
                    note: true,
                    createdAt: true,
                    product: { select: { name: true } },
                },
            }),
        ]);

        return NextResponse.json({
            partner: {
                id: partner.id,
                partnerCode: partner.partnerCode,
                name: partner.businessName || partner.displayName,
                status: partner.status,
            },
            stocks: stocks.map((stock) => ({
                productId: stock.productId,
                name: stock.product.name,
                image: stock.product.image,
                quantity: stock.quantity,
                unitCost: stock.product.price,
                updatedAt: stock.updatedAt,
            })),
            movements: movements.map((movement) => ({
                id: movement.id,
                productId: movement.productId,
                productName: movement.product?.name ?? "Produk",
                type: movement.type,
                quantity: movement.quantity,
                unitPrice: movement.unitPrice,
                referenceType: movement.referenceType,
                referenceId: movement.referenceId,
                note: movement.note,
                createdAt: movement.createdAt,
            })),
        });
    } catch (error) {
        console.error("admin_partner_stocks_failed", {
            category: "admin_partner_stocks",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Stok mitra gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
