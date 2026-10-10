import { NextResponse } from "next/server";
import { getCurrentCashier } from "@/lib/server-auth";
import { cancelPreOrderPayment, serializePreOrder, serializePreOrderPayment, verifyPreOrderPayment } from "@/lib/pre-order";
import { getQrisProvider, QrisProvider } from "@/lib/qris-config";
import { isCuidLike, preOrderErrorResponse, readJsonBody } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// /api/admin/kasir/pre-orders/[id]/payments/[paymentId]/confirm
//
// POST   : manually verify a PENDING row (QRIS MANUAL / transfer). Mirrors the
//          existing confirm-qris-payment route: compare-and-set on PENDING, so
//          browser retries are harmless; Midtrans-managed rows are refused.
// DELETE : cancel a PENDING row (never touches VERIFIED money).
// ---------------------------------------------------------------------------

type Params = { params: Promise<{ id: string; paymentId: string }> };

export async function POST(_request: Request, { params }: Params) {
    const cashier = await getCurrentCashier();
    if (!cashier) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id, paymentId } = await params;
    if (!isCuidLike(id) || !isCuidLike(paymentId)) return NextResponse.json({ message: "Pembayaran tidak ditemukan." }, { status: 404 });

    try {
        const result = await verifyPreOrderPayment(id, paymentId, cashier.id);
        if (result.payment.method === "QRIS" && getQrisProvider() !== QrisProvider.MANUAL && !result.alreadyVerified) {
            // Defensive: verifyPreOrderPayment already refuses Midtrans-managed rows.
            console.warn("pre_order_manual_qris_confirm_under_midtrans", { id, paymentId });
        }
        return NextResponse.json({
            success: true,
            alreadyVerified: result.alreadyVerified,
            preOrder: serializePreOrder(result.preOrder),
            payment: serializePreOrderPayment(result.payment),
        });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/kasir/pre-orders/[id]/payments/[paymentId]/confirm#POST", { id, paymentId });
    }
}

export async function DELETE(request: Request, { params }: Params) {
    const cashier = await getCurrentCashier();
    if (!cashier) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id, paymentId } = await params;
    if (!isCuidLike(id) || !isCuidLike(paymentId)) return NextResponse.json({ message: "Pembayaran tidak ditemukan." }, { status: 404 });
    const body = await readJsonBody(request);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
    try {
        const po = await cancelPreOrderPayment(id, paymentId, cashier.id, reason || "Dibatalkan kasir");
        return NextResponse.json({ success: true, preOrder: serializePreOrder(po) });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/kasir/pre-orders/[id]/payments/[paymentId]/confirm#DELETE", { id, paymentId });
    }
}
