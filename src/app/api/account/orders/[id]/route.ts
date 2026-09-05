import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const order = await prisma.order.findFirst({ where: { id, userId: user.id } });
    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

    // Order and payment transitions are controlled by trusted server/admin flows.
    // Keeping the ownership lookup above avoids turning this endpoint into an
    // order-existence oracle while preventing client-side status manipulation.
    return NextResponse.json({ message: "Perubahan status pesanan hanya dapat dilakukan oleh sistem atau admin." }, { status: 403 });
}