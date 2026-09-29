/**
 * guest-checkout-session.test.mjs
 *
 * The guest session helper is the ONLY server-side representation of an
 * anonymous buyer's identity. Its security contract MUST hold:
 *   • 32 raw bytes (256 bits) of crypto.randomBytes entropy.
 *   • base64url encoding — cookie-safe, no padding.
 *   • HttpOnly cookie flags: httpOnly + SameSite=lax + Secure in prod + Path=/.
 *   • MaxAge = 7 days (the Buy-Now → Cart → Checkout journey window).
 *   • DB stores sha256(raw).hex (64 lowercase hex chars) — matches the
 *     CheckoutIdempotency_guestSessionHash_shape_chk regex exactly.
 *   • The raw token is never returned to callers or logged.
 *
 * Run: node --test tests/guest-checkout-session.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const src = fs.readFileSync(new URL("../src/lib/guest-checkout-session.ts", import.meta.url), "utf8");

// ── Static contract ─────────────────────────────────────────────────────────
test("module is server-only", () => assert.match(src, /import "server-only";/));
test("uses crypto.randomBytes for entropy (never Math.random)", () => {
    assert.match(src, /randomBytes\(GUEST_TOKEN_BYTES\)\.toString\("base64url"\)/);
    assert.doesNotMatch(src, /Math\.random/);
});
test("entropy budget is 32 raw bytes = 256 bits", () => {
    assert.match(src, /const GUEST_TOKEN_BYTES = 32;/);
});
test("cookie name is afa_guest_sid", () => {
    assert.match(src, /GUEST_SESSION_COOKIE = "afa_guest_sid"/);
});
test("cookie MaxAge is exactly 7 days in seconds", () => {
    assert.match(src, /GUEST_SESSION_MAX_AGE = 60 \* 60 \* 24 \* 7;/);
});
test("cookie is HttpOnly + SameSite=lax + Path=/ + Secure in production only", () => {
    assert.match(src, /httpOnly:\s*true/);
    assert.match(src, /sameSite:\s*"lax"\s*as const/);
    assert.match(src, /path:\s*"\/"/);
    // Secure must be conditional on NODE_ENV — never a hard-coded true in dev,
    // otherwise browsers reject the cookie on http://localhost.
    assert.match(src, /secure:\s*process\.env\.NODE_ENV === "production"/);
});
test("hash function returns sha256 hex (64 lowercase hex chars)", () => {
    assert.match(src, /createHash\("sha256"\)\.update\(rawToken\)\.digest\("hex"\)/);
});
test("readGuestSessionHash defensively validates the cookie shape", () => {
    // Guards against arbitrary cookie payloads sent by a malicious client.
    assert.match(src, /\/\^\[A-Za-z0-9_-\]\{1,128\}\$\//);
});
test("no raw token is ever returned or logged", () => {
    // Only ensureGuestSession's return type carries the hash — the raw token
    // is scoped inside the function and set on the response cookie header.
    assert.doesNotMatch(src, /return\s+\{[^}]*rawToken/);
    assert.doesNotMatch(src, /console\.log\([^)]*raw/i);
    assert.doesNotMatch(src, /console\.warn\([^)]*raw/i);
});

// ── Behavioural: simulate the crypto contract ───────────────────────────────
test("randomBytes(32) yields 43-char base64url (no padding)", () => {
    const token = randomBytes(32).toString("base64url");
    assert.equal(token.length, 43, "base64url length for 32 raw bytes = 43 chars");
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.doesNotMatch(token, /=/);
});
test("two consecutive tokens are distinct (256-bit entropy)", () => {
    const a = randomBytes(32).toString("base64url");
    const b = randomBytes(32).toString("base64url");
    assert.notEqual(a, b);
});
test("sha256(raw).hex is exactly 64 lowercase hex chars — matches DB shape CHECK", () => {
    const raw = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(raw).digest("hex");
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
});
test("same raw token deterministically yields the same hash", () => {
    const raw = "stable-fixture-token";
    const h1 = createHash("sha256").update(raw).digest("hex");
    const h2 = createHash("sha256").update(raw).digest("hex");
    assert.equal(h1, h2);
});
test("different raw tokens yield different hashes (no collision)", () => {
    const h1 = createHash("sha256").update("a").digest("hex");
    const h2 = createHash("sha256").update("b").digest("hex");
    assert.notEqual(h1, h2);
});
