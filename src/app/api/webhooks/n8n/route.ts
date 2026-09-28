import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyOrderSource } from "@/lib/n8n-webhook";
import { SITE_URL } from "@/lib/site-url";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/webhooks/n8n  — Inbound receiver for n8n test pings / acks.
// GET  /api/webhooks/n8n  — Polling endpoint: returns recent orders for n8n.
//
// Authentication: both endpoints require one of:
//   Authorization: Bearer <N8N_WEBHOOK_SECRET>    ← preferred for n8n HTTP node
//   X-AFA-Webhook-Secret: <N8N_WEBHOOK_SECRET>    ← same header as outbound
//
// This deliberately matches the outbound header (X-AFA-Webhook-Secret) so that
// the same secret and same header name work for both directions. Both use the
// same N8N_WEBHOOK_SECRET env var.
//
// GET usage (n8n Schedule/Manual trigger → HTTP Request node):
//   GET /api/webhooks/n8n?since=2026-09-28T10:00:00Z
//   Returns up to 50 orders created after `since` (default: last 60 minutes).
//   Risk: if >50 orders arrive in one window, use cursor pagination (see below).
//   Current limit: 50 is sufficient for normal polling frequency (every 1–5 min).
//   For high-volume windows, advance `since` to the last received createdAt.
//
// Env vars:
//   N8N_WEBHOOK_SECRET — required; rejects all requests when absent (fail-closed).
// ---------------------------------------------------------------------------

function validateSecret(request: Request): boolean {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    // Reject if secret is not configured — fail closed, never open.
    if (!secret || secret.trim().length === 0) return false;

    const authHeader = request.headers.get("authorization") ?? "";
    const afaHeader = request.headers.get("x-afa-webhook-secret") ?? "";

    // Accept "Authorization: Bearer <secret>"
    const [scheme, token] = authHeader.split(" ", 2);
    if (scheme?.toLowerCase() === "bearer" && token === secret) return true;

    // Accept "X-AFA-Webhook-Secret: <secret>" (same header as outbound direction)
    if (afaHeader === secret) return true;

    return false;
}

// ---------------------------------------------------------------------------
// GET /api/webhooks/n8n
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
    if (!validateSecret(request)) {
        return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const sinceParam = url.searchParams.get("since");

    let since: Date;
    if (sinceParam) {
        since = new Date(sinceParam);
        if (isNaN(since.getTime())) {
            return NextResponse.json(
                { message: "Invalid 'since' parameter — use ISO 8601 (e.g. 2026-09-28T10:00:00Z)." },
                { status: 400 },
            );
        }
    } else {
        // Default: last 60 minutes (safe window for n8n minute-polling).
        since = new Date(Date.now() - 60 * 60 * 1000);
    }

    const orders = await prisma.order.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
            id: true,
            invoice: true,
            publicToken: true,
            customer: true,
            phone: true,
            source: true,
            total: true,
            subtotal: true,
            shipping: true,
            discount: true,
            paymentMethod: true,
            paymentStatus: true,
            status: true,
            createdAt: true,
            items: {
                select: {
                    name: true,
                    quantity: true,
                    price: true,
                    unitPrice: true,
                    subtotal: true,
                },
            },
        },
    });

    const base = SITE_URL.replace(/\/+$/, "");

    const payload = orders.map((order) => ({
        // Stable deterministic ID for deduplication (same as push payload).
        eventId: `ORDER_CREATED:${order.invoice}`,
        event: "ORDER_CREATED" as const,
        source: classifyOrderSource(order.source),
        rawSource: order.source,
        orderId: order.id,
        invoice: order.invoice,
        orderLink: order.publicToken
            ? `${base}/pesanan/${order.publicToken}`
            : `${base}/payment/${order.invoice}`,
        customer: order.customer,
        phone: order.phone,
        total: order.total,
        subtotal: order.subtotal,
        shipping: order.shipping,
        discount: order.discount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        status: order.status,
        items: order.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? item.price,
            subtotal: item.subtotal,
        })),
        createdAt: order.createdAt.toISOString(),
    }));

    return NextResponse.json(
        { orders: payload, count: payload.length, since: since.toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/n8n
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
    if (!validateSecret(request)) {
        return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    // Accept and log test pings / acknowledgments from n8n.
    let body: unknown = null;
    try {
        body = await request.json();
    } catch {
        // non-JSON body is fine — treat as an empty ping
    }

    console.info("[n8n] inbound ping", { body });
    return NextResponse.json({ ok: true, receivedAt: new Date().toISOString() });
}
