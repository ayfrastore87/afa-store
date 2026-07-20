import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const orders = await prisma.order.findMany({ where: { userId: user.id }, include: { items: true }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ orders });
}