import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orderStatusLabels } from "@/lib/orders";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ publicToken: string }> }) {
    const { publicToken } = await params;
    if (!publicToken || publicToken.length < 20 || publicToken.length > 80) {
        return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });
    }
    const order = await prisma.order.findUnique({
        where: { publicToken },
        select: {
            invoice: true, createdAt: true, status: true, paymentStatus: true, paymentMethod: true,
            customer: true, subtotal: true, discount: true, shipping: true, total: true,
            courier: true, service: true, trackingNumber: true, biteshipTrackingId: true,
            paidAt: true, items: { select: { name: true, itemType: true, description: true, quantity: true, unitPrice: true, price: true, subtotal: true } },
        },
    });
    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });
    return NextResponse.json({
        orderNumber: order.invoice, invoice: order.invoice, createdAt: order.createdAt,
        status: order.status, statusLabel: orderStatusLabels[order.status] ?? order.status,
        paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, paidAt: order.paidAt,
        customerName: order.customer,
        items: order.items.map((item) => ({ ...item, unitPrice: item.unitPrice ?? item.price })),
        subtotal: order.subtotal, discount: order.discount, shippingCost: order.shipping, grandTotal: order.total,
        shipping: order.courier || order.service || order.trackingNumber || order.biteshipTrackingId ? {
            courier: order.courier, service: order.service, trackingNumber: order.trackingNumber ?? order.biteshipTrackingId,
        } : null,
    }, { headers: { "Cache-Control": "no-store" } });
}