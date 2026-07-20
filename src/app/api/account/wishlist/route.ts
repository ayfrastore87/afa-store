import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ wishlist: [] });
    const wishlist = await prisma.wishlist.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ wishlist });
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Login diperlukan." }, { status: 401 });
    const { productRef, productId, name, price, image } = await request.json();
    const existing = await prisma.wishlist.findUnique({ where: { userId_productRef: { userId: user.id, productRef } } });
    if (existing) {
        await prisma.wishlist.delete({ where: { id: existing.id } });
        return NextResponse.json({ wished: false });
    }
    await prisma.wishlist.create({ data: { userId: user.id, productRef, productId, name, price, image } });
    return NextResponse.json({ wished: true });
}