import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { authorizeProductItems, ProductAuthorityError } from "@/lib/product-authority";
import { formatOrderInvoice, getInvoicePrefix } from "@/lib/orders";
import {
    MIN_FORMATTED_ADDRESS_LENGTH,
    cleanFieldValue,
    isValidRecipientName,
    isValidRecipientPhone,
    joinAddressParts,
} from "@/lib/checkout-address";
import { parseDeliveryCoordinates } from "@/lib/coordinates";
import { BiteshipError, BiteshipUnavailableError, getBiteshipOriginAreaId, getBiteshipRates } from "@/lib/biteship";
import { calculateTotalWeight, isValidRateSelection, selectRate } from "@/lib/shipping-weight";
import { denyArbitraryAreaId, normalizeAreaId } from "@/lib/shipping-destination";
import {
    DEFAULT_KASIR_ORDER_TYPE,
    isKasirOrderType,
    kasirOrderTotal,
    type KasirOrderType,
} from "@/lib/kasir-delivery";
import {
    isKasirPaymentMethod,
    isKasirSource,
    KASIR_PAYMENT_METHOD_CANONICAL,
    MAX_KASIR_ITEMS,
    MAX_KASIR_QUANTITY,
} from "@/lib/kasir";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/admin/kasir/order
//
// Admin-only atomic persistence. Creates Order + OrderItem + Payment and
// decrements stock inside a single prisma.$transaction, reusing the same
// advisory lock + invoice generator as the online checkout so kasir and online
// orders share the AFA-YYYYMMDD-XXXXXX prefix without collisions. No Midtrans.
//
// PICKUP  : the historical kasir flow, unchanged (no shipping at all).
// DELIVERY: the SAME shipping architecture as the customer checkout —
//   Google Maps pin (browser) -> Biteship destinationAreaId -> Biteship rates,
//   RE-QUOTED here with authoritative products/weights. The client price is
//   never trusted and Google/fallback provider ids never become an area id.
//   The order is persisted as PAID + PROCESSING so the EXISTING
//   POST /api/admin/orders/[id]/biteship route can create the shipment.
// ---------------------------------------------------------------------------

type KasirDeliveryBody = {
    destinationAreaId?: unknown;
    address?: unknown;
    addressDetail?: unknown;
    note?: unknown;
    courierCode?: unknown;
    courierName?: unknown;
    serviceCode?: unknown;
    serviceName?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    province?: unknown;
    city?: unknown;
    district?: unknown;
    village?: unknown;
    postalCode?: unknown;
};

type KasirOrderBody = {
    customerName?: unknown;
    customerWhatsapp?: unknown;
    source?: unknown;
    paymentMethod?: unknown;
    cashReceived?: unknown;
    items?: unknown;
    orderType?: unknown;
    delivery?: unknown;
};

