import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ invoice: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { invoice } = await params;
    const order = await prisma.order.findFirst({
        where: { invoice, userId: user.id },
        select: { paymentStatus: true, payment: { select: { status: true } } },
    });
    if (!order) return NextResponse.json({ message: "Pembayaran tidak ditemukan." }, { status: 404 });

    return NextResponse.json({ status: order.payment?.status ?? order.paymentStatus });
}

export async function PATCH() {
    return NextResponse.json({ message: "Payment mutation is not permitted." }, { status: 403 });
}