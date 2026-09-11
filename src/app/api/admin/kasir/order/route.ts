import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { authorizeProductItems, ProductAuthorityError } from "@/lib/product-authority";
import { formatOrderInvoice, getInvoicePrefix } from "@/lib/orders";
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
// TAHAP D: admin-only atomic persistence. Creates Order + OrderItem + Payment
// and decrements stock inside a single prisma.$transaction, reusing the same
// advisory lock + invoice generator as the online checkout so kasir and online
// orders share the AFA-YYYYMMDD-XXXXXX prefix without collisions. No Midtrans.
// ---------------------------------------------------------------------------

type KasirOrderBody = {
    customerName?: unknown;
    customerWhatsapp?: unknown;
    source?: unknown;
    paymentMethod?: unknown;
    cashReceived?: unknown;
    items?: unknown;
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

    // --- cash type/sign validation (amount check happens inside transaction) -
    let cashValue: number | null = null;
    if (method === "TUNAI") {
        const cash = body.cashReceived;
        if (typeof cash !== "number" || !Number.isInteger(cash) || cash < 0) {
            return NextResponse.json({ message: "cashReceived wajib diisi berupa bilangan bulat untuk pembayaran Tunai." }, { status: 400 });
        }
        cashValue = cash;
    } else if (body.cashReceived !== undefined && body.cashReceived !== null) {
        return NextResponse.json({ message: "cashReceived hanya boleh diisi untuk pembayaran Tunai." }, { status: 400 });
    }

    try {
        const created = await prisma.$transaction(async (tx) => {
            // F. authoritative products + price from database.
            const items = await authorizeProductItems(requestItems, tx);
            const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
            const total = subtotal;

            let cashReceived: number | null = null;
            let change: number | null = null;
            if (method === "TUNAI") {
                if (cashValue === null || cashValue < total) {
                    throw new ProductAuthorityError(400, "Uang yang diterima kurang dari total belanja.");
                }
                cashReceived = cashValue;
                change = cashValue - total;
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

            // H/I. create Order + OrderItem (nested).
            const order = await tx.order.create({
                data: {
                    invoice: formatOrderInvoice(now, todayCount + 1),
                    customer: customerName || "Pelanggan",
                    phone: customerWhatsapp,
                    address: "",
                    subtotal,
                    shipping: 0,
                    discount: 0,
                    total,
                    status: "COMPLETED",
                    paymentMethod: canonicalMethod,
                    paymentStatus: "PAID",
                    source,
                    cashReceived,
                    change,
                    completedAt: now,
                    items: {
                        create: items.map((item) => ({
                            productId: item.id,
                            name: item.name,
                            quantity: item.qty,
                            price: item.price,
                            subtotal: item.price * item.qty,
                        })),
                    },
                },
            });

            // J. create Payment (lunas, no transactionRef/paymentType).
            await tx.payment.create({
                data: {
                    orderId: order.id,
                    method: canonicalMethod,
                    amount: total,
                    status: "PAID",
                    paidAt: now,
                },
            });

            return { order, total };
        });

        return NextResponse.json(
            {
                success: true,
                orderId: created.order.id,
                invoice: created.order.invoice,
                total: created.total,
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
