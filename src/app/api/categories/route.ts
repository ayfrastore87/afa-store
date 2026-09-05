import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try { return NextResponse.json({ success: true, data: await prisma.category.findMany({ orderBy: { name: "asc" } }) }); }
    catch (error) { console.error("Categories load failed", error); return NextResponse.json({ success: false, error: "Kategori belum dapat dimuat" }, { status: 500 }); }
}