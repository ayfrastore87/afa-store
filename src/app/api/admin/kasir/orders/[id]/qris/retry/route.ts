import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { KASIR_SOURCES } from "@/lib/kasir";
import { createMidtransQrisCharge, getQrisActionUrl } from "@/lib/midtrans";

export const runtime = "nodejs";

// POST /api/admin/kasir/orders/[id]/qris/retry - Admin-only QRIS retry for persisted orders

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const order = await prisma.order.findFirst({
        where: { id, source: { in: [...KASIR_SOURCES] }, paymentMethod: "QRIS" },
        include: { items: true, user: { select: { email: true } }, payment: true },
    });

    if (!order) return NextResponse.json({ message: "Order not found." }, { status: 404 });
    if (!order.payment) return NextResponse.json({ message: "Payment not found." }, { status: 404 });

    const payment = order.payment;

    if (payment.status !== "PENDING") {
        return NextResponse.json({ message: `Cannot initialize QRIS (status: ${payment.status})`, status: payment.status }, { status: 409 });
    }

    if (payment.qrisUrl) {
        return NextResponse.json({ created: false, reused: true, orderId: order.id, invoice: order.invoice, payment: { status: payment.status, qrisUrl: payment.qrisUrl, transactionId: payment.transactionId, transactionRef: payment.transactionRef, paymentType: payment.paymentType, expiredAt: payment.expiredAt } });
    }

    const invoice = order.invoice;
    const total = order.total;
    const items = order.items.map((i) => ({ id: i.id.slice(0, 50), name: i.name.slice(0, 50), price: i.price, quantity: i.quantity }));
    if (order.shipping > 0) items.push({ id: "shipping", name: "Ongkir", price: order.shipping, quantity: 1 });
    const customer = { name: order.customer, email: order.user?.email ?? null, phone: order.phone };

    let charge;
    try {
        charge = await createMidtransQrisCharge({ invoice, amount: total, customer, items, expiryMinutes: 60 });
    } catch (e) {
        console.error("Midtrans failed", { orderId: order.id, invoice });
        return NextResponse.json({ message: "Gagal membuat QRIS.", retryable: true, orderId: order.id, invoice }, { status: 503 });
    }

    const qrisUrl = getQrisActionUrl(charge) ?? null;
    if (!qrisUrl) return NextResponse.json({ message: "QR code not available from Midtrans.", retryable: true, orderId: order.id, invoice }, { status: 502 });

    const expiredAt = charge.expiry_time ? new Date(charge.expiry_time.replace(" ", "T")) : new Date(Date.now() + 60 * 60 * 1000);

    try {
        await prisma.payment.updateMany({
            where: { id: payment.id, status: "PENDING", qrisUrl: null },
            data: { qrisUrl, transactionId: charge.transaction_id ?? null, transactionRef: charge.order_id ?? invoice, paymentType: charge.payment_type ?? "qris", rawResponse: charge, expiredAt },
        });
    } catch {
        return NextResponse.json({ message: "Gagal menyimpan QRIS.", retryable: true, orderId: order.id, invoice }, { status: 500 });
    }

    const finalPayment = await prisma.payment.findUnique({ where: { id: payment.id } });

    return NextResponse.json({
        created: !!finalPayment?.qrisUrl,
        reused: !finalPayment?.qrisUrl,
        orderId: order.id,
        invoice,
        payment: { status: finalPayment?.status, method: finalPayment?.method, qrisUrl: finalPayment?.qrisUrl, transactionId: finalPayment?.transactionId, transactionRef: finalPayment?.transactionRef, paymentType: finalPayment?.paymentType, expiredAt: finalPayment?.expiredAt },
    });
}
