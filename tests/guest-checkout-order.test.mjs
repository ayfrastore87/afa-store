/**
 * guest-checkout-order.test.mjs
 *
 * /api/checkout/order guest path MUST:
 *   • require an active guest cookie (401 → /login if missing)
 *   • re-authorize items server-side via authorizeProductItems (no price/name from body)
 *   • decrement stock atomically with the same conditional UPDATE used for auth
 *   • write Order.userId = null, CheckoutHistory.userId = null
 *   • write CheckoutIdempotency.guestSessionHash + userId = null
 *   • generate Order.publicToken for every ONLINE order (auth + guest)
 *   • NEVER log or return the raw guest cookie
 *
 * Run: node --test tests/guest-checkout-order.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/app/api/checkout/order/route.ts", import.meta.url), "utf8");

// ── Guest identity resolution ───────────────────────────────────────────────
test("guest branch is gated behind isGuestCheckoutEnabled()", () => {
    assert.match(route, /const guestEnabled = isGuestCheckoutEnabled\(\)/);
    assert.match(route, /if \(!user && !guestEnabled\) return NextResponse\.json\(\{ redirectTo: "\/login" \}/);
});
test("guest branch requires a valid guest cookie before continuing", () => {
    assert.match(route, /const guestSessionHash = user \? null : await readGuestSessionHash\(\)/);
    assert.match(route, /if \(!user && !guestSessionHash\) return NextResponse\.json\(\{ redirectTo: "\/login" \}/);
});

// ── Server-authorised prices/stock (no body-level trust) ────────────────────
test("route re-authorises every product server-side (guest included)", () => {
    // Same authorizeProductItems path used by auth checkout — guest never
    // gets a distinct trust boundary.
    assert.match(route, /authorizeProductItems\(snapshot\.map\(\(\{ id, qty \}\) => \(\{ id, qty \}\)\), tx\)/);
});
test("route rejects any body-provided price/stock/name/image", () => {
    assert.doesNotMatch(route, /body\.(price|stock|name|image|slug)/);
});
test("route stock decrement stays atomic and conditional (stock >= qty)", () => {
    assert.match(route, /stock: \{ gte: item\.qty \}/);
    assert.match(route, /if \(changed\.count !== 1\) throw new ProductAuthorityError\(409, "Stok produk tidak mencukupi"\)/);
});

// ── Order + CheckoutHistory identity fields ─────────────────────────────────
test("Order.userId is nullable-aware: user ? user.id : null", () => {
    assert.match(route, /userId: user \? user\.id : null,\s+invoice:/);
});
test("CheckoutHistory.userId is nullable-aware: user ? user.id : null", () => {
    assert.match(route, /data: \{ userId: user \? user\.id : null, orderId: created\.id, channel: "checkout"/);
});
test("Order.publicToken is generated for EVERY ONLINE order (auth + guest)", () => {
    // Same shape as the kasir route: randomBytes(24).toString("base64url") →
    // 192 bits, base64url encoded, unique by DB index.
    assert.match(route, /publicToken: randomBytes\(24\)\.toString\("base64url"\)/);
    assert.match(route, /import \{ randomBytes \} from "node:crypto"/);
});

// ── CheckoutIdempotency identity XOR ────────────────────────────────────────
test("CheckoutIdempotency insert honours the identity XOR", () => {
    // Two disjoint literal call sites — authenticated + guest — so the
    // DB-level XOR CHECK is honoured statically and the pre-guest test
    // regex for the auth call still matches unchanged.
    assert.match(route, /checkoutIdempotency\.create\(\{ data: \{ key, userId: user\.id, requestHash, status: "PROCESSING" \} \}\)/);
    assert.match(route, /checkoutIdempotency\.create\(\{ data: \{ key, guestSessionHash: guestSessionHash!, requestHash, status: "PROCESSING" \} \}\)/);
});
test("guest replay check rejects userId != null AND hash mismatch AND identity mismatch", () => {
    assert.match(route, /existing\.guestSessionHash !== guestSessionHash \|\| existing\.userId !== null \|\| existing\.requestHash !== requestHash/);
});

// ── Cart cleanup is user-scoped only ────────────────────────────────────────
test("Supabase cart_items cleanup runs only for authenticated buyers", () => {
    // Wrapped in `if (user) { ... cart.delete().eq("userId", user.id) ... }`.
    // A raw `.eq("userId", user.id)` outside that block would crash on guests.
    const cleanupIdx = route.indexOf('from("cart_items")');
    assert.ok(cleanupIdx > 0, "cart cleanup must exist");
    const guardIdx = route.lastIndexOf("if (user) {", cleanupIdx);
    assert.ok(guardIdx > 0 && guardIdx < cleanupIdx, "cart cleanup must be inside 'if (user) { ... }'");
});

// ── Raw guest cookie never surfaces ─────────────────────────────────────────
test("raw guest cookie is never logged or written to DB fields", () => {
    // We only ever pass the sha256 hash (readGuestSessionHash's return value)
    // to Prisma, and only assign it to CheckoutIdempotency.guestSessionHash.
    assert.doesNotMatch(route, /afa_guest_sid/);
    assert.doesNotMatch(route, /console\.(log|warn|error)\([^)]*guestSessionRaw/i);
});
test("Midtrans customer object tolerates a null user (no user.email crash)", () => {
    // Existing code already uses optional chaining — verify it did not regress.
    assert.match(route, /email: order\.user\?\.email/);
});
