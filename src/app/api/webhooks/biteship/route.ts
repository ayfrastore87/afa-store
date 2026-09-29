import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function validSecret(received: string | null, expected: string | undefined): boolean {
    if (!received || !expected?.trim()) return false;
    const a = Buffer.from(received, "utf8");
    const b = Buffer.from(expected.trim(), "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
    if (!validSecret(request.headers.get("x-afa-biteship-webhook-secret"), process.env.BITESHIP_WEBHOOK_SECRET)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    let body: Record<string, unknown>;
    try {
        const parsed: unknown = await request.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
        body = parsed as Record<string, unknown>;
    } catch { return NextResponse.json({ message: "Invalid JSON" }, { status: 400 }); }
    const event = typeof body.event === "string" ? body.event : "";
    if (!event.trim()) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    if (!["order.status", "order.waybill_id", "order.price"].includes(event)) return NextResponse.json({ ignored: true });
    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
    if (!orderId || (event === "order.status" && (typeof body.status !== "string" || !body.status.trim()))) {
        return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }
    const order = await prisma.order.findUnique({ where: { biteshipOrderId: orderId }, select: { id: true } });
    if (!order) return NextResponse.json({ ignored: true, reason: "not_found" });

    if (event === "order.status") {
        const status = typeof body.status === "string" ? body.status.trim() : "";
        if (!status) return NextResponse.json({ ignored: true });
        const tracking = typeof body.courier_tracking_id === "string" ? body.courier_tracking_id.trim() : "";
        const waybill = typeof body.courier_waybill_id === "string" ? body.courier_waybill_id.trim() : "";
        await prisma.order.updateMany({ where: { id: order.id, OR: [{ biteshipStatus: { not: status } }, ...(tracking ? [{ biteshipTrackingId: { not: tracking } }] : []), ...(waybill ? [{ trackingNumber: { not: waybill } }] : [])] }, data: { biteshipStatus: status, ...(tracking ? { biteshipTrackingId: tracking } : {}), ...(waybill ? { trackingNumber: waybill } : {}) } });
    } else if (event === "order.waybill_id") {
        // trackingNumber is the existing courier resi/AWB column; never confuse it
        // with the provider's courier_tracking_id (biteshipTrackingId).
        const waybill = typeof body.courier_waybill_id === "string" ? body.courier_waybill_id.trim() : "";
        if (!waybill) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
        const tracking = typeof body.courier_tracking_id === "string" ? body.courier_tracking_id.trim() : "";
        await prisma.order.updateMany({ where: { id: order.id, OR: [{ trackingNumber: { not: waybill } }, ...(tracking ? [{ biteshipTrackingId: { not: tracking } }] : [])] }, data: { trackingNumber: waybill, ...(tracking ? { biteshipTrackingId: tracking } : {}) } });
    }
    // order.price is intentionally acknowledged without any financial mutation.
    return NextResponse.json({ ok: true });
}