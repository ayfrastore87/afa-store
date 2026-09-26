import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

const slugify = (value: string) => value.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const imageUrlValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || value.length > 2048) return undefined;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:" ? value.trim() : undefined;
    } catch { return undefined; }
};

export async function GET() {
    try {
        const categories = await prisma.category.findMany({ 
            orderBy: { name: "asc" },
            include: {
                _count: {
                    select: { products: true }
                }
            }
        });
        
        console.info("[api/categories] Success", { count: categories.length });
        
        return NextResponse.json({ success: true, data: categories });
    } catch (error) {
        // Detailed error logging for debugging
        console.error("[api/categories] Failed:", {
            error: error instanceof Error ? error.message : String(error),
            errorType: error instanceof Error ? error.name : "Unknown",
            stack: error instanceof Error && error.stack ? error.stack.substring(0, 500) : undefined,
            category: "categories_api",
        });
        
        return NextResponse.json({ 
            success: false, 
            error: "Kategori belum dapat dimuat" 
        }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { name?: unknown; imageUrl?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ success: false, error: "Nama kategori wajib diisi." }, { status: 400 });
    const slug = slugify(name);
    if (!slug) return NextResponse.json({ success: false, error: "Nama kategori tidak valid." }, { status: 400 });
    const duplicate = await prisma.category.findFirst({ where: { OR: [{ name }, { slug }] }, select: { id: true } });
    if (duplicate) return NextResponse.json({ success: false, error: "Kategori sudah tersedia." }, { status: 409 });
    try {
        const imageUrl = imageUrlValue(body.imageUrl);
        if (imageUrl === undefined) return NextResponse.json({ success: false, error: "URL gambar kategori tidak valid." }, { status: 400 });
        const category = await prisma.category.create({ data: { id: crypto.randomUUID(), name, slug, imageUrl } });
        return NextResponse.json({ success: true, data: category }, { status: 201 });
    } catch (error) {
        console.error("[POST /api/categories]", error);
        return NextResponse.json({ success: false, error: "Kategori gagal disimpan." }, { status: 500 });
    }
}