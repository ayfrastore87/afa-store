/**
 * n8n-webhook.test.mjs
 *
 * Tests for the AFA STORE n8n webhook integration:
 *   1. classifyOrderSource() — DB source → canonical n8n bucket
 *   2. buildN8nPayload()     — payload shape, order links, items
 *   3. lib static analysis   — exports, never-throw, no @/ imports
 *   4. Inbound route         — secret validation, GET/POST structure
 *   5. Route wiring          — webhook import & void call in checkout+kasir
 *
 * Run: node --test tests/n8n-webhook.test.mjs
 */
import { readFileSync } from "node:fs";
import { strictEqual, deepStrictEqual, match, doesNotMatch, ok } from "node:assert";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { classifyOrderSource, buildN8nPayload } from "../src/lib/n8n-webhook.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const libSrc      = read("src/lib/n8n-webhook.ts");
const routeSrc    = read("src/app/api/webhooks/n8n/route.ts");
const checkoutSrc = read("src/app/api/checkout/order/route.ts");
const kasirSrc    = read("src/app/api/admin/kasir/order/route.ts");

// ── 1. classifyOrderSource ──────────────────────────────────────────────────
// MARKETPLACE is a kasir-entered source (Tokopedia etc. orders processed
// through the POS). It is NOT the Sales (SalesVisit) channel — that system
// uses SalesVisit, not Order. Revenue is bucketed under cashierRevenue.
test("ONLINE → ONLINE", () => strictEqual(classifyOrderSource("ONLINE"), "ONLINE"));
test("TATAP_MUKA → KASIR", () => strictEqual(classifyOrderSource("TATAP_MUKA"), "KASIR"));
test("WHATSAPP → WHATSAPP", () => strictEqual(classifyOrderSource("WHATSAPP"), "WHATSAPP"));
test("MARKETPLACE → MARKETPLACE (not SALES — no Order.source=SALES exists)", () => strictEqual(classifyOrderSource("MARKETPLACE"), "MARKETPLACE"));
test("OTHER → OTHER", () => strictEqual(classifyOrderSource("OTHER"), "OTHER"));
test("unknown value → OTHER", () => strictEqual(classifyOrderSource("RANDOM"), "OTHER"));
test("empty string → OTHER", () => strictEqual(classifyOrderSource(""), "OTHER"));
test("case-insensitive: online → ONLINE", () => strictEqual(classifyOrderSource("online"), "ONLINE"));
test("case-insensitive: tatap_muka → KASIR", () => strictEqual(classifyOrderSource("tatap_muka"), "KASIR"));
test("case-insensitive: marketplace → MARKETPLACE", () => strictEqual(classifyOrderSource("marketplace"), "MARKETPLACE"));

// ── 2. buildN8nPayload ──────────────────────────────────────────────────────
const makeOrder = (ov = {}) => ({
    id: "order-abc", invoice: "AFA-20260928-000001", publicToken: null,
    customer: "Budi", phone: "08123", source: "ONLINE",
    total: 170000, subtotal: 150000, shipping: 20000, discount: 0,
    paymentMethod: "QRIS", paymentStatus: "PENDING", status: "PENDING",
    items: [
        { name: "Sosis", quantity: 2, price: 50000, unitPrice: 50000, subtotal: 100000 },
        { name: "Minum", quantity: 1, price: 50000, unitPrice: null,  subtotal: 50000  },
    ],
    createdAt: new Date("2026-09-28T10:00:00.000Z"),
    ...ov,
});

test("event is ORDER_CREATED", () => strictEqual(buildN8nPayload(makeOrder()).event, "ORDER_CREATED"));
test("eventId is stable and deterministic: ORDER_CREATED:<invoice>", () => {
    strictEqual(buildN8nPayload(makeOrder()).eventId, "ORDER_CREATED:AFA-20260928-000001");
});
test("eventId is identical on repeated calls (deduplication safe)", () => {
    const o = makeOrder();
    strictEqual(buildN8nPayload(o).eventId, buildN8nPayload(o).eventId);
});
test("source classified for ONLINE order", () => strictEqual(buildN8nPayload(makeOrder({ source: "ONLINE" })).source, "ONLINE"));
test("rawSource preserves DB value", () => strictEqual(buildN8nPayload(makeOrder({ source: "TATAP_MUKA" })).rawSource, "TATAP_MUKA"));
test("TATAP_MUKA source classified as KASIR", () => strictEqual(buildN8nPayload(makeOrder({ source: "TATAP_MUKA" })).source, "KASIR"));
test("MARKETPLACE source stays MARKETPLACE (not SALES)", () => strictEqual(buildN8nPayload(makeOrder({ source: "MARKETPLACE" })).source, "MARKETPLACE"));

