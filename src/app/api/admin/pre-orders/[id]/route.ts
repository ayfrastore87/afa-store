import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/server-auth";
import { getPreOrder, handoverPreOrder, recordPreOrderPayment, serializePreOrder, serializePreOrderPayment, transitionPreOrderStatus, verifyPreOrderPayment, cancelPreOrderPayment } from "@/lib/pre-order";
import { isPreOrderStatus } from "@/lib/pre-order-core";
import { isCuidLike, preOrderErrorResponse, readJsonBody } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// /api/admin/pre-orders/[id]  (admin only)
// GET  : detail
// PATCH: { action: "status", status } | { action: "payment", amount, method, cashReceived?, note?, idempotencyKey? }
//        | { action: "verify_payment", paymentId } | { action: "cancel_payment", paymentId, reason? }
//        | { action: "handover" }
// One admin endpoint with explicit actions keeps the admin UI simple; all
// actions delegate to the same locked service functions as the kasir routes.
// ---------------------------------------------------------------------------

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    if (!isCuidLike(id)) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404 });
    try {
        const po = await getPreOrder(id);
        if (!po) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404 });
        return NextResponse.json({ preOrder: serializePreOrder(po) });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/pre-orders/[id]#GET", { id });
    }
}

export async function PATCH(request: Request, { params }: Params) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    if (!isCuidLike(id)) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404 });
    const body = await readJsonBody(request);
    const action = typeof body.action === "string" ? body.action : "";

    try {
        switch (action) {
            case "status": {
                const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
                if (!isPreOrderStatus(status)) return NextResponse.json({ message: "Status tidak valid." }, { status: 400 });
                const po = await transitionPreOrderStatus(id, status, admin.id);
                return NextResponse.json({ preOrder: serializePreOrder(po) });
            }
            case "payment": {
                const result = await recordPreOrderPayment({
                    preOrderId: id,
                    amount: body.amount,
                    method: body.method,
                    cashReceived: body.cashReceived,
                    note: body.note,
                    idempotencyKey: body.idempotencyKey,
                    operatorId: admin.id,
                    verifyImmediately: true,
                });
                return NextResponse.json({ preOrder: serializePreOrder(result.preOrder), payment: serializePreOrderPayment(result.payment), replayed: result.replayed });
            }
            case "verify_payment": {
                const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
                if (!isCuidLike(paymentId)) return NextResponse.json({ message: "Pembayaran tidak ditemukan." }, { status: 404 });
                const result = await verifyPreOrderPayment(id, paymentId, admin.id);
                return NextResponse.json({ preOrder: serializePreOrder(result.preOrder), payment: serializePreOrderPayment(result.payment), alreadyVerified: result.alreadyVerified });
            }
            case "cancel_payment": {
                const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
                if (!isCuidLike(paymentId)) return NextResponse.json({ message: "Pembayaran tidak ditemukan." }, { status: 404 });
                const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
                const po = await cancelPreOrderPayment(id, paymentId, admin.id, reason || "Dibatalkan admin");
                return NextResponse.json({ preOrder: serializePreOrder(po) });
            }
            case "handover": {
                const result = await handoverPreOrder(id, admin.id);
                return NextResponse.json({ preOrder: serializePreOrder(result.preOrder), alreadyHandedOver: result.alreadyHandedOver });
            }
            default:
                return NextResponse.json({ message: "Aksi tidak dikenal." }, { status: 400 });
        }
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/pre-orders/[id]#PATCH", { id, action, adminId: admin.id });
    }
}
