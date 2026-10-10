/**
 * pre-order-guest.test.mjs — guest (no-login) Pre-Order contract
 *
 *   • Public endpoints exist, are nodejs runtime, and never require a session.
 *   • Abuse protections: IP rate limit, honeypot, min fill time, per-phone DB caps, replay.
 *   • Items are catalog-only: the browser cannot set name/price (server resolves them).
 *   • Guest POs are created as source WEBSITE / status DRAFT with a public token.
 *   • Tracking is read-only, token-keyed, and the public serializer never leaks internal ids.
 *   • Schema + migration both carry the unique publicToken column.
 *   • Kasir/admin panel can confirm or reject DRAFT POs and sees the Website badge.
 *   • Regular checkout / guest-checkout / webhook flows are untouched.
 *
 * Run: node --test tests/pre-order-guest.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const guestRoute = read("../src/app/api/pre-orders/guest/route.ts");
const trackRoute = read("../src/app/api/pre-orders/track/[publicToken]/route.ts");
const guestLib = read("../src/lib/pre-order-guest.ts");
const poLib = read("../src/lib/pre-order.ts");
const schema = read("../prisma/schema.prisma");
const migration = read("../prisma/migrations/20261010000000_add_pre_orders/migration.sql");
const formPage = read("../src/app/pre-order/page.tsx");
const trackPage = read("../src/app/pre-order/[publicToken]/page.tsx");
const form = read("../src/components/pre-order/GuestPreOrderForm.tsx");
const summary = read("../src/components/pre-order/GuestPreOrderSummary.tsx");
const shared = read("../src/components/pre-order/guest-pre-order-shared.ts");
const kasirPanel = read("../src/components/admin/kasir/KasirPreOrderPanel.tsx");
const proxy = read("../src/proxy.ts");
const footer = read("../src/components/premium-footer.tsx");

// ── Schema / migration ───────────────────────────────────────────────────────
test("PreOrder.publicToken is optional + unique in schema and migration", () => {
    const model = schema.slice(schema.indexOf("model PreOrder {"), schema.indexOf("model PreOrderItem {"));
    assert.match(model, /publicToken\s+String\?\s+@unique/);
    assert.match(migration, /"publicToken" TEXT,/);
    assert.match(migration, /CREATE UNIQUE INDEX "pre_orders_publicToken_key" ON "pre_orders"\("publicToken"\);/);
});

// ── Service layer ────────────────────────────────────────────────────────────
test("token is 24 random bytes base64url and only set when requested", () => {
    assert.match(poLib, /import \{ randomBytes \} from "node:crypto";/);
    assert.match(poLib, /randomBytes\(24\)\.toString\("base64url"\)/);
    assert.match(poLib, /publicToken: input\.withPublicToken \? generatePreOrderPublicToken\(\) : null/);
});

test("public lookup validates token shape and excludes soft-deleted POs", () => {
    assert.match(poLib, /\/\^\[A-Za-z0-9_-\]\{20,80\}\$\/\.test\(publicToken\)/);
    assert.match(poLib, /findFirst\(\{ where: \{ publicToken, deletedAt: null \}/);
});

test("public serializer never leaks internal ids, operators or non-verified ledger rows", () => {
    const fn = poLib.slice(poLib.indexOf("export function serializePublicPreOrder"), poLib.indexOf("export type SerializedPublicPreOrder"));
    assert.doesNotMatch(fn, /\bid: po\.id/);
    assert.doesNotMatch(fn, /publicToken/);
    assert.doesNotMatch(fn, /phone/);
    assert.doesNotMatch(fn, /createdById|userId|verifiedById|receivedById/);
    assert.match(fn, /\.filter\(\(row\) => row\.status === "VERIFIED"\)/);
    assert.match(fn, /poNumber: po\.poNumber/);
});

// ── Guest endpoint ───────────────────────────────────────────────────────────
test("guest endpoint is public nodejs route with no session requirement", () => {
    assert.match(guestRoute, /export const runtime = "nodejs";/);
    assert.match(guestRoute, /export async function POST\(request: Request\)/);
    assert.doesNotMatch(guestRoute, /getCurrentUser|getCurrentCustomer|getCurrentCashier|getCurrentAdmin/);
});

test("guest endpoint layers IP limit, honeypot, min fill time, phone caps and replay", () => {
    assert.match(guestRoute, /if \(!checkIpRateLimit\(ip\)\) return reject\(.*429, \{ "Retry-After": "600" \}\)/);
    assert.match(guestRoute, /typeof body\.website === "string" && body\.website\.trim\(\) !== ""/);
    assert.match(guestRoute, /Date\.now\(\) - startedAt < GUEST_PO_MIN_FILL_MS/);
    assert.match(guestRoute, /const caps = await checkPhoneCaps\(phone\);/);
    assert.match(guestRoute, /if \(!caps\.ok\) return reject\(caps\.message, 429\)/);
    assert.match(guestRoute, /readReplay\(replayKey\)/);
    assert.match(guestRoute, /writeReplay\(replayKey, po\.id\)/);
    // Replay check runs BEFORE the phone caps so a retried submission never trips the cap.
    assert.ok(guestRoute.indexOf("readReplay(replayKey)") < guestRoute.indexOf("checkPhoneCaps(phone)"));
});

test("guest items are catalog-only: price/name placeholders, strict productId + qty", () => {
    assert.match(guestRoute, /\/\^\[a-z0-9_-\]\{10,64\}\$\/i\.test\(productId\)/);
    assert.match(guestRoute, /quantity < 1 \|\| quantity > GUEST_PO_MAX_QTY_PER_ITEM/);
    assert.match(guestRoute, /items\.push\(\{ productId, name: "-", quantity, price: 0, notes \}\)/);
    assert.doesNotMatch(guestRoute, /body\.discount|discount:/);
    assert.doesNotMatch(guestRoute, /price: row\.price|price: Number\(row\.price\)/);
});

test("guest PO is WEBSITE + DRAFT + public token, no user binding", () => {
    assert.match(guestRoute, /source: "WEBSITE"/);
    assert.match(guestRoute, /initialStatus: "DRAFT"/);
    assert.match(guestRoute, /withPublicToken: true/);
    assert.match(guestRoute, /userId: null/);
    assert.match(guestRoute, /serializePublicPreOrder\(po\)/);
    assert.doesNotMatch(guestRoute, /serializePreOrder\(/);
    assert.match(guestRoute, /"Cache-Control": "no-store"/);
});

test("guest limits are sane and mirrored by the form", () => {
    assert.match(guestLib, /GUEST_PO_IP_MAX = 5;/);
    assert.match(guestLib, /GUEST_PO_MAX_OPEN_DRAFTS_PER_PHONE = 3;/);
    assert.match(guestLib, /GUEST_PO_MAX_PER_PHONE_PER_DAY = 5;/);
    assert.match(guestLib, /GUEST_PO_MIN_FILL_MS = 3_000;/);
    assert.match(guestLib, /GUEST_PO_MAX_ITEMS = 20;/);
    assert.match(guestLib, /GUEST_PO_MAX_QTY_PER_ITEM = 200;/);
    assert.match(guestLib, /GUEST_PO_MAX_PICKUP_DAYS_AHEAD = 90;/);
    assert.match(shared, /GUEST_FORM_MAX_QTY = 200;/);
    assert.match(shared, /GUEST_FORM_MAX_ITEMS = 20;/);
    assert.match(shared, /GUEST_FORM_MAX_PICKUP_DAYS = 90;/);
    assert.match(guestLib, /import "server-only";/);
});

test("phone caps count only WEBSITE source so kasir/admin POs never block a customer", () => {
    assert.match(guestLib, /source: "WEBSITE", status: "DRAFT", deletedAt: null/);
    assert.match(guestLib, /source: "WEBSITE", createdAt: \{ gte: since \}, deletedAt: null/);
});

// ── Tracking endpoint + page ─────────────────────────────────────────────────
test("tracking endpoint is GET-only, public and token-keyed", () => {
    assert.match(trackRoute, /export async function GET\(/);
    assert.doesNotMatch(trackRoute, /export async function (POST|PATCH|PUT|DELETE)/);
    assert.doesNotMatch(trackRoute, /getCurrentUser|getCurrentCustomer|getCurrentCashier/);
    assert.match(trackRoute, /getPreOrderByPublicToken\(publicToken\)/);
    assert.match(trackRoute, /serializePublicPreOrder\(po\)/);
});

test("tracking page is dynamic, 404s on bad token and uses the public serializer only", () => {
    assert.match(trackPage, /export const dynamic = "force-dynamic";/);
    assert.match(trackPage, /if \(!record\) notFound\(\);/);
    assert.match(trackPage, /serializePublicPreOrder\(record\)/);
    assert.doesNotMatch(trackPage, /serializePreOrder\(/);
    assert.match(trackPage, /whatsappUrl\(/);
});

// ── Form ─────────────────────────────────────────────────────────────────────
test("form posts only productId/quantity per item plus honeypot + startedAt", () => {
    assert.match(form, /fetch\("\/api\/pre-orders\/guest"/);
    assert.match(shared, /items: input\.lines\.map\(\(l\) => \(\{ productId: l\.productId, quantity: l\.quantity, notes: l\.notes\.trim\(\) \|\| undefined \}\)\)/);
    assert.doesNotMatch(shared, /price/);
    assert.match(shared, /startedAt: input\.startedAt/);
    assert.match(shared, /website: input\.website/);
    assert.match(summary, /aria-hidden="true" className="absolute -left-\[9999px\]/);
    assert.match(form, /router\.push\(`\/pre-order\/\$\{encodeURIComponent\(data\.publicToken\)\}\?baru=1`\)/);
    // startedAt is set on mount (not during render) — react-hooks/purity.
    assert.match(form, /useEffect\(\(\) => \{ startedAt\.current = Date\.now\(\); \}, \[\]\);/);
});

test("form page is public (not behind the auth proxy) and linked from the footer", () => {
    assert.doesNotMatch(proxy, /"\/pre-order"/);
    assert.match(proxy, /\["\/account", "\/cart", "\/checkout"\]/);
    assert.match(formPage, /import GuestPreOrderForm from "@\/components\/pre-order\/GuestPreOrderForm";/);
    assert.match(footer, /<Link href="\/pre-order"/);
});

// ── Kasir / admin visibility ─────────────────────────────────────────────────
test("kasir panel exposes draft filter, Website badge and confirm/cancel for DRAFT", () => {
    assert.match(kasirPanel, /\{ id: "draft", label: "Menunggu Konfirmasi" \}/);
    assert.match(kasirPanel, /po\.source === "WEBSITE" \? <span[^>]*>Website<\/span> : null/);
    assert.match(kasirPanel, /po\.status === "DRAFT" \? \(/);
    assert.match(kasirPanel, /changeStatus\("CONFIRMED"/);
    assert.match(kasirPanel, /changeStatus\("CANCELLED"/);
    assert.match(kasirPanel, /method: "PATCH", body: JSON\.stringify\(\{ status \}\)/);
    // Admin/kasir serializer keeps publicToken so staff can share the tracking link.
    assert.match(poLib, /publicToken: po\.publicToken,/);
});

// ── Isolation ────────────────────────────────────────────────────────────────
test("guest PO code never touches Order / Payment / checkout / webhook tables", () => {
    for (const src of [guestRoute, trackRoute, guestLib]) {
        assert.doesNotMatch(src, /prisma\.order\b|prisma\.payment\b|prisma\.cartItem|prisma\.product\.update|checkoutIdempotency|midtrans/i);
    }
    assert.doesNotMatch(guestLib, /prisma\.(?!preOrder)/);
});

// ── Server price resolution regression coverage ──────────────────────────────
test("guest items are resolved by Product.id and server price, never browser price", () => {
    assert.match(poLib, /where: \{ id: \{ in: productIds \} \}/);
    assert.match(poLib, /select: \{ id: true, name: true, price: true, isActive: true \}/);
    assert.match(poLib, /const price = Number\(product\.price\)/);
    assert.match(poLib, /item\.subtotal = price \* item\.quantity/);
    assert.match(poLib, /allowZeroTotal: true/);
    assert.doesNotMatch(poLib, /item\.price\s*=\s*Number\(.*input|body\.price/);
});

test("server rejects missing, inactive, invalid-price products instead of producing zero total", () => {
    assert.match(poLib, /Produk dengan ID.*tidak ditemukan/);
    assert.match(poLib, /Produk.*sedang tidak aktif/);
    assert.match(poLib, /Harga produk.*tidak valid/);
    assert.match(poLib, /price <= 0/);
    assert.match(poLib, /subtotal <= 0/);
});

test("quantity multiplication and numeric Decimal/string normalization are explicit", () => {
    assert.match(poLib, /const price = Number\(product\.price\)/);
    assert.match(poLib, /item\.subtotal = price \* item\.quantity/);
    assert.match(poLib, /Number\.isSafeInteger\(price\)/);
});
