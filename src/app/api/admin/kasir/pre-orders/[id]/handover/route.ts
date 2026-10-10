import { NextResponse } from "next/server";
import { getCurrentCashier } from "@/lib/server-auth";
import { handoverPreOrder, serializePreOrder } from "@/lib/pre-order";
import { isCuidLike, preOrderErrorResponse } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/admin/kasir/pre-orders/[id]/handover  (kasir + admin)
//
// Serah terima barang. Refused (402) unless the VERIFIED ledger covers the
// total; compare-and-set on status so a double click returns the same record
// with alreadyHandedOver=true instead of mutating twice.
// ---------------------------------------------------------------------------

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const cashier = await getCurrentCashier();
    if (!cashier) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    if (!isCuidLike(id)) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404 });
    try {
        const result = await handoverPreOrder(id, cashier.id);
        return NextResponse.json({ success: true, alreadyHandedOver: result.alreadyHandedOver, preOrder: serializePreOrder(result.preOrder) });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/kasir/pre-orders/[id]/handover#POST", { id, operatorId: cashier.id });
    }
}
