import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/admin/customers/[id]
//
// Admin-only, READ-ONLY single-customer view (detail pelanggan). Aggregates
// profile, shopping summary, and a paginated order history from REAL customer
// orders only (PartnerSale is excluded — spend comes only from Order.total).
// No writes.
//
// Query params:
//   page   one-based order-history page (default 1)
//   limit  order-history page size (default 10, max 50)
// ---------------------------------------------------------------------------

const EXCLUDED_ORDER_STATUSES = ["CANCELLED", "CANCELED"];

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(1, parsed));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveInt(searchParams.get("limit"), 10, 50);

    const nonCancelled = { status: { notIn: EXCLUDED_ORDER_STATUSES } };

    try {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                isActive: true,
                image: true,
                createdAt: true,
                partner: {
                    select: {
                        id: true,
                        partnerCode: true,
                        partnerType: true,
                        status: true,
                        displayName: true,
                        businessName: true,
                        phone: true,
                        address: true,
                        village: true,
                        district: true,
                        city: true,
                        postalCode: true,
                        createdAt: true,
                    },
                },
                addresses: {
                    select: {
                        id: true,
                        recipientName: true,
                        phone: true,
                        province: true,
                        city: true,
                        district: true,
                        village: true,
                        detail: true,
                        isDefault: true,
                    },
                    orderBy: { isDefault: "desc" },
                    take: 3,
                },
            },
        });

        if (!user) return NextResponse.json({ message: "Pelanggan tidak ditemukan." }, { status: 404 });

        const [orderAgg, itemAgg, totalOrders, orderPage] = await Promise.all([
            prisma.order.aggregate({
                where: { userId: id, ...nonCancelled },
                _count: { _all: true },
                _sum: { total: true },
                _max: { createdAt: true },
            }),
            prisma.orderItem.aggregate({
                where: { order: { userId: id, ...nonCancelled } },
                _sum: { quantity: true },
            }),
            prisma.order.count({ where: { userId: id, ...nonCancelled } }),
            prisma.order.findMany({
                where: { userId: id, ...nonCancelled },
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    invoice: true,
                    source: true,
                    status: true,
                    paymentMethod: true,
                    total: true,
                    createdAt: true,
                    items: { select: { name: true, quantity: true, price: true } },
                },
            }),
        ]);

        return NextResponse.json({
            customer: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isActive: user.isActive,
                image: user.image,
                createdAt: user.createdAt,
                isPartner: Boolean(user.partner),
                partner: user.partner,
                addresses: user.addresses,
            },
            shopping: {
                orderCount: orderAgg._count._all,
                totalSpent: orderAgg._sum.total ?? 0,
                lastOrderAt: orderAgg._max.createdAt ?? null,
                itemCount: itemAgg._sum.quantity ?? 0,
            },
            orderHistory: {
                orders: orderPage.map((o) => ({
                    id: o.id,
                    invoice: o.invoice,
                    source: o.source,
                    status: o.status,
                    paymentMethod: o.paymentMethod,
                    total: o.total,
                    createdAt: o.createdAt,
                    items: o.items,
                })),
                page,
                limit,
                total: totalOrders,
                totalPages: Math.ceil(totalOrders / limit),
            },
        });
    } catch (error) {
        console.error("admin_customer_detail_failed", {
            category: "admin_customer_detail",
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ message: "Detail pelanggan gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
