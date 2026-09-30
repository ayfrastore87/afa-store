import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { MAX_PRODUCT_IMAGES, resolveProductImages } from "@/lib/product-gallery";

type Params = { params: Promise<{ id: string }> };

function invalid(message: string, status = 400) { return NextResponse.json({ success: false, error: message }, { status }); }

export async function GET(_request: Request, { params }: Params) {
    const { id } = await params;
    const product = await prisma.product.findUnique({ where: { id }, select: { image: true, images: { orderBy: { sortOrder: "asc" } } } });
    if (!product) return invalid("Produk tidak ditemukan", 404);
    return NextResponse.json({ success: true, images: resolveProductImages(product.image, product.images) });
}

export async function PUT(request: Request, { params }: Params) {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return invalid("Unauthorized", 401);
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { images?: unknown };
    if (!Array.isArray(body.images) || body.images.length > MAX_PRODUCT_IMAGES) return invalid("Produk maksimal memiliki 7 foto.");
    const images = body.images.map((item) => {
        const value = item as { url?: unknown; sortOrder?: unknown; isPrimary?: unknown };
        return { url: typeof value.url === "string" ? value.url.trim() : "", sortOrder: Number(value.sortOrder), isPrimary: value.isPrimary === true };
    });
    if (images.some((image) => !image.url || !Number.isInteger(image.sortOrder) || image.sortOrder < 0 || image.sortOrder >= images.length)) return invalid("Data galeri tidak valid.");
    if (new Set(images.map((image) => image.url)).size !== images.length || images.filter((image) => image.isPrimary).length > 1) return invalid("Foto utama atau URL foto tidak valid.");
    const primary = images.find((image) => image.isPrimary) ?? images[0];
    try {
        const product = await prisma.$transaction(async (tx) => {
            const existing = await tx.product.findUnique({ where: { id }, select: { id: true } });
            if (!existing) throw new Error("NOT_FOUND");
            await tx.productImage.deleteMany({ where: { productId: id } });
            if (images.length) await tx.productImage.createMany({ data: images.map((image) => ({ productId: id, ...image })) });
            return tx.product.update({ where: { id }, data: { image: primary?.url ?? null }, include: { images: { orderBy: { sortOrder: "asc" } } } });
        });
        return NextResponse.json({ success: true, product, images: resolveProductImages(product.image, product.images) });
    } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") return invalid("Produk tidak ditemukan", 404);
        console.error("Product gallery update failed", error);
        return invalid("Galeri produk gagal disimpan.", 500);
    }
}