import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { name?: unknown; slug?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ success: false, error: "Nama kategori wajib diisi." }, { status: 400 });
    const existing = await prisma.category.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!existing) return NextResponse.json({ success: false, error: "Kategori tidak ditemukan." }, { status: 404 });
    const slug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : existing.slug;
    const duplicate = await prisma.category.findFirst({ where: { OR: [{ name }, { slug }], NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ success: false, error: "Kategori sudah tersedia." }, { status: 409 });
    const category = await prisma.category.update({ where: { id }, data: { name, slug } });
    return NextResponse.json({ success: true, data: category });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    const { id } = await context.params;
    const category = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!category) return NextResponse.json({ success: false, error: "Kategori tidak ditemukan." }, { status: 404 });
    if (category._count.products > 0) return NextResponse.json({ success: false, error: "Kategori masih digunakan oleh produk dan tidak dapat dihapus." }, { status: 409 });
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
