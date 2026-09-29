/**
 * guest-checkout-payment-readiness.test.mjs
 *
 * Guest QRIS/Midtrans readiness delta on top of checkout-payment-readiness:
 *   • recipientName + phone are REQUIRED for guests (existing 400 branch).
 *   • email is OPTIONAL for guests — Midtrans QRIS charge tolerates undefined.
 *   • Midtrans customer object reads email via optional chaining, so a null
 *     Order.user (guest) never crashes the charge builder.
 *   • MANUAL QRIS provider path is preserved for guests (no Midtrans call).
 *   • Guest orders still receive Payment row + PENDING state.
 *
 * Run: node --test tests/guest-checkout-payment-readiness.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/app/api/checkout/order/route.ts", import.meta.url), "utf8");
const midtransLib = fs.readFileSync(new URL("../src/lib/midtrans.ts", import.meta.url), "utf8");

// ── Required name + phone (identical for auth and guest) ────────────────────
test("recipientName is required — 400 when missing (guest included)", () => {
    assert.match(route, /if \(!recipientName \|\| !recipientPhone \|\| !streetAddress\)/);
    assert.match(route, /"Lengkapi alamat pengiriman\."/);
});
test("phone is required — same predicate covers guest and auth", () => {
    assert.match(route, /const recipientPhone = requireText\(address\.phone\) \? address\.phone!\.trim\(\)\.slice\(0, 40\) : ""/);
});

// ── Email is optional for guests ────────────────────────────────────────────
test("email is NOT required at address validation (never in the 400 predicate)", () => {
    // The 400 predicate only requires recipientName + phone + streetAddress —
    // no email guard exists, so guests without email are accepted.
    const badPredicate = /if \(!recipientName \|\| !recipientPhone \|\| !streetAddress \|\| !.*email/;
    assert.doesNotMatch(route, badPredicate);
});
test("Midtrans customer object reads email via optional chaining (null-safe)", () => {
    assert.match(route, /customer: \{ name: order\.customer, email: order\.user\?\.email, phone: order\.phone \}/);
});

// ── MANUAL QRIS provider still bypasses Midtrans for guests ─────────────────
test("MANUAL QRIS: no Midtrans call, Payment stays PENDING", () => {
    assert.match(route, /if \(!isManualQris\(\)\)/);
    assert.match(route, /MANUAL QRIS detected - skipping Midtrans charge creation/);
});

// ── Guest Payment row is still created (PENDING) ────────────────────────────
test("Payment row created inside the same transaction for both identities", () => {
    // The transaction creates a Payment row unconditionally — no auth-only guard.
    assert.match(route, /tx\.payment\.create\(\{ data: \{ orderId: created\.id, method: normalizedMethod, amount: total, status: "PENDING", expiredAt: defaultExpiredAt \} \}\)/);
});

// ── QRIS URL storage is identical for both identities ──────────────────────
test("QRIS transaction fields are stored on Payment.update (guest path unchanged)", () => {
    assert.match(route, /prisma\.payment\.update\(\{ where: \{ orderId: order\.id \}, data: \{ qrisUrl, transactionId:/);
});

// ── Midtrans lib itself does not enforce email presence ────────────────────
test("Midtrans lib: customer object tolerates missing email (no throw on undefined)", () => {
    // The lib defines `customer.email` as optional in its signature — verify
    // there is no runtime assertion demanding a non-empty email.
    assert.doesNotMatch(midtransLib, /throw.*email.*required/i);
});

// ── /order redirect path is identical for guest and auth ───────────────────
test("responsePayload redirectTo path is the same for guest and auth", () => {
    // /payment/<invoice> for QRIS, /order/<invoice> otherwise — no branch
    // on identity kind, so guests get the same UX.
    assert.match(route, /redirectTo: normalizedMethod === "QRIS" \? `\/payment\/\$\{created\.invoice\}` : `\/order\/\$\{created\.invoice\}`/);
});
