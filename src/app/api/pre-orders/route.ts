import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";
import { createPreOrder, serializePreOrder } from "@/lib/pre-order";
import { preOrderErrorResponse, readJsonBody } from "@/lib/pre-order-route";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// /api/pre-orders  (website customer — login required, like the online checkout)
//
// POST : customer submits a pre-order from the catalog. Items must reference
//        active products (prices are resolved server-side, never trusted).
//        The PO starts as DRAFT; admin confirms it and payment (DP / pelunasan)
//        is then taken at the kasir or via admin. No Order/Payment rows are
//        created and nothing is charged here.
// GET  : the customer's own pre-orders (by userId or phone on file).
// ---------------------------------------------------------------------------

const MAX_OPEN_DRAFTS_PER_USER = 5;

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ redirectTo: "/login", message: "Silakan login untuk mengajukan pre-order." }, { status: 401 });
    const body = await readJsonBody(request);

    try {
        const openDrafts = await prisma.preOrder.count({ where: { userId: user.id, status: "DRAFT", deletedAt: null } });
        if (openDrafts >= MAX_OPEN_DRAFTS_PER_USER) {
            return NextResponse.json({ message: "Anda masih memiliki pre-order yang menunggu konfirmasi. Hubungi admin untuk melanjutkan." }, { status: 429 });
        }
        const po = await createPreOrder({
            customer: body.customer ?? user.name,
            phone: body.phone ?? user.phone,
            note: body.note,
            pickupDate: body.pickupDate,
            items: body.items,
            source: "WEBSITE",
            userId: user.id,
            initialStatus: "DRAFT",
        });
        return NextResponse.json({ preOrder: serializePreOrder(po) }, { status: 201 });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/pre-orders#POST", { userId: user.id });
    }
}

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ redirectTo: "/login" }, { status: 401 });
    try {
        const rows = await prisma.preOrder.findMany({
            where: { userId: user.id, deletedAt: null },
            include: { items: { orderBy: { id: "asc" } }, payments: { orderBy: { sequence: "asc" } } },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        // Customer view: hide operator-only fields (qris raw response etc. are not serialized anyway).
        return NextResponse.json({ preOrders: rows.map(serializePreOrder) });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/pre-orders#GET", { userId: user.id });
    }
}
