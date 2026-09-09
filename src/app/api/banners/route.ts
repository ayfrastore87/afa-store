import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const data = await prisma.banner.findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            select: { id: true, title: true, subtitle: true, image: true, ctaLabel: true, ctaUrl: true },
        });
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Banners load failed", error);
        return NextResponse.json({ success: false, error: "Banner belum dapat dimuat" }, { status: 500 });
    }
}