export async function POST(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    let body: KasirOrderBody;
    try {
        body = (await request.json()) as KasirOrderBody;
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    // --- source -----------------------------------------------------------
    // Tidak ada default diam-diam: source wajib dikirim oleh klien.
    const source = typeof body.source === "string" ? body.source.trim().toUpperCase() : "";
    if (!isKasirSource(source)) {
        return NextResponse.json({ message: "source wajib diisi dan harus TATAP_MUKA atau WHATSAPP." }, { status: 400 });
    }

    // --- paymentMethod -----------------------------------------------------
    const method = typeof body.paymentMethod === "string" ? body.paymentMethod.trim().toUpperCase() : "";
    if (!isKasirPaymentMethod(method)) {
        return NextResponse.json({ message: "paymentMethod tidak valid." }, { status: 400 });
    }
    const canonicalMethod = KASIR_PAYMENT_METHOD_CANONICAL[method];

    // --- items -------------------------------------------------------------
    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return NextResponse.json({ message: "items wajib berupa array dengan minimal 1 item." }, { status: 400 });
    }
    if (rawItems.length > MAX_KASIR_ITEMS) {
        return NextResponse.json({ message: `Jumlah item melebihi batas ${MAX_KASIR_ITEMS}.` }, { status: 400 });
    }

    const requestItems: { id: string; qty: number }[] = [];
    for (const raw of rawItems) {
        if (typeof raw !== "object" || raw === null) {
            return NextResponse.json({ message: "Format item tidak valid." }, { status: 400 });
        }
        const item = raw as Record<string, unknown>;
        const productId = typeof item.productId === "string" ? item.productId.trim() : "";
        const quantity = item.quantity;
        if (!productId) {
            return NextResponse.json({ message: "productId wajib diisi pada setiap item." }, { status: 400 });
        }
        if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
            return NextResponse.json({ message: "quantity harus bilangan bulat lebih dari 0." }, { status: 400 });
        }
        if (quantity > MAX_KASIR_QUANTITY) {
            return NextResponse.json({ message: `quantity tidak boleh melebihi ${MAX_KASIR_QUANTITY}.` }, { status: 400 });
        }
        requestItems.push({ id: productId, qty: quantity });
    }

    // --- customer ------------------------------------------------------------
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const customerWhatsapp = typeof body.customerWhatsapp === "string" ? body.customerWhatsapp.trim() : "";

    // --- orderType (JENIS PESANAN) ------------------------------------------
    // Default pickup: an existing caller that never sends orderType keeps the exact
    // historical kasir behaviour.
    const rawOrderType = typeof body.orderType === "string" ? body.orderType.trim().toUpperCase() : DEFAULT_KASIR_ORDER_TYPE;
    if (!isKasirOrderType(rawOrderType)) {
        return NextResponse.json({ message: "orderType wajib diisi dan harus PICKUP atau DELIVERY." }, { status: 400 });
    }
    const orderType: KasirOrderType = rawOrderType;

    // --- cash type/sign validation (amount check happens inside transaction) ----
    // PERSISTED AS NULL WHEN orderType is DELIVERY: payment confirmation will set it later.
    let cashValue: number | null = null;
    if (method === "TUNAI") {
        if (orderType !== "DELIVERY") {
            const cash = body.cashReceived;
            if (typeof cash !== "number" || !Number.isInteger(cash) || cash < 0) {
                return NextResponse.json({ message: "cashReceived wajib diisi berupa bilangan bulat untuk pembayaran Tunai." }, { status: 400 });
            }
            cashValue = cash;
        } else if (body.cashReceived !== undefined && body.cashReceived !== null) {
            return NextResponse.json({ message: "cashReceived tidak boleh diisi untuk pesanan Delivery COD." }, { status: 400 });
        }
    } else if (body.cashReceived !== undefined && body.cashReceived !== null) {
        return NextResponse.json({ message: "cashReceived hanya boleh diisi untuk pembayaran Tunai." }, { status: 400 });
    }

    // --- address sanitization helpers --------------------------------------
    const cleanMeta = (value: unknown, max: number): string | null =>
        typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

    // --- delivery (KIRIM) ----------------------------------------------------

    let deliveryRequest: {
        destinationAreaId: string;
        courierCode: string;
        serviceCode: string;
        address: string;
        note: string | null;
        latitude: number | null;
        longitude: number | null;
        province: string | null;
        city: string | null;
        district: string | null;
        village: string | null;
        postalCode: string | null;
    } | null = null;

    if (orderType === "DELIVERY") {
        if (!isValidRecipientName(customerName)) {
            return NextResponse.json({ message: "Nama penerima wajib diisi untuk pesanan Kirim." }, { status: 400 });
        }
        if (!isValidRecipientPhone(customerWhatsapp)) {
            return NextResponse.json({ message: "Nomor WhatsApp penerima wajib diisi untuk pesanan Kirim." }, { status: 400 });
        }

        const raw = (body.delivery && typeof body.delivery === "object" ? body.delivery : {}) as KasirDeliveryBody;

        const destinationAreaId = normalizeAreaId(raw.destinationAreaId);
        if (!destinationAreaId || denyArbitraryAreaId(destinationAreaId)) {
            return NextResponse.json({ message: "Tujuan pengiriman tidak valid. Silakan pilih ulang area pengiriman." }, { status: 400 });
        }
        if (!isValidRateSelection({ courierCode: raw.courierCode, serviceCode: raw.serviceCode })) {
            return NextResponse.json({ message: "Pilih jasa kurir sebelum memproses transaksi." }, { status: 400 });
        }
        // The confirmed map pin: BOTH coordinates are required for a delivery order.
        const coordinates = parseDeliveryCoordinates(raw.latitude, raw.longitude);
        if (!coordinates.provided || !coordinates.valid) {
            return NextResponse.json({ message: "Tentukan titik lokasi pengiriman di peta sebelum melanjutkan." }, { status: 400 });
        }
        // The resolved address (Google reverse geocode or the existing free fallback):
        // a valid formatted address is enough for display even when structured
        // components are missing — exactly like the customer checkout.
        const formattedAddress = cleanFieldValue(raw.address).slice(0, 500);
        if (formattedAddress.length < MIN_FORMATTED_ADDRESS_LENGTH) {
            return NextResponse.json({ message: "Alamat pengiriman belum tersedia. Tentukan lokasi di peta." }, { status: 400 });
        }
        const addressDetail = cleanFieldValue(raw.addressDetail).slice(0, 300);

        deliveryRequest = {
            destinationAreaId,
            courierCode: String(raw.courierCode).trim(),
            serviceCode: String(raw.serviceCode).trim(),
            // Street address = resolved address from the map + the cashier's own detail.
            address: joinAddressParts([formattedAddress, addressDetail], 700),
            note: cleanFieldValue(raw.note).slice(0, 300) || null,
            latitude: coordinates.coordinates?.latitude ?? null,
            longitude: coordinates.coordinates?.longitude ?? null,
            province: cleanMeta(raw.province, 120),
            city: cleanMeta(raw.city, 120),
            district: cleanMeta(raw.district, 120),
            village: cleanMeta(raw.village, 120),
            postalCode: cleanMeta(raw.postalCode, 12),
        };
    }

    // --- server-side shipping re-quote (DELIVERY only) -----------------------
    // NEVER the browser price: Biteship is asked again with authoritative products,
    // prices and weights, and the selection is matched by (courierCode, serviceCode).
    // Mirrors POST /api/checkout/order — the same helpers, not a second engine.
    let shipping = 0;
    let courierName: string | null = null;
    let courierCode: string | null = null;
    let serviceName: string | null = null;
    let serviceCode: string | null = null;
    let quoteRef: string | null = null;
    let originAreaId: string | null = null;

    if (orderType === "DELIVERY" && deliveryRequest) {
        try {
            const quotedItems = await authorizeProductItems(requestItems);
            const totalWeight = calculateTotalWeight(
                quotedItems.map((item) => ({ id: item.id, weight: item.weight, qty: item.qty })),
            );
            if (totalWeight < 1) {
                return NextResponse.json({ message: "Berat produk tidak valid. Hubungi admin." }, { status: 400 });
            }
            const quoted = await getBiteshipRates({
                destinationAreaId: deliveryRequest.destinationAreaId,
                items: quotedItems.map((item) => ({ name: item.name, weight: item.weight, quantity: item.qty, value: item.price })),
            });
            const selected = selectRate(quoted.rates, {
                courierCode: deliveryRequest.courierCode,
                serviceCode: deliveryRequest.serviceCode,
            });
            if (!selected) {
                return NextResponse.json(
                    { message: "Ongkir pilihan sudah berubah. Silakan pilih kurir kembali." },
                    { status: 409 },
                );
            }
            shipping = selected.price;
            courierName = selected.courierName;
            // The authoritative Biteship courier/service CODES come from the server-side quote.
            courierCode = selected.courierCode;
            serviceName = selected.serviceName;
            serviceCode = selected.serviceCode;
            quoteRef = selected.quoteRef;
            originAreaId = quoted.originAreaId || getBiteshipOriginAreaId();
        } catch (error) {
            console.error("kasir_delivery_quote_failed", {
                route: "/api/admin/kasir/order",
                name: error instanceof Error ? error.name : "UnknownError",
            });
            if (error instanceof ProductAuthorityError) {
                return NextResponse.json({ message: error.message }, { status: error.status });
            }
            if (error instanceof BiteshipUnavailableError) {
                return NextResponse.json({ message: error.message }, { status: 503 });
            }
            if (error instanceof BiteshipError) {
                return NextResponse.json({ message: error.message }, { status: 400 });
            }
            return NextResponse.json({ message: "Terjadi kesalahan server." }, { status: 500 });
        }
    }

    try {
        const created = await prisma.$transaction(async (tx) => {
            // F. authoritative products + price from database.
            const items = await authorizeProductItems(requestItems, tx);
            const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
            // TOTAL = authoritative subtotal + authoritative ongkir (0 for pickup).
            const total = kasirOrderTotal({ subtotal, orderType, shipping });

            let cashReceived: number | null = null;
            let change: number | null = null;
            if (method === "TUNAI") {
                if (orderType !== "DELIVERY") {
                    if (cashValue === null || cashValue < total) {
                        throw new ProductAuthorityError(400, "Uang yang diterima kurang dari total belanja.");
                    }
                    cashReceived = cashValue;
                    change = cashValue - total;
                }
                // For DELIVERY TUNAI, cashReceived stays NULL until admin confirms receipt
            }

            // A/B. now + invoice prefix.
            const now = new Date();
            const todayPrefix = getInvoicePrefix(now);

            // C/D. advisory lock shared with online checkout, then count today.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${todayPrefix}))`;
            const todayCount = await tx.order.count({ where: { invoice: { startsWith: todayPrefix } } });

            // G. atomic stock decrement with conditional guard.
            const orderedItems = [...items].sort((a, b) => a.id.localeCompare(b.id));
            for (const item of orderedItems) {
                const changed = await tx.product.updateMany({
                    where: { id: item.id, isActive: true, stock: { gte: item.qty } },
                    data: { stock: { decrement: item.qty } },
                });
                if (changed.count !== 1) {
                    throw new ProductAuthorityError(409, "Stok produk tidak mencukupi");
                }
            }

            // I. create Order + OrderItem (nested).
            // Delivery orders reuse the SAME Order shipping columns as the online checkout:
            // the Biteship destination/quote/courier values are the SERVER-verified ones.
            // Pickup keeps the historical kasir shape (empty address, zero shipping).
            const deliveryData = deliveryRequest
                ? {
                      address: deliveryRequest.address,
                      note: deliveryRequest.note,
                      shipping,
                      courier: courierName,
                      courierCode,
                      service: serviceName,
                      serviceCode,
                      shippingQuoteRef: quoteRef,
                      destinationAreaId: deliveryRequest.destinationAreaId,
                      originAreaId,
                      destinationLatitude: deliveryRequest.latitude,
                      destinationLongitude: deliveryRequest.longitude,
                      destinationProvince: deliveryRequest.province,
                      destinationCity: deliveryRequest.city,
                      destinationDistrict: deliveryRequest.district,
                      destinationVillage: deliveryRequest.village,
                      destinationPostalCode: deliveryRequest.postalCode,
                      processedAt: now,
                  }
                : { address: "", shipping: 0 };

            const order = await tx.order.create({
                data: {
                    ...deliveryData,
                    invoice: formatOrderInvoice(now, todayCount + 1),
                    customer: customerName || "Pelanggan",
                    phone: customerWhatsapp,
                    subtotal,
                    discount: 0,
                    total,
                    // A delivery order is paid but not finished: it stays PROCESSING so the
                    // existing POST /api/admin/orders/[id]/biteship route may ship it.
                    status: orderType === "DELIVERY" ? "PROCESSING" : "COMPLETED",
                    paymentMethod: canonicalMethod,
                    // DELIVERY TUNAI starts as WAITING_PAYMENT until admin confirms COD receipt
                    paymentStatus: (orderType === "DELIVERY" && method === "TUNAI") ? "WAITING_PAYMENT" : "PAID",
                    source,
                    cashReceived,
                    change,
                    completedAt: orderType === "DELIVERY" ? null : now,
                    items: {
                        create: items.map((item) => ({
                            productId: item.id,
                            name: item.name,
                            quantity: item.qty,
                            price: item.price,
                            subtotal: item.price * item.qty,
                            // Frozen authoritative weight snapshot: the Biteship shipment
                            // payload reads this, never a browser-supplied weight.
                            weight: orderType === "DELIVERY" ? item.weight : 0,
                        })),
                    },
                },
            });

            // J. create Payment (lunas, no transactionRef/paymentType).
            // DELIVERY TUNAI starts as PENDING until admin confirms COD receipt
            await tx.payment.create({
                data: {
                    orderId: order.id,
                    method: canonicalMethod,
                    amount: total,
                    status: (orderType === "DELIVERY" && method === "TUNAI") ? "PENDING" : "PAID",
                    paidAt: (orderType === "DELIVERY" && method === "TUNAI") ? null : now,
                },
            });

            return { order, total };
        });

        return NextResponse.json(
            {
                success: true,
                orderId: created.order.id,
                invoice: created.order.invoice,
                subtotal: created.order.subtotal,
                shipping: created.order.shipping,
                total: created.total,
                orderType,
                courier: courierName,
                service: serviceName,
                paymentMethod: method,
                source,
                cashReceived: method === "TUNAI" ? created.order.cashReceived : null,
                change: method === "TUNAI" ? created.order.change : null,
                status: created.order.status,
                paymentStatus: created.order.paymentStatus,
            },
            { status: 201 },
        );
    } catch (error) {
        if (error instanceof ProductAuthorityError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        console.error("kasir_order_failed", {
            route: "/api/admin/kasir/order",
            category: "kasir_order_failure",
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ message: "Terjadi kesalahan server." }, { status: 500 });
    }
}
