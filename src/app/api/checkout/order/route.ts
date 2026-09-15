import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createSupabaseServiceClient } from "@/lib/supabase-admin";
import { CHECKOUT_COOKIE, checkoutSubtotal, decodeCheckoutItems } from "@/lib/checkout";
import { prisma } from "@/lib/prisma";
import { formatOrderInvoice, getInvoicePrefix } from "@/lib/orders";
import { createMidtransQrisCharge, getQrisActionUrl } from "@/lib/midtrans";
import { isPaymentMethod } from "@/lib/payments";
import { getCurrentUser } from "@/lib/server-auth";
import { authorizeProductItems, ProductAuthorityError, productAuthorityResponse } from "@/lib/product-authority";
import { checkoutRequestHash, normalizeIdempotencyKey } from "@/lib/checkout-idempotency";
import { getBiteshipRates, getBiteshipOriginAreaId, BiteshipError, BiteshipUnavailableError } from "@/lib/biteship";
import { calculateTotalWeight, isValidRateSelection, selectRate } from "@/lib/shipping-weight";
import { normalizeAreaId, denyArbitraryAreaId } from "@/lib/shipping-destination";

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
    // Dropshipper identity — label/sender info only. It must NEVER change the
    // Biteship physical origin (which stays server-controlled at AFA STORE).
    senderName?: string;
    senderPhone?: string;
    hidePrice?: boolean;
    // Shipping selection — server re-validates this against a live Biteship quote.
    destinationAreaId?: string;
    courierCode?: string;
    courierName?: string;
    serviceCode?: string;
    serviceName?: string;
    quoteRef?: string;
};

const paymentMethods = ["QRIS"] as const;

function requireText(value: string | undefined) {
    return typeof value === "string" && value.trim().length > 0;
}

