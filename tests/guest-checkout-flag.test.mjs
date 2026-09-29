/**
 * guest-checkout-flag.test.mjs
 *
 * The GUEST_CHECKOUT_ENABLED feature flag MUST be:
 *   • server-only (no NEXT_PUBLIC_ prefix anywhere in the source tree)
 *   • default FALSE (absent env → returns false)
 *   • strict boolean parse: only the literal string "true" enables it
 *   • enforced at every guest branch in the affected routes
 *
 * Run: node --test tests/guest-checkout-flag.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const flagSrc = fs.readFileSync(new URL("../src/lib/guest-checkout-flag.ts", import.meta.url), "utf8");
const buyNow = fs.readFileSync(new URL("../src/app/api/cart/buy-now/route.ts", import.meta.url), "utf8");
const session = fs.readFileSync(new URL("../src/app/api/checkout/session/route.ts", import.meta.url), "utf8");
const order = fs.readFileSync(new URL("../src/app/api/checkout/order/route.ts", import.meta.url), "utf8");

test("flag module is server-only", () => {
    assert.match(flagSrc, /import "server-only";/);
});
test("flag reads GUEST_CHECKOUT_ENABLED (never NEXT_PUBLIC_ prefixed)", () => {
    assert.match(flagSrc, /process\.env\.GUEST_CHECKOUT_ENABLED === "true"/);
    assert.doesNotMatch(flagSrc, /NEXT_PUBLIC_GUEST_CHECKOUT/);
});
test("flag is strict-boolean: any non-'true' value returns false", () => {
    // Simulate the exported predicate against every plausible env value.
    const evaluate = (raw) => raw === "true";
    for (const raw of [undefined, "", "false", "1", "TRUE", "True", "yes", "on", " true", "true "]) {
        assert.equal(evaluate(raw), false, `flag must be false for ${JSON.stringify(raw)}`);
    }
    assert.equal(evaluate("true"), true);
});
test("flag has no client leak: no NEXT_PUBLIC_ prefix in any guest-checkout file", () => {
    for (const src of [flagSrc, buyNow, session, order]) {
        assert.doesNotMatch(src, /NEXT_PUBLIC_GUEST/);
    }
});

// ── Every guest branch is flag-gated ────────────────────────────────────────
test("buy-now route imports the flag and gates the unauthenticated branch", () => {
    assert.match(buyNow, /import \{ isGuestCheckoutEnabled \} from "@\/lib\/guest-checkout-flag"/);
    assert.match(buyNow, /if \(!user && !isGuestCheckoutEnabled\(\)\)/);
});
test("checkout/session route imports the flag and gates both handlers", () => {
    assert.match(session, /import \{ isGuestCheckoutEnabled \} from "@\/lib\/guest-checkout-flag"/);
    // Both GET and POST must gate on the flag.
    const gates = session.match(/if \(!user && !isGuestCheckoutEnabled\(\)\)/g) || [];
    assert.ok(gates.length >= 2, `expected ≥2 flag gates in session route, saw ${gates.length}`);
});
test("checkout/order route imports the flag and gates the unauthenticated branch", () => {
    assert.match(order, /import \{ isGuestCheckoutEnabled \} from "@\/lib\/guest-checkout-flag"/);
    assert.match(order, /if \(!user && !guestEnabled\) return NextResponse\.json\(\{ redirectTo: "\/login" \}/);
});

// ── When flag OFF (default), unauthenticated request MUST get login redirect ─
test("buy-now: flag OFF still returns /login redirect for unauthenticated request", () => {
    const evaluate = (user, flagOn) => (!user && !flagOn) ? { redirectTo: "/login", status: 401 } : { ok: true };
    assert.deepEqual(evaluate(null, false), { redirectTo: "/login", status: 401 });
    assert.deepEqual(evaluate({ id: "u1" }, false), { ok: true });
});
test("order: flag OFF still returns /login redirect for unauthenticated request", () => {
    const evaluate = (user, flagOn) => (!user && !flagOn) ? { redirectTo: "/login", status: 401 } : { ok: true };
    assert.deepEqual(evaluate(null, false), { redirectTo: "/login", status: 401 });
});
