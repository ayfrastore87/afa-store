import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import {
    BITESHIP_LEGACY_COURIER_MESSAGE,
    BITESHIP_ORIGIN_INCOMPLETE_MESSAGE,
    hasCourierCode,
} from "@/lib/biteship-order";
import {
    BiteshipError,
    BiteshipUnavailableError,
    createBiteshipOrder,
    getBiteshipOriginIdentity,
    retrieveBiteshipOrder,
} from "@/lib/biteship";

export const runtime = "nodejs";

// Claim token prefix. A real Biteship order id is a short hex id; this prefix can
// never collide with one. We store it in the nullable, unique `biteshipOrderId`
// column as a compare-and-set claim so two concurrent requests cannot both reach
// the external POST /v1/orders.
const CLAIM_PREFIX = "claim:";

const BLOCKED_ORDER_STATUS = new Set(["CANCELLED", "CANCELED", "COMPLETED", "DIBATALKAN", "BATAL", "SELESAI"]);

function biteshipOrderView(order: {
    id: string;
    biteshipOrderId: string | null;
    biteshipStatus: string | null;
    biteshipTrackingId: string | null;
    biteshipLabelUrl: string | null;
    biteshipCreatedAt: Date | null;
}) {
    return {
        id: order.id,
        biteshipOrderId: order.biteshipOrderId,
        biteshipStatus: order.biteshipStatus,
        biteshipTrackingId: order.biteshipTrackingId,
        biteshipLabelUrl: order.biteshipLabelUrl,
        biteshipCreatedAt: order.biteshipCreatedAt,
    };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const order = await prisma.order.findUnique({
        where: { id },
        include: { items: true, payment: { select: { status: true } } },
    });
    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

    // Idempotent success: a real Biteship order already exists.
    if (order.biteshipOrderId && !order.biteshipOrderId.startsWith(CLAIM_PREFIX)) {
        return NextResponse.json({ order: biteshipOrderView(order) });
    }

    const orderStatus = (order.status || "").trim().toUpperCase();
    if (BLOCKED_ORDER_STATUS.has(orderStatus)) {
        return NextResponse.json({ message: "Pesanan ini tidak dapat dikirim karena sudah selesai atau dibatalkan." }, { status: 409 });
    }

    const paymentStatus = (order.payment?.status ?? order.paymentStatus ?? "").toUpperCase();
    if (paymentStatus !== "PAID") {
        return NextResponse.json({ message: "Pesanan hanya bisa dibuatkan pengiriman Biteship setelah pembayarannya terbayar." }, { status: 409 });
    }

    // Legacy orders: never guess a courier CODE from the display name.
    if (!hasCourierCode(order.courierCode)) {
        return NextResponse.json({ message: BITESHIP_LEGACY_COURIER_MESSAGE }, { status: 409 });
    }
    if (!order.serviceCode?.trim()) {
        return NextResponse.json({ message: BITESHIP_LEGACY_COURIER_MESSAGE }, { status: 409 });
    }
    if (!order.destinationAreaId?.trim()) {
        return NextResponse.json({ message: "Alamat tujuan pengiriman belum tersedia untuk pesanan ini." }, { status: 409 });
    }

    // Physical origin is 100% server-controlled and must be complete.
    const origin = getBiteshipOriginIdentity();
    if (!origin) {
        return NextResponse.json({ message: BITESHIP_ORIGIN_INCOMPLETE_MESSAGE }, { status: 503 });
    }

    // Compare-and-set claim: only one concurrent request may proceed to Biteship.
    const claim = `${CLAIM_PREFIX}${order.id}`;
    const claimed = await prisma.order.updateMany({
        where: { id, biteshipOrderId: null },
        data: { biteshipOrderId: claim },
    });
    if (claimed.count === 0) {
        const fresh = await prisma.order.findUnique({ where: { id } });
        if (fresh?.biteshipOrderId && !fresh.biteshipOrderId.startsWith(CLAIM_PREFIX)) {
            return NextResponse.json({ order: biteshipOrderView(fresh) });
        }
        return NextResponse.json({ message: "Pengiriman Biteship untuk pesanan ini sedang diproses. Silakan coba lagi sebentar." }, { status: 409 });
    }

    const releaseClaim = () =>
        prisma.order.updateMany({ where: { id, biteshipOrderId: claim }, data: { biteshipOrderId: null } });

    try {
        const created = await createBiteshipOrder({
            origin,
            destination: {
                contactName: order.customer,
                contactPhone: order.phone,
                address: order.address,
                areaId: order.destinationAreaId!,
                note: order.note,
            },
            courierCode: order.courierCode!,
            serviceCode: order.serviceCode!,
            referenceId: order.id,
            items: order.items.map((item) => ({
                name: item.name,
                value: item.price,
                quantity: item.quantity,
                weight: item.weight,
            })),
            senderName: order.senderName,
            senderPhone: order.senderPhone,
            hidePrice: order.hidePrice,
        });

        const updated = await prisma.order.update({
            where: { id },
            data: {
                biteshipOrderId: created.orderId,
                biteshipStatus: created.status,
                biteshipTrackingId: created.trackingId,
                biteshipLabelUrl: created.labelUrl,
                biteshipCreatedAt: new Date(),
            },
        });
        return NextResponse.json({ order: biteshipOrderView(updated) });
    } catch (error) {
        const conflict = (error as (BiteshipError & { biteshipReferenceIdConflict?: { orderId: string | null } }) | null)?.biteshipReferenceIdConflict;
        if (conflict?.orderId) {
            try {
                const existing = await retrieveBiteshipOrder(conflict.orderId);
                if (existing) {
                    const updated = await prisma.order.update({
                        where: { id },
                        data: {
                            biteshipOrderId: existing.orderId,
                            biteshipStatus: existing.status,
                            biteshipTrackingId: existing.trackingId,
                            biteshipLabelUrl: existing.labelUrl,
                            biteshipCreatedAt: order.biteshipCreatedAt ?? new Date(),
                        },
                    });
                    return NextResponse.json({ order: biteshipOrderView(updated) });
                }
            } catch {
                // fall through to safe failure handling below
            }
        }

        await releaseClaim().catch(() => undefined);

        if (error instanceof BiteshipUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 });
        }
        if (error instanceof BiteshipError) {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }
        console.error("biteship_order_failed", { orderId: order.id, message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ message: "Gagal membuat pengiriman Biteship. Silakan coba lagi." }, { status: 500 });
    }
}
