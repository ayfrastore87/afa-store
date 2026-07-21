import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

const allowedStatuses = ["PENDING", "PROCESSING", "PACKED", "SHIPPED", "COMPLETED", "CANCELLED"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const status = String(body.status || "").toUpperCase();

    if (!allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
        return NextResponse.json({ message: "Status tidak valid." }, { status: 400 });
    }

    const order = await prisma.order.findFirst({ where: { id, userId: user.id } });
    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

    const timestampField =
        status === "PROCESSING" ? { processedAt: new Date() } :
            status === "PACKED" ? { packedAt: new Date() } :
                status === "SHIPPED" ? { shippedAt: new Date() } :
                    status === "COMPLETED" ? { completedAt: new Date() } :
                        status === "CANCELLED" ? { cancelledAt: new Date() } :
                            status === "PENDING" ? { paidAt: new Date() } : {};

    const updated = await prisma.order.update({
        where: { id },
        data: { status, ...timestampField },
        include: { items: true },
    });

    return NextResponse.json({ order: updated });
}