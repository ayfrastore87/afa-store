import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { PAYMENT_STATUS_VALID, VISIT_STATUS_COMPLETED } from "@/lib/consignment";

export const runtime = "nodejs";

// GET   /api/admin/consignment/salespeople — operational list (not a ranking).
// POST  /api/admin/consignment/salespeople — create a sales account. Reuses
//        the cashier-account pattern: Supabase Auth user + public.users row
//        (role "sales") + SalesPerson profile, with rollback on failure.
// PATCH /api/admin/consignment/salespeople — toggle isActive (soft disable).

const createSchema = z.object({
    name: z.string().trim().min(1, "Nama wajib diisi.").max(120),
    email: z.string().trim().email("Email tidak valid.").transform((v) => v.toLowerCase()),
    password: z.string().min(8, "Password minimal 8 karakter.").max(128),
    phone: z.string().trim().max(30).optional(),
});

export async function GET() {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    try {
    const salespeople = await prisma.salesPerson.findMany({
        orderBy: { name: "asc" },
        select: {
            id: true,
            name: true,
            phone: true,
            isActive: true,
            createdAt: true,
            user: { select: { email: true } },
            _count: { select: { stores: { where: { isActive: true } } } },
        },
    });

    const [visitAgg, paymentAgg] = await Promise.all([
        prisma.salesVisit.groupBy({
            by: ["salesId"],
            where: { status: VISIT_STATUS_COMPLETED },
            _count: { id: true },
            _sum: { totalSold: true, salesAmount: true },
        }),
        prisma.storePayment.groupBy({
            by: ["salesId"],
            where: { status: PAYMENT_STATUS_VALID },
            _sum: { amount: true },
        }),
    ]);

    const visitMap = new Map(visitAgg.map((row) => [row.salesId, row]));
    const paymentMap = new Map(paymentAgg.map((row) => [row.salesId, row]));

    return NextResponse.json({
        salespeople: salespeople.map((sales) => ({
            id: sales.id,
            name: sales.name,
            phone: sales.phone,
            email: sales.user?.email ?? null,
            isActive: sales.isActive,
            createdAt: sales.createdAt,
            storeCount: sales._count.stores,
            visitCount: visitMap.get(sales.id)?._count.id ?? 0,
            totalSold: visitMap.get(sales.id)?._sum.totalSold ?? 0,
            totalSales: visitMap.get(sales.id)?._sum.salesAmount ?? 0,
            totalSettlement: paymentMap.get(sales.id)?._sum.amount ?? 0,
        })),
    });
    } catch (error) {
        console.error("consignment_query_failed", {
            route: "/api/admin/consignment/salespeople",
            code: error && typeof error === "object" && "code" in error ? error.code : undefined,
            category: error instanceof Error ? error.name : "unknown",
        });
        return NextResponse.json({ message: "Terjadi kesalahan server." }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data akun tidak valid." }, { status: 400 });
    }

    const { name, email, password, phone } = parsed.data;
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
        return NextResponse.json({ message: "Email sudah terdaftar." }, { status: 409 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (error || !data.user) return NextResponse.json({ message: "Akun Auth gagal dibuat." }, { status: 400 });

    try {
        const id = crypto.randomUUID();
        await prisma.$executeRaw`INSERT INTO public.users (id, auth_id, name, email, phone, role, "isActive", "createdAt", "updatedAt") VALUES (${id}, ${data.user.id}, ${name}, ${email}, ${phone || null}, ${"sales"}, ${true}, NOW(), NOW())`;
        const sales = await prisma.salesPerson.create({
            data: { userId: id, name, phone: phone || null },
            select: { id: true, name: true, phone: true, isActive: true, createdAt: true },
        });
        return NextResponse.json({ salesPerson: { ...sales, email } }, { status: 201 });
    } catch (error) {
        await supabase.auth.admin.deleteUser(data.user.id);
        if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
            return NextResponse.json({ message: "Email atau nomor WhatsApp sudah terdaftar." }, { status: 409 });
        }
        return NextResponse.json({ message: "Akun sales gagal dibuat." }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => null) as { id?: unknown; isActive?: unknown } | null;
    if (typeof body?.id !== "string" || typeof body.isActive !== "boolean") {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const existing = await prisma.salesPerson.findUnique({ where: { id: body.id }, select: { id: true, userId: true } });
    if (!existing) return NextResponse.json({ message: "Sales tidak ditemukan." }, { status: 404 });

    if (body.isActive === false) {
        const assigned = await prisma.consignmentStore.count({ where: { assignedSalesId: existing.id, isActive: true } });
        if (assigned > 0) {
            return NextResponse.json({ message: "Pindahkan toko aktif terlebih dahulu sebelum menonaktifkan sales." }, { status: 409 });
        }
    }

    const sales = await prisma.$transaction(async (tx) => {
        if (existing.userId) {
            await tx.user.update({ where: { id: existing.userId }, data: { isActive: body.isActive as boolean } });
        }
        return tx.salesPerson.update({
            where: { id: existing.id },
            data: { isActive: body.isActive as boolean },
            select: { id: true, name: true, isActive: true },
        });
    });

    return NextResponse.json({ salesPerson: sales });
}