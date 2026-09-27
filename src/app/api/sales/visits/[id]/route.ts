import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import { PAYMENT_STATUS_VALID } from "@/lib/consignment";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const visit = await prisma.salesVisit.findFirst({
        where: { id, salesId: current.sales.id },
        select: {
            id: true, visitedAt: true, latitude: true, longitude: true, locationAccuracy: true,
            locationCapturedAt: true, photoUrl: true, notes: true, salesAmount: true,
            store: { select: { id: true, name: true, address: true } },
            items: { select: { productName: true, openingStock: true, quantitySupplied: true, quantitySold: true, quantityReturned: true, quantityDamaged: true, closingStock: true, unitPrice: true, salesAmount: true } },
            payments: { where: { status: PAYMENT_STATUS_VALID }, select: { amount: true, paymentMethod: true, reference: true, notes: true } },
        },
    });
    if (!visit) return NextResponse.json({ message: "Kunjungan tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ visit });
}