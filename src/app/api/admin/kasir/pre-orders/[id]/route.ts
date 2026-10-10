import { NextResponse } from "next/server";
import { getCurrentCashier } from "@/lib/server-auth";
import { getPreOrder, serializePreOrder, transitionPreOrderStatus } from "@/lib/pre-order";
import { isPreOrderStatus } from "@/lib/pre-order-core";
import { isCuidLike, preOrderErrorResponse, readJsonBody } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// /api/admin/kasir/pre-orders/[id]  (kasir + admin)
// GET   : detail with full ledger + derived summary.
// PATCH : { status } -> CONFIRMED / READY_FOR_PICKUP / CANCELLED only.
//         HANDED_OVER must go through /handover (requires LUNAS).
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const cashier = await getCurrentCashier();
    if (!cashier) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    if (!isCuidLike(id)) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404 });
    try {
        const po = await getPreOrder(id);
        if (!po) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404 });
        return NextResponse.json({ preOrder: serializePreOrder(po) });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/kasir/pre-orders/[id]#GET", { id });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const cashier = await getCurrentCashier();
    if (!cashier) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    if (!isCuidLike(id)) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404 });
    const body = await readJsonBody(request);
    const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
    if (!isPreOrderStatus(status)) return NextResponse.json({ message: "Status tidak valid." }, { status: 400 });
    try {
        const po = await transitionPreOrderStatus(id, status, cashier.id);
        return NextResponse.json({ preOrder: serializePreOrder(po) });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/kasir/pre-orders/[id]#PATCH", { id, status });
    }
}
