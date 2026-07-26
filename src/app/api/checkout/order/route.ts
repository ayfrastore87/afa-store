import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { CHECKOUT_COOKIE, SHIPPING_COST, checkoutSubtotal, decodeCheckoutItems } from "@/lib/checkout";
import { prisma } from "@/lib/prisma";
import { formatOrderInvoice, getInvoicePrefix } from "@/lib/orders";
import { createMidtransQrisCharge, getQrisActionUrl } from "@/lib/midtrans";
import { isPaymentMethod } from "@/lib/payments";
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

function requireText(value: string | undefined) {
    return typeof value === "string" && value.trim().length > 0;
}

function getSupabaseServerClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase environment belum lengkap.");
    return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ redirectTo: "/login" }, { status: 401 });

        const store = await cookies();
        const items = decodeCheckoutItems(store.get(CHECKOUT_COOKIE)?.value);
        if (!items.length) return NextResponse.json({ message: "Checkout kosong." }, { status: 400 });

        let address: CheckoutAddress;
        try {
            address = (await request.json()) as CheckoutAddress;
        } catch {
            return NextResponse.json({ message: "Payload checkout tidak valid." }, { status: 400 });
        }
        if (![address.recipientName, address.phone, address.address, address.province, address.city, address.district, address.postalCode].every(requireText)) {
            return NextResponse.json({ message: "Lengkapi alamat pengiriman." }, { status: 400 });
        }

        const subtotal = checkoutSubtotal(items);
        const shipping = SHIPPING_COST;
        const total = subtotal + shipping;
        const fullAddress = `${address.address}, ${address.district}, ${address.city}, ${address.province} ${address.postalCode}`;
        const now = new Date();
        const paymentMethod = paymentMethods.includes(String(address.paymentMethod).toUpperCase() as (typeof paymentMethods)[number]) ? String(address.paymentMethod).toUpperCase() : "QRIS";
        const todayPrefix = getInvoicePrefix(now);
        const todayCount = await prisma.order.count({ where: { invoice: { startsWith: todayPrefix } } });

        const order = await prisma.order.create({
            data: {
                userId: user.id,
                invoice: formatOrderInvoice(now, todayCount + 1),
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
            include: { items: true, user: true },
        });

        const normalizedMethod = isPaymentMethod(paymentMethod) ? paymentMethod : "QRIS";
        const paymentStatus = paymentMethod === "COD" ? "PENDING" : "PENDING";
        const defaultExpiredAt = new Date(Date.now() + 60 * 60 * 1000);

        let qrisUrl: string | null = null;
        let expiredAt = defaultExpiredAt;
        let transactionId: string | null = null;
        let transactionRef: string | null = null;
        let paymentType: string | null = null;
        let rawResponse: Prisma.InputJsonValue | null = null;

        if (normalizedMethod === "QRIS") {
            const midtrans = await createMidtransQrisCharge({
                invoice: order.invoice,
                amount: total,
                customer: { name: order.customer, email: order.user?.email, phone: order.phone },
                items: [
                    ...order.items.map((item) => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
                    { id: "shipping", name: "Ongkir", price: shipping, quantity: 1 },
                ],
                expiryMinutes: 60,
            });
            qrisUrl = getQrisActionUrl(midtrans);
            expiredAt = midtrans.expiry_time ? new Date(midtrans.expiry_time.replace(" ", "T")) : defaultExpiredAt;
            transactionId = midtrans.transaction_id ?? null;
            transactionRef = midtrans.order_id ?? order.invoice;
            paymentType = midtrans.payment_type ?? "qris";
            rawResponse = midtrans as Prisma.InputJsonValue;
        }

        await prisma.payment.upsert({
            where: { orderId: order.id },
            create: {
                orderId: order.id,
                method: normalizedMethod,
                amount: total,
                status: paymentStatus,
                transactionId,
                transactionRef,
                paymentType,
                qrisUrl,
                rawResponse: rawResponse ?? Prisma.JsonNull,
                expiredAt,
                paidAt: null,
            },
            update: {
                method: normalizedMethod,
                amount: total,
                status: paymentStatus,
                transactionId,
                transactionRef,
                paymentType,
                qrisUrl,
                rawResponse: rawResponse ?? Prisma.JsonNull,
                expiredAt,
            },
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

        const clearCart = await getSupabaseServerClient().from("cart_items").delete().eq("userId", user.id);
        if (clearCart.error) throw new Error(clearCart.error.message);

        const response = NextResponse.json({ redirectTo: normalizedMethod === "QRIS" ? `/payment/${order.invoice}` : `/order/${order.invoice}` }, { status: 201 });
        response.cookies.set(CHECKOUT_COOKIE, "", { path: "/", maxAge: 0 });
        return response;
    } catch (error) {
        console.error("Checkout Error:", error);
        const message = error instanceof Error && error.message === "Server Key atau Merchant ID tidak cocok dengan environment Sandbox/Production."
            ? error.message
            : error instanceof Error
                ? error.message
                : String(error);
        return NextResponse.json(
            {
                success: false,
                message,
                stack: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.stack : undefined) : undefined,
            },
            { status: 500 }
        );
    }
}