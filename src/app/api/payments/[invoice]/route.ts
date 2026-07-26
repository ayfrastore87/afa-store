import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type PaymentUpdateBody = {
    status?: string;
    method?: string;
    paidAt?: string | null;
    expiredAt?: string | null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ invoice: string }> }) {
    try {
        const { invoice } = await params;
        let body: PaymentUpdateBody;
        try {
            body = (await request.json()) as PaymentUpdateBody;
        } catch {
            return NextResponse.json({ message: "Payload payment tidak valid." }, { status: 400 });
        }

        const order = await prisma.order.findUnique({ where: { invoice } });
        if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

        const payment = await prisma.payment.upsert({
            where: { orderId: order.id },
            create: {
                orderId: order.id,
                method: body.method || order.paymentMethod,
                amount: order.total,
                status: body.status || "PENDING",
                paidAt: body.paidAt ? new Date(body.paidAt) : null,
                expiredAt: body.expiredAt ? new Date(body.expiredAt) : null,
            },
            update: {
                method: body.method || order.paymentMethod,
                status: body.status || undefined,
                paidAt: body.paidAt === null ? null : body.paidAt ? new Date(body.paidAt) : undefined,
                expiredAt: body.expiredAt === null ? null : body.expiredAt ? new Date(body.expiredAt) : undefined,
            },
        });

        const shouldMarkPaid = payment.status === "PAID";
        if (shouldMarkPaid) {
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    paymentStatus: "PAID",
                    paidAt: payment.paidAt ?? new Date(),
                    status: "PAID",
                },
            });
        }

        return NextResponse.json({ message: "Payment updated.", payment }, { status: 200 });
    } catch (error) {
        console.error("Payment update Error:", error);
        return NextResponse.json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}