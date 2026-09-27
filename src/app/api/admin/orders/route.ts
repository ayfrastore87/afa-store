 import { NextRequest, NextResponse } from "next/server";
 import { Prisma } from "@prisma/client";
 import { prisma } from "@/lib/prisma";
 import { getCurrentAdmin } from "@/lib/server-auth";

 export const runtime = "nodejs";

 // ---------------------------------------------------------------------------
 // GET /api/admin/orders
 //
 // Admin-only, paginated order list with filtering and search.
 // Query parameters:
 //   - page: 1-based page number (default 1)
 //   - limit: items per page (default 20, max 100)
 //   - search: search by invoice, customer name, or phone
 //   - source: filter by Order.source (ONLINE, TATAP_MUKA, WHATSAPP, etc.)
 //   - status: filter by Order.status
 //   - paymentStatus: filter by Order.paymentStatus
 //
 // Returns paginated results with total count.
 // ---------------------------------------------------------------------------

 const DEFAULT_LIMIT = 20;
 const MAX_LIMIT = 100;

 function validatePageLimit(
     page: unknown,
     limit: unknown
 ): { page: number; limit: number } | null {
     const p = typeof page === "string" ? parseInt(page, 10) : 1;
     const l = typeof limit === "string" ? parseInt(limit, 10) : DEFAULT_LIMIT;

     if (!Number.isInteger(p) || p < 1) return null;
     if (!Number.isInteger(l) || l < 1 || l > MAX_LIMIT) return null;

     return { page: p, limit: l };
 }

 function buildOrderWhereClause(
     search?: string,
     source?: string,
     status?: string,
     paymentStatus?: string
 ): Prisma.OrderWhereInput {
     const where: Prisma.OrderWhereInput = {};

     if (search && search.trim()) {
         const q = search.trim();
         where.OR = [
             { invoice: { contains: q, mode: "insensitive" } },
             { customer: { contains: q, mode: "insensitive" } },
             { phone: { contains: q, mode: "insensitive" } },
         ];
     }

     if (source && source.trim()) {
         where.source = source.toUpperCase();
     }

     if (status && status.trim()) {
         where.status = status.toUpperCase();
     }

     if (paymentStatus && paymentStatus.trim()) {
         where.paymentStatus = paymentStatus.toUpperCase();
     }

     return where;
 }

 export async function GET(request: NextRequest) {
     const admin = await getCurrentAdmin();
     if (!admin) {
         return NextResponse.json({ message: "Forbidden" }, { status: 403 });
     }

     try {
         const url = new URL(request.url);
         const pageParam = url.searchParams.get("page");
         const limitParam = url.searchParams.get("limit");
        const search = url.searchParams.get("search") ?? undefined;
        const source = url.searchParams.get("source") ?? undefined;
        const status = url.searchParams.get("status") ?? undefined;
        const paymentStatus = url.searchParams.get("paymentStatus") ?? undefined;

         const validated = validatePageLimit(pageParam, limitParam);
         if (!validated) {
             return NextResponse.json(
                 { message: "Invalid pagination parameters" },
                 { status: 400 }
             );
         }

         const { page, limit } = validated;
         const skip = (page - 1) * limit;

         const where = buildOrderWhereClause(search, source, status, paymentStatus);

         const [orders, totalCount] = await Promise.all([
             prisma.order.findMany({
                 where,
                 select: {
                     id: true,
                     invoice: true,
                     customer: true,
                     phone: true,
                     source: true,
                     status: true,
                     paymentStatus: true,
                     total: true,
                     createdAt: true,
                     payment: {
                         select: { status: true },
                     },
                 },
                 orderBy: { createdAt: "desc" },
                 skip,
                 take: limit,
             }),
             prisma.order.count({ where }),
         ]);

         return NextResponse.json({
             orders,
             pagination: {
                 page,
                 limit,
                 total: totalCount,
                 pages: Math.ceil(totalCount / limit),
             },
         });
     } catch (error) {
         console.error("Admin orders list error:", error);
         return NextResponse.json(
             { message: "Internal server error" },
             { status: 500 }
         );
     }
 }