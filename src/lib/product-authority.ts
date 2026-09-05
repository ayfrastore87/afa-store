import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProductRequestItem = { id: string; qty: number };
export type AuthoritativeProductItem = ProductRequestItem & {
    name: string;
    price: number;
    image: string;
    slug: string;
    stock: number;
};

export class ProductAuthorityError extends Error {
    constructor(public readonly status: 400 | 404 | 409, message: string) {
        super(message);
        this.name = "ProductAuthorityError";
    }
}

export function parseProductRequestItem(value: unknown): ProductRequestItem | null {
    if (typeof value !== "object" || value === null) return null;
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id.trim()) return null;
    if (typeof item.qty !== "number" || !Number.isInteger(item.qty) || item.qty < 1) return null;
    return { id: item.id.trim(), qty: item.qty };
}

export async function getActiveProductById(productId: string) {
    if (typeof productId !== "string" || !productId.trim()) return null;
    return prisma.product.findFirst({
        where: { id: productId.trim(), isActive: true },
        select: { id: true, name: true, slug: true, price: true, stock: true, image: true },
    });
}

type ProductReader = Pick<Prisma.TransactionClient, "product">;

export async function authorizeProductItems(items: ProductRequestItem[], client: ProductReader = prisma): Promise<AuthoritativeProductItem[]> {
    if (!items.length) throw new ProductAuthorityError(400, "Data tidak valid");

    const grouped = new Map<string, number>();
    for (const item of items) {
        if (!item.id || !Number.isInteger(item.qty) || item.qty < 1) {
            throw new ProductAuthorityError(400, "Data tidak valid");
        }
        grouped.set(item.id, (grouped.get(item.id) ?? 0) + item.qty);
    }

    const products = await client.product.findMany({
        where: { id: { in: [...grouped.keys()] }, isActive: true },
        select: { id: true, name: true, slug: true, price: true, stock: true, image: true },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    return [...grouped].map(([id, qty]) => {
        const product = productMap.get(id);
        if (!product) throw new ProductAuthorityError(404, "Produk tidak ditemukan");
        if (qty > product.stock) throw new ProductAuthorityError(409, "Stok produk tidak mencukupi");
        return { id, qty, name: product.name, slug: product.slug, price: product.price, stock: product.stock, image: product.image || "/products/parcel.png" };
    });
}

export function productAuthorityResponse(error: unknown) {
    if (error instanceof ProductAuthorityError) return { status: error.status, error: error.message };
    return { status: 500 as const, error: "Terjadi kesalahan server" };
}