import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ wishlist: [] });
    const wishlist = await prisma.wishlist.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { product: { select: { id: true, name: true, price: true, image: true, slug: true, isActive: true } } } });
    const safeWishlist = wishlist.map((item) => ({ ...item, name: item.product?.name ?? item.name, price: item.product?.price ?? item.price, image: item.product?.image ?? item.image, slug: item.product?.slug ?? null, isActive: item.product?.isActive ?? false }));
    return NextResponse.json({ wishlist: safeWishlist });
}
export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Login diperlukan." }, { status: 401 });
    const body: unknown = await request.json();
    const productRef = typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).productId === "string" ? (body as { productId: string }).productId : "";
    if (!productRef) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });
    const product = await prisma.product.findFirst({ where: { id: productRef, isActive: true }, select: { id: true, name: true, price: true, image: true } });
    if (!product) return NextResponse.json({ success: false, error: "Produk tidak ditemukan" }, { status: 404 });
    const existing = await prisma.wishlist.findUnique({ where: { userId_productRef: { userId: user.id, productRef } } });
    if (existing) {
        await prisma.wishlist.delete({ where: { id: existing.id } });
        return NextResponse.json({ wished: false });
    }
    await prisma.wishlist.create({ data: { userId: user.id, productRef: product.id, productId: product.id, name: product.name, price: product.price, image: product.image } });
    return NextResponse.json({ wished: true });
}
