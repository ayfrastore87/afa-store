// ---------------------------------------------------------------------------
// n8n Webhook integration — AFA STORE order notifications.
// Import-free: no @/ aliases, no server-only — pure functions are testable
// directly from Node.js test runners without module aliasing.
//
// Env vars (server-side only):
//   N8N_WEBHOOK_URL    — n8n trigger URL. Absent = fireN8nWebhook is no-op.
//   N8N_WEBHOOK_SECRET — shared secret; sent as X-AFA-Webhook-Secret header.
//
// Fan-out targets handled by n8n workflow:
//   • Admin notification  (WhatsApp / Telegram / email)
//   • Customer order link (/pesanan/<publicToken> or /payment/<invoice>)
//   • Reporting automation (Google Sheets / Airtable / etc.)
//
// Outbound auth  (AFA STORE → n8n):
//   Header: X-AFA-Webhook-Secret: <N8N_WEBHOOK_SECRET>
//   This header name is intentionally prefixed "AFA" to distinguish it from
//   the generic X-Webhook-Secret accepted by the inbound polling route.
//
// Inbound auth   (n8n → AFA STORE /api/webhooks/n8n):
//   Accepts either:
//     Authorization: Bearer <N8N_WEBHOOK_SECRET>   ← preferred for n8n HTTP node
//     X-AFA-Webhook-Secret: <N8N_WEBHOOK_SECRET>   ← same secret, same header name
//   Both use the same N8N_WEBHOOK_SECRET value.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Actual DB source values (Order.source column):
//   ONLINE      — customer checkout via website
//   TATAP_MUKA  — face-to-face kasir POS
//   WHATSAPP    — WhatsApp order entered by cashier
//   MARKETPLACE — order received through external marketplace (Tokopedia, etc.),
//                 entered by cashier. This is a KASIR-side source; it is NOT
//                 the same as the SalesVisit/consignment system. Revenue is
//                 bucketed under cashierRevenue, not salesRevenue.
//   OTHER       — unclassified kasir order
//
// NOTE: There is NO "SALES" source in the Order model. The Sales (Titip Jual)
// system uses SalesVisit, not Order. Do not map MARKETPLACE → SALES.
// ---------------------------------------------------------------------------

/** Canonical order-source buckets exposed to n8n for routing/branching. */
export type N8nOrderSource = "ONLINE" | "KASIR" | "WHATSAPP" | "MARKETPLACE" | "OTHER";

const SOURCE_MAP: Record<string, N8nOrderSource> = {
    ONLINE: "ONLINE",           // online store checkout (DB default)
    TATAP_MUKA: "KASIR",        // face-to-face POS
    WHATSAPP: "WHATSAPP",       // WhatsApp order entered by cashier
    MARKETPLACE: "MARKETPLACE", // marketplace channel order entered by cashier
    OTHER: "OTHER",             // unclassified
};

/** Maps Order.source DB value → canonical n8n bucket. Unknown values → "OTHER". */
export function classifyOrderSource(raw: string): N8nOrderSource {
    return SOURCE_MAP[String(raw ?? "").toUpperCase().trim()] ?? "OTHER";
}

export type N8nOrderItem = {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
};

export type N8nWebhookPayload = {
    /** Stable deterministic identifier for deduplication: "ORDER_CREATED:<invoice>".
     *  n8n should check this field before processing — same eventId = same event. */
    eventId: string;
    event: "ORDER_CREATED";
    source: N8nOrderSource;
    rawSource: string;
    orderId: string;
    invoice: string;
    orderLink: string;
    customer: string;
    phone: string;
    total: number;
    subtotal: number;
    shipping: number;
    discount: number;
    paymentMethod: string;
    paymentStatus: string;
    status: string;
    items: N8nOrderItem[];
    createdAt: string;
    issuedAt: string;
};

/** Minimum order shape needed to build a webhook payload. */
export type OrderForWebhook = {
    id: string;
    invoice: string;
    publicToken?: string | null;
    customer: string;
    phone: string;
    source: string;
    total: number;
    subtotal: number;
    shipping: number;
    discount: number;
    paymentMethod: string;
    paymentStatus: string;
    status: string;
    items: Array<{
        name: string;
        quantity: number;
        unitPrice?: number | null;
        price: number;
        subtotal: number;
    }>;
    createdAt: Date;
};

const DEFAULT_SITE_URL = "https://afastore.online";

/**
 * Builds the JSON payload to send to n8n.
 * @param order   Minimum order fields (Prisma Order + included items).
 * @param siteUrl Base URL override — defaults to NEXT_PUBLIC_SITE_URL env var
 *                then "https://afastore.online". Pass explicitly in tests.
 */
export function buildN8nPayload(order: OrderForWebhook, siteUrl?: string): N8nWebhookPayload {
    const base = (
        siteUrl ??
        (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SITE_URL : undefined) ??
        DEFAULT_SITE_URL
    ).replace(/\/+$/, "");

    const orderLink = order.publicToken
        ? `${base}/pesanan/${order.publicToken}`
        : `${base}/payment/${order.invoice}`;

    return {
        // Stable deterministic ID: n8n can deduplicate on this field.
        // Uses invoice (unique per order, never reused) so the same order
        // always produces the same eventId — safe for polling deduplication.
        eventId: `ORDER_CREATED:${order.invoice}`,
        event: "ORDER_CREATED",
        source: classifyOrderSource(order.source),
        rawSource: order.source,
        orderId: order.id,
        invoice: order.invoice,
        orderLink,
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
        issuedAt: new Date().toISOString(),
    };
}

/**
 * Fires the webhook to the configured n8n trigger URL.
 * - Never throws; all errors are caught and logged as warnings.
 * - Call with `void fireN8nWebhook(payload)` to avoid blocking the response.
 * - No-op when N8N_WEBHOOK_URL is absent (local dev / CI without n8n).
 * - 10-second timeout prevents slow n8n from stalling requests.
 */
export async function fireN8nWebhook(payload: N8nWebhookPayload): Promise<void> {
    const webhookUrl =
        typeof process !== "undefined" ? process.env.N8N_WEBHOOK_URL : undefined;
    if (!webhookUrl) return;

    const secret =
        typeof process !== "undefined" ? process.env.N8N_WEBHOOK_SECRET : undefined;

    try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (secret) headers["X-AFA-Webhook-Secret"] = secret;
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            console.warn("[n8n] webhook non-2xx", {
                invoice: payload.invoice,
                source: payload.source,
                status: res.status,
            });
        }
    } catch (error) {
        // Network errors / timeouts must never crash checkout or kasir.
        console.warn("[n8n] webhook error", {
            invoice: payload.invoice,
            source: payload.source,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
