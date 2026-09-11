import { NextResponse } from "next/server";

import { isPartnerStatus } from "@/lib/partner";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const where = isPartnerStatus(status) ? { status } : undefined;

    const partners = await prisma.partner.findMany({
        where,
        include: {
            user: {
                select: { id: true, name: true, email: true, phone: true, isActive: true },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ partners });
}
