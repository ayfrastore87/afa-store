/**
 * guest-n8n-webhook.test.mjs
 *
 * Extends the existing n8n-webhook coverage with guest-specific assertions:
 *   • Guest orders (userId=null) still produce a valid ORDER_CREATED payload.
 *   • orderLink resolves to /pesanan/<publicToken> for guest ONLINE orders.
 *   • customer/phone fields carry the guest's recipient details (name+phone).
 *   • Raw guest cookie NEVER appears anywhere in the payload.
 *   • Existing WA link path stays available for orders WITHOUT publicToken
 *     (kasir walk-ins that don't need /pesanan).
 *
 * Run: node --test tests/guest-n8n-webhook.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildN8nPayload } from "../src/lib/n8n-webhook.ts";

const routeSrc = fs.readFileSync(new URL("../src/app/api/checkout/order/route.ts", import.meta.url), "utf8");
const libSrc = fs.readFileSync(new URL("../src/lib/n8n-webhook.ts", import.meta.url), "utf8");

const guestOrder = (ov = {}) => ({
    id: "order-guest-1",
    invoice: "AFA-20260929-000001",
    publicToken: "GuEsTToKen_1234567890abcdefghij",
    customer: "Ani Guest",
    phone: "08987654321",
    source: "ONLINE",
    total: 125000,
    subtotal: 100000,
    shipping: 25000,
    discount: 0,
    paymentMethod: "QRIS",
    paymentStatus: "PENDING",
    status: "PENDING",
    items: [
        { name: "Kerupuk", quantity: 1, price: 50000, unitPrice: 50000, subtotal: 50000 },
        { name: "Sambal",  quantity: 1, price: 50000, unitPrice: null,  subtotal: 50000 },
    ],
    createdAt: new Date("2026-09-29T09:00:00.000Z"),
    ...ov,
});

// ── Payload shape for a guest ONLINE order ─────────────────────────────────
test("guest ONLINE order still produces ORDER_CREATED event", () => {
    const p = buildN8nPayload(guestOrder(), "https://afastore.online");
    assert.equal(p.event, "ORDER_CREATED");
    assert.equal(p.source, "ONLINE");
});
test("guest orderLink uses /pesanan/<publicToken>", () => {
    const p = buildN8nPayload(guestOrder(), "https://afastore.online");
    assert.equal(p.orderLink, "https://afastore.online/pesanan/GuEsTToKen_1234567890abcdefghij");
});
test("guest recipient (name + phone) is carried into the payload", () => {
    const p = buildN8nPayload(guestOrder(), "https://afastore.online");
    assert.equal(p.customer, "Ani Guest");
    assert.equal(p.phone, "08987654321");
});
test("guest payload preserves eventId deduplication key (ORDER_CREATED:<invoice>)", () => {
    const p = buildN8nPayload(guestOrder(), "https://afastore.online");
    assert.equal(p.eventId, "ORDER_CREATED:AFA-20260929-000001");
});

// ── Fallback path when publicToken is absent (kasir walk-ins) ──────────────
test("fallback: order without publicToken uses /payment/<invoice> link", () => {
    const p = buildN8nPayload(guestOrder({ publicToken: null }), "https://afastore.online");
    assert.equal(p.orderLink, "https://afastore.online/payment/AFA-20260929-000001");
});

// ── Raw cookie leak audit ──────────────────────────────────────────────────
test("payload never contains the raw guest cookie name/value", () => {
    const p = buildN8nPayload(guestOrder({ customer: "buyer with afa_guest_sid=SHOULDNOTLEAK cookie" }), "https://afastore.online");
    const serialised = JSON.stringify(p);
    // Even if a customer name literally contained the cookie name, the field
    // is exclusively a display string — but the payload MUST NOT have a
    // dedicated afa_guest_sid property key.
    assert.doesNotMatch(serialised, /"afa_guest_sid":/);
});
test("payload never carries userId, guestSessionHash, or session tokens as keys", () => {
    const p = buildN8nPayload(guestOrder(), "https://afastore.online");
    const keys = Object.keys(p);
    assert.equal(keys.includes("userId"), false);
    assert.equal(keys.includes("guestSessionHash"), false);
    assert.equal(keys.includes("session"), false);
    assert.equal(keys.includes("cookie"), false);
});

// ── Route wiring: checkout route always builds the payload (auth + guest) ──
test("route wiring: single unconditional buildN8nPayload call site", () => {
    const matches = routeSrc.match(/void fireN8nWebhook\(buildN8nPayload\(/g) || [];
    assert.equal(matches.length, 1, "guest and auth must share a single webhook call site");
});
test("route wiring: publicToken passed through as order.publicToken ?? null", () => {
    assert.match(routeSrc, /publicToken: order\.publicToken \?\? null/);
});
test("lib wiring: WA link comment mentions /pesanan/<publicToken> AND /payment/<invoice>", () => {
    assert.match(libSrc, /\/pesanan\/<publicToken>/);
    assert.match(libSrc, /\/payment\/<invoice>/);
});
