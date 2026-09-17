import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { normalizeKasirDeliveryStatus } from "@/lib/kasir-delivery";

export const runtime = "nodejs";

type MonitoringSummary = { 
    totalActive: number; 
    perluDiproses: number; 
    dalamPengiriman: number; 
    perluPerhatian: number; 
};

type MonitoringOrder = {
    id: string; 
    invoice: string; 
    customer: string; 
    phone: string; 
    address: string;
    courier: string | null; 
    service: string | null; 
    trackingNumber: string | null;
    biteshipStatus: string | null; 
    shipping: number; 
    total: number; 
    status: string;
    createdAt: Date; 
    updatedAt: Date; 
    normalizedKey: string; 
    normalizedLabel: string;
};

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const filter = (searchParams.get("filter") ?? "ALL").trim().toUpperCase();
    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 20) || 20));

    const deliveryWhere: Prisma.OrderWhereInput = {
        AND: [
            { source: { in: ["TATAP_MUKA", "WHATSAPP"] } },
            { OR: [
                { address: { not: "" } },
                { courier: { not: null } },
                { service: { not: null } },
                { destinationAreaId: { not: null } }
            ]}
        ],
    };

    let statusFilter: Prisma.OrderWhereInput | undefined;
    switch (filter) {
        case "SEMUA": case "ALL": statusFilter = undefined; break;
        case "PERLU_DIPROSES": statusFilter = { biteshipOrderId: null }; break;
        case "DALAM_PENGIRIMAN":
            statusFilter = { OR: [
                { biteshipStatus: { contains: "in_transit", mode: "insensitive" } },
                { biteshipStatus: { contains: "dropping_off", mode: "insensitive" } },
                { biteshipStatus: { contains: "intransit", mode: "insensitive" } },
                { biteshipStatus: { contains: "droppingoff", mode: "insensitive" } }
            ]}; break;
        case "SELESAI": statusFilter = { biteshipStatus: { contains: "delivered", mode: "insensitive" } }; break;
        case "PERLU_PERHATIAN":
            statusFilter = { OR: [
                { biteshipStatus: { contains: "cancelled", mode: "insensitive" } },
                { biteshipStatus: { contains: "canceled", mode: "insensitive" } },
                { biteshipStatus: { contains: "rejected", mode: "insensitive" } },
                { biteshipStatus: { contains: "returned", mode: "insensitive" } },
                { biteshipStatus: { contains: "on_hold", mode: "insensitive" } },
                { biteshipStatus: { contains: "courier_not_found", mode: "insensitive" } },
                { biteshipStatus: { contains: "disposed", mode: "insensitive" } }
            ]}; break;
        default: statusFilter = undefined;
    }

    const combinedWhere: Prisma.OrderWhereInput = statusFilter ? { AND: [deliveryWhere, statusFilter] } : deliveryWhere;
    let finalWhere: Prisma.OrderWhereInput = combinedWhere;
    
    if (q) {
        finalWhere = {
            AND: [
                combinedWhere,
                { OR: [
                    { customer: { contains: q, mode: "insensitive" } },
                    { phone: { contains: q, mode: "insensitive" } },
                    { trackingNumber: { contains: q, mode: "insensitive" } }
                ]}
            ]
        };
    }

    const [total, allDeliveryCount] = await Promise.all([
        prisma.order.count({ where: finalWhere }),
        prisma.order.count({ where: deliveryWhere })
    ]);

    const orders = await prisma.order.findMany({
        where: finalWhere,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
            id: true, invoice: true, customer: true, phone: true, address: true,
            courier: true, service: true, trackingNumber: true, biteshipStatus: true,
            shipping: true, total: true, status: true, createdAt: true, updatedAt: true,
            biteshipOrderId: true
        }
    });

    const monitoredOrders: MonitoringOrder[] = orders.map((order) => {
        const hasShipment = order.biteshipOrderId ? order.biteshipOrderId.length > 0 && !order.biteshipOrderId.startsWith("biteship-") : false;
        const normalized = normalizeKasirDeliveryStatus({ biteshipStatus: order.biteshipStatus, hasShipment });
        
        return {
            id: order.id, 
            invoice: order.invoice, 
            customer: order.customer, 
            phone: order.phone,
            address: order.address || "", 
            courier: order.courier || null, 
            service: order.service || null,
            trackingNumber: order.trackingNumber || null, 
            biteshipStatus: order.biteshipStatus,
            shipping: order.shipping || 0, 
            total: order.total, 
            status: order.status,
            createdAt: order.createdAt, 
            updatedAt: order.updatedAt,
            normalizedKey: normalized.key, 
            normalizedLabel: normalized.label
        };
    });

    const summary: MonitoringSummary = {
        totalActive: allDeliveryCount,
        perluDiproses: await prisma.order.count({ 
            where: { 
                source: { in: ["TATAP_MUKA", "WHATSAPP"] }, 
                AND: [{ OR: [{ address: { not: "" } }, { courier: { not: null } }, { service: { not: null } }, { destinationAreaId: { not: null } }] }, { biteshipOrderId: null }] 
            } 
        }),
        dalamPengiriman: await prisma.order.count({ 
            where: { 
                source: { in: ["TATAP_MUKA", "WHATSAPP"] }, 
                AND: [{ OR: [{ address: { not: "" } }, { courier: { not: null } }, { service: { not: null } }, { destinationAreaId: { not: null } }] }, { OR: [{ biteshipStatus: { contains: "in_transit", mode: "insensitive" } }, { biteshipStatus: { contains: "dropping_off", mode: "insensitive" } }, { biteshipStatus: { contains: "intransit", mode: "insensitive" } }, { biteshipStatus: { contains: "droppingoff", mode: "insensitive" } }] }] 
            } 
        }),
        perluPerhatian: await prisma.order.count({ 
            where: { 
                source: { in: ["TATAP_MUKA", "WHATSAPP"] }, 
                AND: [{ OR: [{ address: { not: "" } }, { courier: { not: null } }, { service: { not: null } }, { destinationAreaId: { not: null } }] }, { OR: [{ biteshipStatus: { contains: "cancelled", mode: "insensitive" } }, { biteshipStatus: { contains: "canceled", mode: "insensitive" } }, { biteshipStatus: { contains: "rejected", mode: "insensitive" } }, { biteshipStatus: { contains: "returned", mode: "insensitive" } }, { biteshipStatus: { contains: "on_hold", mode: "insensitive" } }, { biteshipStatus: { contains: "courier_not_found", mode: "insensitive" } }, { biteshipStatus: { contains: "disposed", mode: "insensitive" } }] }] 
            } 
        })
    };

    return NextResponse.json({ 
        summary, 
        orders: monitoredOrders,
        page, 
        limit, 
        total, 
        totalPages: Math.ceil(total / limit) 
    });
}
