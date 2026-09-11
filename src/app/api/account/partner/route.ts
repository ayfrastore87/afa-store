import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const partner = await prisma.partner.findUnique({
        where: { userId: user.id },
        select: {
            id: true,
            partnerCode: true,
            partnerType: true,
            status: true,
            displayName: true,
            businessName: true,
            phone: true,
            address: true,
            village: true,
            district: true,
            city: true,
            postalCode: true,
            createdAt: true,
        },
    });

    return NextResponse.json({ partner });
}
