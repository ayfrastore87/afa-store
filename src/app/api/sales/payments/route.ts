import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import {
    ConsignmentError,
    isConsignmentPaymentMethod,
    PAYMENT_STATUS_VALID,
    validatePaymentAmount,
} from "@/lib/consignment";

export const runtime = "nodejs";

// GET  /api/sales/payments — settlement history of the current sales person.
// POST /api/sales/payments — record a standalone settlement (outside a visit)
// for an assigned store. Amount is validated server-side (positive Int only).

const paymentSchema = z.object({
    storeId: z.string().trim().min(1, "Toko wajib dipilih."),
    amount: z.number(),
    method: z.string().trim(),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
});

export async function GET(request: Request) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 30, 1), 100);

    const payments = await prisma.storePayment.findMany({
        where: { salesId: current.sales.id },
        orderBy: { paymentDate: "desc" },
        take: limit,
        select: {
            id: true,
            amount: true,
            paymentMethod: true,
            paymentDate: true,
            reference: true,
            status: true,
            store: { select: { id: true, name: true } },
        },
    });

    return NextResponse.json({
        payments: payments.map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            paymentDate: payment.paymentDate,
            reference: payment.reference,
            status: payment.status,
            storeId: payment.store.id,
            storeName: payment.store.name,
        })),
    });
}

export async function POST(request: Request) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data pembayaran tidak valid." }, { status: 400 });
    }

    const { storeId, method, reference, notes } = parsed.data;

    if (!isConsignmentPaymentMethod(method)) {
        return NextResponse.json({ message: "Metode pembayaran tidak valid." }, { status: 400 });
    }

    let amount: number;
    try {
        amount = validatePaymentAmount(parsed.data.amount);
    } catch (error) {
        if (error instanceof ConsignmentError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        throw error;
    }

    // Ownership: the store must be actively assigned to this sales person.
    const store = await prisma.consignmentStore.findFirst({
        where: { id: storeId, isActive: true, assignedSalesId: current.sales.id },
        select: { id: true },
    });
    if (!store) return NextResponse.json({ message: "Toko tidak ditemukan atau bukan tugas Anda." }, { status: 404 });

    const payment = await prisma.storePayment.create({
        data: {
            storeId,
            salesId: current.sales.id,
            amount,
            paymentMethod: method,
            reference: reference || null,
            notes: notes || null,
            status: PAYMENT_STATUS_VALID,
        },
        select: { id: true, amount: true, paymentMethod: true, paymentDate: true },
    });

    return NextResponse.json({ payment }, { status: 201 });
}