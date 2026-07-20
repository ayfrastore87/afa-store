import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const users = await prisma.user.findMany({
        where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }] } : undefined,
        include: { orders: { include: { items: true }, orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ users });
}
export async function PATCH(request: Request) {
    const { id, ...data } = await request.json();
    const user = await prisma.user.update({ where: { id }, data });
    return NextResponse.json({ user });
}
