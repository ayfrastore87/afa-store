import { NextResponse } from "next/server";
import { getCurrentCashier } from "@/lib/server-auth";
import { createPreOrder, listPreOrders, serializePreOrder, type PreOrderListFilter } from "@/lib/pre-order";
import { preOrderErrorResponse, readJsonBody } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// /api/admin/kasir/pre-orders  (kasir + admin)
//
// GET  : search PO by nomor / nama / HP, with status filter. Reads only the
//        pre_orders tables — never mixes with Order / Payment.
// POST : create a PO from the kasir (source = KASIR, status CONFIRMED). Totals
//        are computed server-side; catalog prices come from the DB.
// ---------------------------------------------------------------------------

const FILTERS: PreOrderListFilter[] = ["all", "unpaid", "ready", "today_pickup", "handed_over", "draft"];

export async function GET(request: Request) {
    const cashier = await getCurrentCashier();
    if (!cashier) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim().slice(0, 80);
    const filterParam = (searchParams.get("filter") ?? "all").trim().toLowerCase() as PreOrderListFilter;
    if (!FILTERS.includes(filterParam)) return NextResponse.json({ message: "Filter tidak valid." }, { status: 400 });
    const limit = Number.parseInt(searchParams.get("limit") ?? "30", 10) || 30;

    try {
        const rows = await listPreOrders({ q, filter: filterParam, limit });
        return NextResponse.json({ preOrders: rows.map(serializePreOrder) });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/kasir/pre-orders#GET");
    }
}

export async function POST(request: Request) {
    const cashier = await getCurrentCashier();
    if (!cashier) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = await readJsonBody(request);
    try {
        const po = await createPreOrder({
            customer: body.customer,
            phone: body.phone,
            note: body.note,
            pickupDate: body.pickupDate,
            discount: body.discount,
            items: body.items,
            source: "KASIR",
            createdById: cashier.id,
        });
        return NextResponse.json({ preOrder: serializePreOrder(po) }, { status: 201 });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/admin/kasir/pre-orders#POST", { operatorId: cashier.id });
    }
}