test("orderLink uses /payment when no publicToken", () => {
    const p = buildN8nPayload(makeOrder({ publicToken: null }), "https://afastore.online");
    strictEqual(p.orderLink, "https://afastore.online/payment/AFA-20260928-000001");
});
test("orderLink uses /pesanan when publicToken present", () => {
    const p = buildN8nPayload(makeOrder({ publicToken: "tok_abc" }), "https://afastore.online");
    strictEqual(p.orderLink, "https://afastore.online/pesanan/tok_abc");
});
test("trailing slash on siteUrl stripped", () => {
    const p = buildN8nPayload(makeOrder({ publicToken: "t" }), "https://afastore.online/");
    ok(!p.orderLink.includes("//pesanan"));
});
test("items: unitPrice null falls back to price", () => {
    const p = buildN8nPayload(makeOrder(), "https://afastore.online");
    deepStrictEqual(p.items[0], { name: "Sosis", quantity: 2, unitPrice: 50000, subtotal: 100000 });
    deepStrictEqual(p.items[1], { name: "Minum", quantity: 1, unitPrice: 50000, subtotal: 50000 });
});
test("monetary fields preserved", () => {
    const p = buildN8nPayload(makeOrder(), "https://afastore.online");
    strictEqual(p.total, 170000); strictEqual(p.subtotal, 150000);
    strictEqual(p.shipping, 20000); strictEqual(p.discount, 0);
});
test("createdAt is ISO-8601", () => {
    strictEqual(buildN8nPayload(makeOrder(), "https://afastore.online").createdAt, "2026-09-28T10:00:00.000Z");
});
test("issuedAt is parseable ISO-8601", () => {
    ok(!isNaN(Date.parse(buildN8nPayload(makeOrder(), "https://afastore.online").issuedAt)));
});

