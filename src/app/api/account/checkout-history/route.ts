import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ histories: [] });
    const histories = await prisma.checkoutHistory.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ histories });
}
export async function POST(request: Request) {
    const user = await getCurrentUser();
    const data = await request.json();
    const history = await prisma.checkoutHistory.create({ data: { ...data, userId: user?.id } });
    return NextResponse.json({ history }, { status: 201 });
}
