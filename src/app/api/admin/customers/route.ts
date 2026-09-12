import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { isPartnerStatus } from "@/lib/partner";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/admin/customers
//
// Admin-only, READ-ONLY, paginated customer directory (Pelanggan). It merges
// regular customers AND partners into a single list. Order metrics (orderCount,
// totalSpent, lastOrderAt) are computed from REAL customer orders only:
//   - orderCount   = number of non-cancelled Order rows for the user
//   - totalSpent   = sum of Order.total for non-cancelled orders
//   - lastOrderAt  = most recent non-cancelled Order.createdAt
//
// PartnerSale is NEVER counted toward customer spending — it is the B2B margin
// ledger and is deliberately excluded. Aggregations run in a single groupBy
// batch (no N+1). No writes of any kind.
//
// Query params:
//   q             search across name/email/phone
//   type          all | customer | partner
//   partnerStatus optional Partner.status filter (only applies alongside type)
//   page          one-based page number (default 1)
//   limit         page size (default 20, max 100)
// ---------------------------------------------------------------------------

// Cancelled orders contribute no spend and no completed order count.
const EXCLUDED_ORDER_STATUSES = ["CANCELLED", "CANCELED"];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(1, parsed));
}

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const typeParam = (searchParams.get("type") ?? "all").trim().toLowerCase();
    const partnerStatus = searchParams.get("partnerStatus");
    const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

    const type = typeParam === "customer" || typeParam === "partner" ? typeParam : "all";

    // User-level filters. role is free text ("customer" by default); a User is
    // classified as a "partner" iff a Partner row references it.
    const userWhere: Prisma.UserWhereInput = {
        ...(q
            ? {
                  OR: [
                      { name: { contains: q, mode: "insensitive" } },
                      { email: { contains: q, mode: "insensitive" } },
                      { phone: { contains: q, mode: "insensitive" } },
                  ],
              }
            : {}),
        ...(type === "customer"
            ? { partner: null }
            : type === "partner"
                ? { partner: { isNot: null } }
                : {}),
        ...(partnerStatus && isPartnerStatus(partnerStatus)
            ? { partner: { is: { status: partnerStatus } } }
            : {}),
    };

    const nonCancelledOrder: Prisma.OrderWhereInput = {
        status: { notIn: EXCLUDED_ORDER_STATUSES },
    };

    try {
        const [total, users, orderAgg, totalPartners] = await Promise.all([
            prisma.user.count({ where: userWhere }),
            prisma.user.findMany({
                where: userWhere,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    partner: {
                        select: {
                            id: true,
                            partnerCode: true,
                            partnerType: true,
                            status: true,
                            displayName: true,
                            businessName: true,
                        },
                    },
                },
            }),

            // One groupBy batch produces every user's order metrics keyed by
            // userId (no N+1). This covers the full filtered universe, not just
            // the current page.
            prisma.order.groupBy({
                by: ["userId"],
                where: { ...nonCancelledOrder, userId: { not: null } },
                _count: { _all: true },
                _sum: { total: true },
                _max: { createdAt: true },
            }),

            // Partner count across the full filtered universe for stat cards.
            prisma.partner.count({
                where: {
                    ...(q
                        ? {
                              OR: [
                                  { displayName: { contains: q, mode: "insensitive" } },
                                  { businessName: { contains: q, mode: "insensitive" } },
                                  { partnerCode: { contains: q, mode: "insensitive" } },
                                  { user: { name: { contains: q, mode: "insensitive" } } },
                                  { user: { email: { contains: q, mode: "insensitive" } } },
                                  { user: { phone: { contains: q, mode: "insensitive" } } },
                              ],
                          }
                        : {}),
                    ...(partnerStatus && isPartnerStatus(partnerStatus) ? { status: partnerStatus } : {}),
                },
            }),
        ]);

        const orderAggByUser = new Map<string, { count: number; total: number; lastOrderAt: Date | null }>();
        for (const row of orderAgg) {
            if (!row.userId) continue;
            orderAggByUser.set(row.userId, {
                count: row._count._all,
                total: row._sum.total ?? 0,
                lastOrderAt: row._max.createdAt ?? null,
            });
        }

        const customers = users.map((u) => {
            const agg = orderAggByUser.get(u.id);
            const partnerRow = u.partner;
            return {
                id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                role: u.role,
                isActive: u.isActive,
                createdAt: u.createdAt,
                isPartner: Boolean(partnerRow),
                partner: partnerRow
                    ? {
                          id: partnerRow.id,
                          partnerCode: partnerRow.partnerCode,
                          partnerType: partnerRow.partnerType,
                          status: partnerRow.status,
                          displayName: partnerRow.displayName,
                          businessName: partnerRow.businessName,
                      }
                    : null,
                orderCount: agg?.count ?? 0,
                totalSpent: agg?.total ?? 0,
                lastOrderAt: agg?.lastOrderAt ?? null,
            };
        });

        return NextResponse.json({
            customers,
            summary: {
                total,
                partners: totalPartners,
                customers: total - totalPartners,
            },
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error("admin_customers_failed", {
            category: "admin_customers",
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ message: "Data pelanggan gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}
