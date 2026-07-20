import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const now = new Date();
    const vouchers = await prisma.voucher.findMany({ where: { isActive: true, OR: [{ endsAt: null }, { endsAt: { gte: now } }] }, orderBy: { createdAt: "desc" } });
    const owned = await prisma.userVoucher.findMany({ where: { userId: user.id }, include: { voucher: true }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ vouchers, owned });
}