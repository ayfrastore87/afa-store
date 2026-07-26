import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMidtransSignature } from "@/lib/midtrans";

export const runtime = "nodejs";

type MidtransNotification = {
    order_id?: string;
    transaction_id?: string;
    transaction_status?: string;
    fraud_status?: string;
    payment_type?: string;
    gross_amount?: string;
    status_code?: string;
    signature_key?: string;
};

export async function POST(request: Request) {
    const payload = (await request.json()) as MidtransNotification;
    if (!verifyMidtransSignature(payload)) {
        return NextResponse.json({ message: "Invalid Midtrans signature." }, { status: 401 });
    }

    const invoice = payload.order_id;
    if (!invoice) return NextResponse.json({ message: "Missing order_id." }, { status: 400 });

    const status = payload.transaction_status;
    const isPaid = status === "settlement" || (status === "capture" && payload.fraud_status === "accept");
    const isExpired = status === "expire";

    if (isPaid) {
        await prisma.order.update({
            where: { invoice },
            data: {
                status: "PAID",
                paymentStatus: "PAID",
                paidAt: new Date(),
                payment: {
                    update: {
                        status: "PAID",
                        transactionId: payload.transaction_id ?? undefined,
                        paymentType: payload.payment_type ?? undefined,
                        paidAt: new Date(),
                    },
                },
            },
        });
    } else if (isExpired) {
        await prisma.order.update({
            where: { invoice },
            data: {
                status: "EXPIRED",
                paymentStatus: "EXPIRED",
                payment: {
                    update: {
                        status: "EXPIRED",
                        transactionId: payload.transaction_id ?? undefined,
                        paymentType: payload.payment_type ?? undefined,
                    },
                },
            },
        });
    }

    return NextResponse.json({ received: true });
}