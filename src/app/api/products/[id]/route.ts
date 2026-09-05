import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";
import { productPayload } from "@/lib/product-validation";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!(await prisma.product.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ success: false, error: "Produk tidak ditemukan" }, { status: 404 });
    const parsed = productPayload(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Data produk tidak valid" }, { status: 400 });
    if (parsed.data.categoryId && !(await prisma.category.findUnique({ where: { id: parsed.data.categoryId }, select: { id: true } }))) return NextResponse.json({ success: false, error: "Kategori tidak ditemukan" }, { status: 400 });
    try { return NextResponse.json({ success: true, product: await prisma.product.update({ where: { id }, data: parsed.data }) }); }
    catch (error) { console.error("Product update failed", error); return NextResponse.json({ success: false, error: "Terjadi kesalahan server" }, { status: 500 }); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!(await prisma.product.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ success: false, error: "Produk tidak ditemukan" }, { status: 404 });
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true, message: "Produk dinonaktifkan" });
}