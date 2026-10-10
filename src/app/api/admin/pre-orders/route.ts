import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/server-auth";
import { createPreOrder, listPreOrders, serializePreOrder, type PreOrderListFilter } from "@/lib/pre-order";
import { preOrderErrorResponse, readJsonBody } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// /api/admin/pre-orders  (admin only)
// GET  : list/search (same engine as kasir, admin can also see DRAFT website POs)
// POST : manual PO entry by admin (source ADMIN_MANUAL, status CONFIRMED).
// ---------------------------------------------------------------------------

const FILTERS: PreOrderListFilter[] = ["all", "unpaid", "ready", "today_pickup", "handed_over", "draft"];

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim().slice(0, 80);
    const filter = (searchParams.get("filter") ?? "all").trim().toLowerCase() as PreOrderListFilter;
    if (!FILTERS.includes(filter)) return NextResponse.json({ message: "Filter tidak valid." }, { status: 400 });
    const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10) || 50;
    try {
        const rows = await listPreOrders({ q, filter, limit });
        return NextResponse.json({ preOrders: rows.map(serializePreOrder) });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/pre-orders#GET");
    }
}

export async function POST(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const body = await readJsonBody(request);
    try {
        const po = await createPreOrder({
            customer: body.customer,
            phone: body.phone,
            note: body.note,
            pickupDate: body.pickupDate,
            discount: body.discount,
            items: body.items,
            source: "ADMIN_MANUAL",
            createdById: admin.id,
        });
        return NextResponse.json({ preOrder: serializePreOrder(po) }, { status: 201 });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/pre-orders#POST", { adminId: admin.id });
    }
}
