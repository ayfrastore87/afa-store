 import { NextResponse } from "next/server";
 import { prisma } from "@/lib/prisma";
 import { getCurrentAdmin } from "@/lib/server-auth";

 export const runtime = "nodejs";

 // ---------------------------------------------------------------------------
 // GET /api/admin/orders/[id]
 //
 // Admin-only, returns full order detail with items.
 // ---------------------------------------------------------------------------

 export async function GET(
     _request: Request,
     { params }: { params: Promise<{ id: string }> }
 ) {
     const admin = await getCurrentAdmin();
     if (!admin) {
         return NextResponse.json({ message: "Forbidden" }, { status: 403 });
     }

     try {
         const { id } = await params;

         const order = await prisma.order.findUnique({
             where: { id },
             include: {
                 items: true,
                 payment: {
                     select: {
                         status: true,
                         method: true,
                     },
                 },
             },
         });

         if (!order) {
             return NextResponse.json(
                 { message: "Pesanan tidak ditemukan" },
                 { status: 404 }
             );
         }

         return NextResponse.json({
             order: {
                 id: order.id,
                 invoice: order.invoice,
                 customer: order.customer,
                 phone: order.phone,
                 address: order.address,
                 note: order.note,
                 source: order.source,
                 status: order.status,
                 paymentStatus: order.paymentStatus,
                 paymentMethod: order.paymentMethod,
                 subtotal: order.subtotal,
                 discount: order.discount,
                 shipping: order.shipping,
                 total: order.total,
                 createdAt: order.createdAt,
                 items: order.items.map((item) => ({
                     id: item.id,
                     name: item.name,
                     description: item.description,
                     notes: item.notes,
                     itemType: item.itemType,
                     quantity: item.quantity,
                     price: item.price,
                     unitPrice: item.unitPrice,
                     subtotal: item.subtotal,
                 })),
                 courier: order.courier,
                 serviceCode: order.serviceCode,
                 trackingNumber: order.trackingNumber,
                 biteshipStatus: order.biteshipStatus,
                 biteshipTrackingId: order.biteshipTrackingId,
             },
         });
     } catch (error) {
         console.error("Get order detail error:", error);
         return NextResponse.json(
             { message: "Internal server error" },
             { status: 500 }
         );
     }
 }