// ── 3. lib static analysis ──────────────────────────────────────────────────
test("lib: exports classifyOrderSource", () => match(libSrc, /export function classifyOrderSource/));
test("lib: exports buildN8nPayload", () => match(libSrc, /export function buildN8nPayload/));
test("lib: exports fireN8nWebhook", () => match(libSrc, /export async function fireN8nWebhook/));
test("lib: fireN8nWebhook has try/catch (never throws)", () => match(libSrc, /try\s*\{[\s\S]*?catch/));
test("lib: no-op when N8N_WEBHOOK_URL absent", () => {
    match(libSrc, /N8N_WEBHOOK_URL/);
    match(libSrc, /if\s*\(!webhookUrl\)\s*return/);
});
test("lib: outbound secret header X-AFA-Webhook-Secret", () => match(libSrc, /X-AFA-Webhook-Secret/));
test("lib: 10-second timeout on fetch", () => match(libSrc, /AbortSignal\.timeout\(10[_]?000\)/));
test("lib: no @/ path aliases (portable)", () => doesNotMatch(libSrc, /from "@\//));
test("lib: no server-only import", () => doesNotMatch(libSrc, /import.*server-only|from\s+["']server-only["']/));
test("lib: SOURCE_MAP covers all five DB values", () => {
    match(libSrc, /TATAP_MUKA/); match(libSrc, /MARKETPLACE/);
    match(libSrc, /WHATSAPP/);   match(libSrc, /ONLINE/); match(libSrc, /OTHER/);
});
test("lib: MARKETPLACE maps to MARKETPLACE (not SALES)", () => {
    // Verify SOURCE_MAP entry maps MARKETPLACE → "MARKETPLACE", not "SALES"
    match(libSrc, /MARKETPLACE:\s*"MARKETPLACE"/);
    doesNotMatch(libSrc, /MARKETPLACE:\s*"SALES"/);
});
test("lib: eventId field in N8nWebhookPayload type", () => match(libSrc, /eventId/));
test("lib: eventId is ORDER_CREATED:<invoice> format", () => match(libSrc, /ORDER_CREATED:\$\{order\.invoice\}/));

// ── 4. Inbound webhook route static analysis ────────────────────────────────
test("route: GET handler exported", () => match(routeSrc, /export async function GET/));
test("route: POST handler exported", () => match(routeSrc, /export async function POST/));
test("route: validateSecret function present", () => match(routeSrc, /validateSecret/));
test("route: returns 401 when auth fails", () => match(routeSrc, /status.*401/));
test("route: accepts Authorization: Bearer", () => match(routeSrc, /bearer/i));
test("route: accepts X-AFA-Webhook-Secret header (same header as outbound)", () => match(routeSrc, /x-afa-webhook-secret/i));
test("route: includes eventId in polling response", () => match(routeSrc, /eventId/));
test("route: GET returns orders array", () => match(routeSrc, /orders.*payload/));
test("route: GET uses ?since param for time filter", () => {
    match(routeSrc, /since/); match(routeSrc, /createdAt.*gte/);
});
test("route: GET defaults to 60-minute window", () => match(routeSrc, /60\s*\*\s*60\s*\*\s*1000/));
test("route: GET capped at 50 orders", () => match(routeSrc, /take.*50/));
test("route: no-store cache header", () => match(routeSrc, /no-store/));
test("route: POST returns ok+receivedAt", () => {
    match(routeSrc, /ok.*true/); match(routeSrc, /receivedAt/);
});
test("route: fail-closed when secret absent", () => {
    match(routeSrc, /!secret.*trim\(\)\.length|secret.*trim.*length.*===.*0/);
});
test("route: imports classifyOrderSource from lib", () => {
    match(routeSrc, /from "@\/lib\/n8n-webhook"/);
    match(routeSrc, /classifyOrderSource/);
});
test("route: runtime = nodejs", () => match(routeSrc, /runtime.*=.*"nodejs"/));
test("route: orderLink uses /pesanan/ with publicToken", () => match(routeSrc, /\/pesanan\//));
test("route: orderLink falls back to /payment/ for online orders", () => match(routeSrc, /\/payment\//));

// ── 5. Wiring: checkout and kasir routes ────────────────────────────────────
test("checkout: imports fireN8nWebhook from n8n-webhook", () => {
    match(checkoutSrc, /import.*fireN8nWebhook.*from.*n8n-webhook/);
});
test("checkout: imports buildN8nPayload from n8n-webhook", () => {
    match(checkoutSrc, /import.*buildN8nPayload.*from.*n8n-webhook/);
});
test("checkout: fires void fireN8nWebhook (non-blocking)", () => {
    match(checkoutSrc, /void fireN8nWebhook\(/);
});
test("checkout: webhook call before return response", () => {
    const voidIdx = checkoutSrc.indexOf("void fireN8nWebhook(");
    const retIdx  = checkoutSrc.indexOf("return response;");
    ok(voidIdx > 0, "fireN8nWebhook must exist in checkout route");
    ok(retIdx > voidIdx, "return response must come after webhook call");
});
test("kasir: imports fireN8nWebhook from n8n-webhook", () => {
    match(kasirSrc, /import.*fireN8nWebhook.*from.*n8n-webhook/);
});
test("kasir: imports buildN8nPayload from n8n-webhook", () => {
    match(kasirSrc, /import.*buildN8nPayload.*from.*n8n-webhook/);
});
test("kasir: fires void fireN8nWebhook (non-blocking)", () => {
    match(kasirSrc, /void fireN8nWebhook\(/);
});
test("kasir: webhook call before success NextResponse.json", () => {
    const voidIdx   = kasirSrc.indexOf("void fireN8nWebhook(");
    const returnIdx = kasirSrc.indexOf("success: true,\n                orderId: created.order.id");
    ok(voidIdx > 0, "fireN8nWebhook must exist in kasir route");
    ok(returnIdx > voidIdx, "success return must come after webhook call");
});
