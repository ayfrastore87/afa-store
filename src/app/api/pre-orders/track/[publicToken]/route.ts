import { NextResponse } from "next/server";
import { getPreOrderByPublicToken, serializePublicPreOrder } from "@/lib/pre-order";
import { preOrderErrorResponse } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/pre-orders/track/[publicToken]  (public, no login)
// Read-only status view keyed by the unguessable token issued at submission.
// Never exposes internal ids, operator fields or pending/raw ledger data.
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ publicToken: string }> }) {
    const { publicToken } = await params;
    try {
        const po = await getPreOrderByPublicToken(publicToken);
        if (!po) return NextResponse.json({ message: "Pre-order tidak ditemukan." }, { status: 404, headers: { "Cache-Control": "no-store" } });
        return NextResponse.json({ preOrder: serializePublicPreOrder(po) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/pre-orders/track/[publicToken]#GET");
    }
}