function getSupabaseServerClient() {
    // Cart cleanup after checkout must bypass RLS via the service-role key only.
    return createSupabaseServiceClient();
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ redirectTo: "/login" }, { status: 401 });
        const key = normalizeIdempotencyKey(request.headers.get("Idempotency-Key"));
        if (!key) return NextResponse.json({ message: "Permintaan tidak valid. Silakan muat ulang halaman checkout." }, { status: 400 });

        const store = await cookies();
        const snapshot = decodeCheckoutItems(store.get(CHECKOUT_COOKIE)?.value);
        if (!snapshot.length) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });

        let address: CheckoutAddress;
        try {
            address = (await request.json()) as CheckoutAddress;
        } catch {
            return NextResponse.json({ message: "Payload checkout tidak valid." }, { status: 400 });
        }
        // Required identity + destination: recipient name, phone and street address.
        // The Biteship destination is authoritative via destinationAreaId (validated further
        // below against the live quote). province/city/district/postalCode are enrichment
        // carried from the selected Biteship area metadata and are optional here.
        const recipientName = requireText(address.recipientName) ? address.recipientName!.trim().slice(0, 120) : "";
        const recipientPhone = requireText(address.phone) ? address.phone!.trim().slice(0, 40) : "";
        const streetAddress = requireText(address.address) ? address.address!.trim().slice(0, 500) : "";
        if (!recipientName || !recipientPhone || !streetAddress) {
            return NextResponse.json({ message: "Lengkapi alamat pengiriman." }, { status: 400 });
        }

        const sellerNote = typeof address.note === "string" ? address.note.trim().slice(0, 200) || null : null;
        const senderName = typeof address.senderName === "string" ? address.senderName.trim().slice(0, 120) || null : null;
        const senderPhone = typeof address.senderPhone === "string" ? address.senderPhone.trim().slice(0, 40) || null : null;
        const hidePrice = address.hidePrice === true;
        const recipientLabel = recipientName;
        const fullAddress = [streetAddress, address.district, address.city, address.province, address.postalCode].map((part) => (typeof part === "string" ? part.trim().slice(0, 200) : "")).filter(Boolean).join(", ").slice(0, 800);
        const paymentMethod = paymentMethods.includes(String(address.paymentMethod).toUpperCase() as (typeof paymentMethods)[number]) ? String(address.paymentMethod).toUpperCase() : "QRIS";
        const normalizedMethod = isPaymentMethod(paymentMethod) ? paymentMethod : "QRIS";
        const requestHash = checkoutRequestHash(user.id, address, snapshot.map(({ id, qty }) => ({ id, qty })));

        // Idempotency: resolve a previous checkout BEFORE any external call (Biteship) or
        // shipping validation. A retry with the same key must reuse the existing result and
        // must never depend on a fresh quote (which may have changed or become unavailable).
        try {
            const existing = await prisma.checkoutIdempotency.findUnique({ where: { key } });
            if (existing) {
                if (existing.userId !== user.id || existing.requestHash !== requestHash) {
                    return NextResponse.json({ message: "Permintaan checkout tidak valid. Silakan muat ulang halaman." }, { status: 409 });
                }
                if (existing.responsePayload) return NextResponse.json(existing.responsePayload, { status: 201 });
                return NextResponse.json({ success: false, status: "PROCESSING", message: "Pesanan sedang diproses. Silakan tunggu sebentar." }, { status: 409 });
            }
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
                console.warn("checkout_unavailable", { route: "/api/checkout/order", category: "idempotency_store_unavailable", status: 503 });
                return NextResponse.json({ success: false, error: "Checkout sedang dalam pemeliharaan. Silakan coba lagi nanti." }, { status: 503 });
            }
            throw error;
        }

        // SECURITY: re-derive shipping server-side. Never trust client price/weight.
        const selection = { courierCode: String(address.courierCode ?? ""), serviceCode: String(address.serviceCode ?? "") };
        if (!isValidRateSelection(selection)) {
            return NextResponse.json({ message: "Pilih jasa kurir sebelum melanjutkan." }, { status: 400 });
        }
        const destinationAreaId = normalizeAreaId(address.destinationAreaId);
        if (!destinationAreaId || denyArbitraryAreaId(destinationAreaId)) {
            return NextResponse.json({ message: "Tujuan pengiriman tidak valid. Silakan pilih ulang." }, { status: 400 });
        }

        // Authorize items (with authoritative weight) before hitting Biteship.
        const authorized = await authorizeProductItems(snapshot.map(({ id, qty }) => ({ id, qty })));
        const totalWeight = calculateTotalWeight(authorized.map((item) => ({ id: item.id, weight: item.weight, qty: item.qty })));
        if (totalWeight < 1) {
            return NextResponse.json({ message: "Berat produk tidak valid. Hubungi admin." }, { status: 400 });
        }

        let shipping;
        let courierName;
        let courierCode;
        let serviceName;
        let quoteRef;
        let originAreaId;
        try {
            const quoted = await getBiteshipRates({
                destinationAreaId,
                items: authorized.map((item) => ({ name: item.name, weight: item.weight, quantity: item.qty, value: item.price })),
            });
            const selected = selectRate(quoted.rates, selection);
            if (!selected) {
                return NextResponse.json({ message: "Ongkir pilihan sudah berubah. Silakan pilih kurir kembali." }, { status: 409 });
            }
            shipping = selected.price;
            courierName = selected.courierName;
            // The authoritative Biteship courier CODE comes from the server-side
            // revalidated quote — never from the browser display name or a guess.
            courierCode = selected.courierCode;
            serviceName = selected.serviceName;
            quoteRef = selected.quoteRef;
            originAreaId = quoted.originAreaId || getBiteshipOriginAreaId();
        } catch (error) {
            if (error instanceof BiteshipUnavailableError) {
                return NextResponse.json({ message: error.message }, { status: 503 });
            }
            if (error instanceof BiteshipError) {
                return NextResponse.json({ message: error.message }, { status: 400 });
            }
            throw error;
        }

        const defaultExpiredAt = new Date(Date.now() + 60 * 60 * 1000);
        let order;
        let total = 0;
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
                    customer: recipientLabel,
                    phone: recipientPhone,
                    address: fullAddress,
                    note: sellerNote,
                    senderName,
                    senderPhone,
                    hidePrice,
                    subtotal,
                    shipping,
                    discount: 0,
                    total,
                    status: "PENDING",
                    paymentMethod,
                    paymentStatus: "PENDING",
                    courier: courierName,
                    courierCode,
                    service: serviceName,
                    serviceCode: selection.serviceCode,
                    shippingQuoteRef: quoteRef,
                    destinationAreaId,
                    originAreaId,
                    items: { create: items.map((item) => ({ productId: item.id, name: item.name, quantity: item.qty, price: item.price, subtotal: item.price * item.qty, weight: item.weight })) },
                },
                include: { items: true, user: true },
            });
            await tx.payment.create({ data: { orderId: created.id, method: normalizedMethod, amount: total, status: "PENDING", expiredAt: defaultExpiredAt } });
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
                return NextResponse.json({ success: false, error: "Checkout sedang dalam pemeliharaan. Silakan coba lagi nanti." }, { status: 503 });
            }
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const concurrent = await prisma.checkoutIdempotency.findUnique({ where: { key } });
                if (concurrent && concurrent.userId === user.id && concurrent.requestHash === requestHash && concurrent.responsePayload) return NextResponse.json(concurrent.responsePayload, { status: 201 });
                if (concurrent && concurrent.userId === user.id && concurrent.requestHash === requestHash) return NextResponse.json({ success: false, status: "PROCESSING", message: "Pesanan sedang diproses. Silakan tunggu sebentar." }, { status: 409 });
                return NextResponse.json({ message: "Permintaan checkout tidak valid. Silakan muat ulang halaman." }, { status: 409 });
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