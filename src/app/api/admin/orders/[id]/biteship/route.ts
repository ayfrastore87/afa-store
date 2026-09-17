import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import {
    BITESHIP_LEGACY_COURIER_MESSAGE,
    BITESHIP_LEGACY_PHONE_MESSAGE,
    BITESHIP_ORIGIN_INCOMPLETE_MESSAGE,
    hasCourierCode,
} from "@/lib/biteship-order";
import { normalizeRecipientPhone } from "@/lib/checkout-address";
import { resolveKasirDeliveryStatusUpdate } from "@/lib/kasir-delivery";
import { kasirShipmentSyncView } from "@/lib/kasir";
import { resolveProductWeight } from "@/lib/shipping-weight";
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

// Columns the tracking refresh really needs. Everything else on the order row (customer
// body, address, money, coordinates, quote refs) is deliberately NOT selected: the refresh
// neither reads nor writes it.
const SHIPMENT_SYNC_SELECT = {
    id: true,
    biteshipOrderId: true,
    biteshipStatus: true,
    biteshipTrackingId: true,
    biteshipLabelUrl: true,
    biteshipCreatedAt: true,
    trackingNumber: true,
    updatedAt: true,
} as const;

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
    // Biteship validates the recipient phone, and a stored value may still be
    // formatted ("0812-3456 7890"). The EXISTING checkout normalizer is reused here
    // — never a second phone implementation — and a phone without any usable digits
    // is refused instead of being posted as an invalid payload.
    const recipientPhone = normalizeRecipientPhone(order.phone);
    if (!recipientPhone) {
        return NextResponse.json({ message: BITESHIP_LEGACY_PHONE_MESSAGE }, { status: 409 });
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
                contactPhone: recipientPhone,
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
                // Authoritative weight snapshot: legacy rows (and rows created before
                // the weight column was persisted) still hold weight 0, which Biteship
                // rejects. The EXISTING shipping-weight rule backfills those, so the
                // payload never carries a browser value and never a zero weight.
                weight: resolveProductWeight(item.weight),
            })),
            senderName: order.senderName,
            // Label-only shipper phone: optional, so an unusable value is dropped
            // rather than posted as an invalid `shipper_contact_phone`.
            senderPhone: order.senderPhone ? normalizeRecipientPhone(order.senderPhone) || undefined : undefined,
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

// ---------------------------------------------------------------------------
// GET /api/admin/orders/[id]/biteship
//
// Admin-only TRACKING REFRESH for an order that already has a real Biteship order.
// It never creates a shipment (POST owns that, with its compare-and-set claim), never
// touches order/payment/stock, and never reaches Biteship with a claim placeholder.
// The browser only ever talks to THIS route — the API key stays server-side. It is
// invoked from an explicit "PERBARUI STATUS" action (plus a conservative automatic
// refresh while the cashier detail page is open).
//
// Provider values are applied through `resolveKasirDeliveryStatusUpdate`, so a
// duplicated, out-of-order or unrecognized provider state can never move a shipment
// backwards and can never replace a finished one.
//
// PERFORMANCE: the response also carries a SANITIZED `delivery` block (normalized status,
// server-derived timeline, resi, label, "Terakhir Diperbarui") built by the same helpers
// the cashier detail route uses. The open detail page can therefore apply a successful
// sync directly, instead of re-reading the whole transaction after every refresh. The raw
// provider payload never leaves this route and no internal identifier is added.
// ---------------------------------------------------------------------------
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // Only the shipment/tracking columns are read here: the refresh never needs the order
    // body, its items, its payment or its money, so it never pulls them from the database.
    const order = await prisma.order.findUnique({
        where: { id },
        select: SHIPMENT_SYNC_SELECT,
    });
    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

    // No real provider order yet (missing, or our own in-flight claim placeholder).
    if (!order.biteshipOrderId || order.biteshipOrderId.startsWith(CLAIM_PREFIX)) {
        return NextResponse.json({ message: "Pesanan ini belum memiliki pengiriman Biteship." }, { status: 409 });
    }

    try {
        const remote = await retrieveBiteshipOrder(order.biteshipOrderId);
        if (!remote) {
            return NextResponse.json({ message: "Status pengiriman belum dapat diambil. Silakan coba lagi." }, { status: 502 });
        }
        // Persist the latest provider state, keeping the last known value when the
        // provider no longer returns a field. The raw provider status is stored as-is,
        // but only when the incoming value is not a regression: a duplicated, stale or
        // unrecognized provider state can never move a finished shipment backwards.
        const nextStatus = resolveKasirDeliveryStatusUpdate(order.biteshipStatus, remote.status);
        const updated = await prisma.order.update({
            where: { id },
            data: {
                biteshipStatus: nextStatus,
                biteshipTrackingId: remote.trackingId ?? order.biteshipTrackingId,
                biteshipLabelUrl: remote.labelUrl ?? order.biteshipLabelUrl,
            },
            select: SHIPMENT_SYNC_SELECT,
        });
        return NextResponse.json({ order: biteshipOrderView(updated), delivery: kasirShipmentSyncView(updated), refreshedAt: new Date().toISOString() });
    } catch (error) {
        if (error instanceof BiteshipUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 });
        }
        if (error instanceof BiteshipError) {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }
        console.error("biteship_tracking_failed", { orderId: order.id, message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ message: "Status pengiriman belum dapat diperbarui." }, { status: 500 });
    }
}
