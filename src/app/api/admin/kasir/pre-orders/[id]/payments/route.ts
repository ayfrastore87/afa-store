import { NextResponse } from "next/server";
import { getCurrentCashier } from "@/lib/server-auth";
import { recordPreOrderPayment, serializePreOrder, serializePreOrderPayment } from "@/lib/pre-order";
import { getQrisProvider } from "@/lib/qris-config";
import { isCuidLike, preOrderErrorResponse, readJsonBody } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/admin/kasir/pre-orders/[id]/payments  (kasir + admin)
//
// Records ONE payment (DP / cicilan / pelunasan — the kind is decided by the
// server). Body: { amount, method: "TUNAI"|"QRIS"|"TRANSFER_BANK",
// cashReceived?, note?, idempotencyKey? }.
//
//   TUNAI          -> VERIFIED immediately (kasir holds the cash).
//   QRIS MANUAL    -> PENDING; kasir confirms via /payments/[paymentId]/confirm
//   QRIS MIDTRANS  -> PENDING + Midtrans charge; verified by the webhook.
//   TRANSFER_BANK  -> PENDING; confirmed manually.
//
// Overpayment, double submit (idempotencyKey) and concurrent settlement are all
// rejected inside recordPreOrderPayment under a PO advisory lock.
// ---------------------------------------------------------------------------

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const cashier = await getCurrentCashier();
    if (!cashier) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    if (!isCuidLike(id)) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404 });
    const body = await readJsonBody(request);

    try {
        const result = await recordPreOrderPayment({
            preOrderId: id,
            amount: body.amount,
            method: body.method,
            cashReceived: body.cashReceived,
            note: body.note,
            idempotencyKey: body.idempotencyKey,
            operatorId: cashier.id,
            verifyImmediately: true,
        });
        return NextResponse.json(
            {
                preOrder: serializePreOrder(result.preOrder),
                payment: serializePreOrderPayment(result.payment),
                replayed: result.replayed,
                qrisProvider: result.payment.method === "QRIS" ? getQrisProvider() : null,
            },
            { status: result.replayed ? 200 : 201 },
        );
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/kasir/pre-orders/[id]/payments#POST", { id, operatorId: cashier.id });
    }
}
