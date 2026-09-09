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
import { authorizeProductItems, ProductAuthorityError, productAuthorityResponse } from "@/lib/product-authority";
import { checkoutRequestHash, normalizeIdempotencyKey } from "@/lib/checkout-idempotency";

export const runtime = "nodejs";

type CheckoutAddress = {
    recipientName?: string;
    phone?: string;
    email?: string;
    address?: string;
    note?: string;
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
        const key = normalizeIdempotencyKey(request.headers.get("Idempotency-Key"));
        if (!key) return NextResponse.json({ message: "Idempotency-Key is required and must be 255 characters or fewer." }, { status: 400 });

        const store = await cookies();
        const snapshot = decodeCheckoutItems(store.get(CHECKOUT_COOKIE)?.value);
        if (!snapshot.length) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });

        let address: CheckoutAddress;
        try {
            address = (await request.json()) as CheckoutAddress;
        } catch {
            return NextResponse.json({ message: "Payload checkout tidak valid." }, { status: 400 });
        }
        if (![address.recipientName, address.phone, address.address, address.province, address.city, address.district, address.postalCode].every(requireText)) {
            return NextResponse.json({ message: "Lengkapi alamat pengiriman." }, { status: 400 });
        }

        const note = requireText(address.note) ? ` Catatan: ${address.note!.trim()}` : "";
        const fullAddress = `${address.address}, ${address.district}, ${address.city}, ${address.province} ${address.postalCode}.${note}`;
        const paymentMethod = paymentMethods.includes(String(address.paymentMethod).toUpperCase() as (typeof paymentMethods)[number]) ? String(address.paymentMethod).toUpperCase() : "QRIS";
        const normalizedMethod = isPaymentMethod(paymentMethod) ? paymentMethod : "QRIS";
        const requestHash = checkoutRequestHash(user.id, address, snapshot.map(({ id, qty }) => ({ id, qty })));
        let existing;
        try {
            existing = await prisma.checkoutIdempotency.findUnique({ where: { key } });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
                console.warn("checkout_unavailable", { route: "/api/checkout/order", category: "idempotency_store_unavailable", status: 503 });
                return NextResponse.json({ success: false, error: "Checkout temporarily unavailable. Please try again after maintenance is complete." }, { status: 503 });
            }
            throw error;
        }
        if (existing) {
            if (existing.userId !== user.id || existing.requestHash !== requestHash) {
                return NextResponse.json({ message: "Idempotency key has already been used with a different request." }, { status: 409 });
            }
            if (existing.responsePayload) return NextResponse.json(existing.responsePayload, { status: 201 });
            return NextResponse.json({ success: false, status: "PROCESSING", message: "Checkout is already being processed." }, { status: 409 });
        }
        const paymentStatus = paymentMethod === "COD" ? "PENDING" : "PENDING";
        const defaultExpiredAt = new Date(Date.now() + 60 * 60 * 1000);
        let order;
        let total = 0;
        const shipping = SHIPPING_COST;
        try {
        order = await prisma.$transaction(async (tx) => {
            await tx.checkoutIdempotency.create({ data: { key, userId: user.id, requestHash, status: "PROCESSING" } });
            const items = await authorizeProductItems(snapshot.map(({ id, qty }) => ({ id, qty })), tx);
            const subtotal = checkoutSubtotal(items);
            total = subtotal + shipping;
            const orderedItems = [...items].sort((a, b) => a.id.localeCompare(b.id));
            for (const item of orderedItems) {
                const changed = await tx.product.updateMany({
                    where: { id: item.id, isActive: true, stock: { gte: item.qty } },
                    data: { stock: { decrement: item.qty } },
                });
                if (changed.count !== 1) throw new ProductAuthorityError(409, "Stok produk tidak mencukupi");
            }

            const now = new Date();
            const todayPrefix = getInvoicePrefix(now);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${todayPrefix}))`;
            const todayCount = await tx.order.count({ where: { invoice: { startsWith: todayPrefix } } });
            const created = await tx.order.create({
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
                    paymentStatus: "PENDING",
                    items: { create: items.map((item) => ({ productId: item.id, name: item.name, quantity: item.qty, price: item.price, subtotal: item.price * item.qty })) },
                },
                include: { items: true, user: true },
            });
            await tx.payment.create({ data: { orderId: created.id, method: normalizedMethod, amount: total, status: paymentStatus, expiredAt: defaultExpiredAt } });
            await tx.checkoutHistory.create({
                data: { userId: user.id, orderId: created.id, channel: "checkout", items, subtotal, shipping, discount: 0, total, city: address.city?.trim() || null, message: `Order ${created.invoice} dibuat pada ${now.toISOString()}${address.email ? ` untuk ${address.email.trim()}` : ""}` },
            });
            const responsePayload = { success: true, status: "PENDING", orderId: created.id, invoice: created.invoice, redirectTo: normalizedMethod === "QRIS" ? `/payment/${created.invoice}` : `/order/${created.invoice}` };
            await tx.checkoutIdempotency.update({ where: { key }, data: { orderId: created.id, status: "COMPLETED", responsePayload } });
            return created;
        });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
                console.warn("checkout_unavailable", { route: "/api/checkout/order", category: "idempotency_store_unavailable", status: 503 });
                return NextResponse.json({ success: false, error: "Checkout temporarily unavailable. Please try again after maintenance is complete." }, { status: 503 });
            }
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const concurrent = await prisma.checkoutIdempotency.findUnique({ where: { key } });
                if (concurrent && concurrent.userId === user.id && concurrent.requestHash === requestHash && concurrent.responsePayload) return NextResponse.json(concurrent.responsePayload, { status: 201 });
                if (concurrent && concurrent.userId === user.id && concurrent.requestHash === requestHash) return NextResponse.json({ success: false, status: "PROCESSING", message: "Checkout is already being processed." }, { status: 409 });
                return NextResponse.json({ message: "Idempotency key has already been used with a different request." }, { status: 409 });
            }
            throw error;
        }

        let qrisUrl: string | null = null;
        if (normalizedMethod === "QRIS") {
            const midtrans = await createMidtransQrisCharge({ invoice: order.invoice, amount: total, customer: { name: order.customer, email: order.user?.email, phone: order.phone }, items: [...order.items.map((item) => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })), { id: "shipping", name: "Ongkir", price: shipping, quantity: 1 }], expiryMinutes: 60 });
            qrisUrl = getQrisActionUrl(midtrans);
            await prisma.payment.update({ where: { orderId: order.id }, data: { qrisUrl, transactionId: midtrans.transaction_id ?? null, transactionRef: midtrans.order_id ?? order.invoice, paymentType: midtrans.payment_type ?? "qris", rawResponse: midtrans as Prisma.InputJsonValue, expiredAt: midtrans.expiry_time ? new Date(midtrans.expiry_time.replace(" ", "T")) : defaultExpiredAt } });
        }

        const cart = getSupabaseServerClient().from("cart_items");
        for (const item of snapshot) {
            const clearCart = await cart.delete().eq("userId", user.id).eq("productRef", item.id).eq("quantity", item.qty);
            if (clearCart.error) throw new Error(clearCart.error.message);
        }

        const response = NextResponse.json({ success: true, status: "PENDING", orderId: order.id, invoice: order.invoice, redirectTo: normalizedMethod === "QRIS" ? `/payment/${order.invoice}` : `/order/${order.invoice}` }, { status: 201 });
        response.cookies.set(CHECKOUT_COOKIE, "", { path: "/", maxAge: 0 });
        return response;
    } catch (error) {
        const prismaKnownError = error instanceof Prisma.PrismaClientKnownRequestError;
        console.error("checkout_failed", {
            route: "/api/checkout/order",
            category: "checkout_failure",
            status: 500,
            name: error instanceof Error ? error.name : "UnknownError",
            prismaKnownError,
            code: prismaKnownError ? error.code : undefined,
            message: error instanceof Error ? error.message : String(error),
            meta: prismaKnownError ? error.meta : undefined,
        });
        const safe = productAuthorityResponse(error);
        return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
    }
}