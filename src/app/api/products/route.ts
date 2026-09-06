import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productPayload } from "@/lib/product-validation";
import { getCurrentAdmin, getCurrentUser } from "@/lib/auth";

export async function GET() {
    try {
        const products = await prisma.product.findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            include: { category: true },
        });

        const data = products.map((product) => ({
            id: product.id,
            name: product.name,
            slug: product.slug,
            categoryId: product.categoryId,
            category: product.category?.name ?? "Tanpa Kategori",
            flavor: product.flavor,
            size: product.size,
            price: product.price,
            stock: product.stock,
            image: product.image,
            badge: product.badge,
            rating: product.rating,
            isActive: product.isActive,
            createdAt: product.createdAt,
        }));

        return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error) {
        console.error("Failed to load products", error);
        return NextResponse.json(
            { success: false, error: "Produk belum dapat dimuat" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const authenticated = await getCurrentUser();
    if (!authenticated) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    const parsed = productPayload(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Data produk tidak valid" }, { status: 400 });
    if (parsed.data.categoryId && !(await prisma.category.findUnique({ where: { id: parsed.data.categoryId }, select: { id: true } }))) {
        return NextResponse.json({ success: false, error: "Kategori tidak ditemukan" }, { status: 400 });
    }
    try {
        const product = await prisma.product.create({ data: { id: crypto.randomUUID(), ...parsed.data, createdAt: new Date() } });
        return NextResponse.json({ success: true, product }, { status: 201 });
    } catch (error) {
        console.error("Product create failed", error);
        return NextResponse.json({ success: false, error: "Terjadi kesalahan server" }, { status: 500 });
    }
}