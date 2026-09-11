import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

const MAX_COURIER_LENGTH = 50;
const MAX_TRACKING_LENGTH = 100;

// Status yang tidak boleh diubah menjadi SHIPPED. Label Indonesia juga
// dinormalisasi ke canonical untuk menangani data lama yang tersimpan sebagai label.
const BLOCKED_ORDER_STATUS = new Set([
    "CANCELLED",
    "CANCELED",
    "COMPLETED",
    "DIBATALKAN",
    "BATAL",
    "SELESAI",
]);

const BLOCKED_PAYMENT_STATUS = new Set(["CANCELLED", "EXPIRED"]);

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    let body: { courier?: unknown; trackingNumber?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const { id } = await params;

    const order = await prisma.order.findUnique({
        where: { id },
        include: { payment: { select: { status: true } } },
    });
    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

    const orderStatus = (order.status || "").trim().toUpperCase();
    if (BLOCKED_ORDER_STATUS.has(orderStatus)) {
        return NextResponse.json(
            { message: "Pesanan ini tidak dapat dikirim karena sudah selesai atau dibatalkan." },
            { status: 409 }
        );
    }

    // Payment validation: refuse shipping only when the existing payment record
    // is clearly cancelled or expired. We intentionally do not force "PAID"
    // because the current checkout/payment flow does not define that rule.
    const paymentStatus = (order.payment?.status ?? order.paymentStatus ?? "").toUpperCase();
    if (BLOCKED_PAYMENT_STATUS.has(paymentStatus)) {
        return NextResponse.json(
            { message: "Pesanan tidak dapat dikirim karena pembayarannya dibatalkan atau kedaluwarsa." },
            { status: 409 }
        );
    }

    const courier = typeof body.courier === "string" ? body.courier.trim() : "";
    const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";

    if (!courier || courier.length > MAX_COURIER_LENGTH) {
        return NextResponse.json(
            { message: "Kurir wajib diisi dan tidak boleh melebihi 50 karakter." },
            { status: 400 }
        );
    }
    if (!trackingNumber || trackingNumber.length > MAX_TRACKING_LENGTH) {
        return NextResponse.json(
            { message: "Nomor resi wajib diisi dan tidak boleh melebihi 100 karakter." },
            { status: 400 }
        );
    }

    const updated = await prisma.order.update({
        where: { id },
        data: {
            courier,
            trackingNumber,
            // Status canonical yang disimpan ke database, bukan label Indonesia.
            status: "SHIPPED",
            // Pertahankan shippedAt yang sudah ada saat perbaikan resi.
            shippedAt: order.shippedAt ?? new Date(),
        },
        select: { id: true, courier: true, trackingNumber: true, status: true, shippedAt: true },
    });

    return NextResponse.json({ order: updated });
}
