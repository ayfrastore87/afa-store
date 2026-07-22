import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CHECKOUT_COOKIE, SHIPPING_COST, checkoutSubtotal, decodeCheckoutItems } from "@/lib/checkout";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

type CheckoutAddress = {
    recipientName?: string;
    phone?: string;
    address?: string;
    province?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    paymentMethod?: string;
};

const paymentMethods = ["QRIS", "TRANSFER_BANK", "COD"] as const;

function invoiceNumber() {
    return `AFA-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function requireText(value: string | undefined) {
    return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ redirectTo: "/login" }, { status: 401 });

    const store = await cookies();
    const items = decodeCheckoutItems(store.get(CHECKOUT_COOKIE)?.value);
    if (!items.length) return NextResponse.json({ message: "Checkout kosong." }, { status: 400 });

    const address = (await request.json()) as CheckoutAddress;
    if (![address.recipientName, address.phone, address.address, address.province, address.city, address.district, address.postalCode].every(requireText)) {
        return NextResponse.json({ message: "Lengkapi alamat pengiriman." }, { status: 400 });
    }

    const subtotal = checkoutSubtotal(items);
    const shipping = SHIPPING_COST;
    const total = subtotal + shipping;
    const fullAddress = `${address.address}, ${address.district}, ${address.city}, ${address.province} ${address.postalCode}`;
    const now = new Date();
    const paymentMethod = paymentMethods.includes(String(address.paymentMethod).toUpperCase() as (typeof paymentMethods)[number]) ? String(address.paymentMethod).toUpperCase() : "QRIS";

    const order = await prisma.order.create({
        data: {
            userId: user.id,
            invoice: invoiceNumber(),
            customer: address.recipientName!.trim(),
            phone: address.phone!.trim(),
            address: fullAddress,
            subtotal,
            shipping,
            discount: 0,
            total,
            status: "PENDING",
            paymentMethod,
            paymentStatus: paymentMethod === "COD" ? "WAITING_CONFIRMATION" : "WAITING_PAYMENT",
            paymentProof: null,
            paidAt: null,
            processedAt: null,
            packedAt: null,
            shippedAt: null,
            completedAt: null,
            cancelledAt: null,
            items: {
                create: items.map((item) => ({
                    name: item.name,
                    quantity: item.qty,
                    price: item.price,
                    subtotal: item.price * item.qty,
                })),
            },
        },
        select: { id: true, invoice: true },
    });

    await prisma.checkoutHistory.create({
        data: {
            userId: user.id,
            orderId: order.id,
            channel: "checkout",
            items,
            subtotal,
            shipping,
            discount: 0,
            total,
            city: address.city?.trim() || null,
            message: `Order ${order.invoice} dibuat pada ${now.toISOString()}`,
        },
    });

    const response = NextResponse.json({ redirectTo: `/payment/${order.invoice}` }, { status: 201 });
    response.cookies.set(CHECKOUT_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
}
