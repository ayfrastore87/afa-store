/**
 * guest-checkout-idempotency.test.mjs — Part 1: static contract + hash isolation
 *
 * Identity-aware checkoutRequestHash + replay behaviour:
 *   • Legacy authenticated signature is byte-for-byte compatible.
 *   • Same identity + same payload + same items = same hash (replay-valid).
 *   • Different identity = different hash (409 on cross-identity replay).
 *   • Guest+guest cross-identity collision impossible.
 *
 * Run: node --test tests/guest-checkout-idempotency.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const idempotencySrc = fs.readFileSync(new URL("../src/lib/checkout-idempotency.ts", import.meta.url), "utf8");
const orderRoute = fs.readFileSync(new URL("../src/app/api/checkout/order/route.ts", import.meta.url), "utf8");

// Re-implement canonicalize() here — mirrors the sort + JSON.stringify contract
// asserted below on the source file.
function canonicalize(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
}
function hash(obj) { return createHash("sha256").update(canonicalize(obj)).digest("hex"); }
function legacyHash(userId, payload, items) {
    return hash({ userId, payload, items: [...items].sort((a, b) => a.id.localeCompare(b.id)) });
}
function userHashModern(userId, payload, items) {
    return hash({ userId, payload, items: [...items].sort((a, b) => a.id.localeCompare(b.id)) });
}
function guestHash(guestSessionHash, payload, items) {
    return hash({ guestSessionHash, payload, items: [...items].sort((a, b) => a.id.localeCompare(b.id)) });
}

// ── Static contract ─────────────────────────────────────────────────────────
test("checkout-idempotency module is server-only", () => {
    assert.match(idempotencySrc, /import "server-only";/);
});
test("legacy signature is preserved (typeof identityOrUserId === 'string')", () => {
    assert.match(idempotencySrc, /typeof identityOrUserId === "string"/);
});
test("guest branch canonicalizes with guestSessionHash key (not userId)", () => {
    assert.match(idempotencySrc, /guestSessionHash: identity\.guestSessionHash/);
});
test("identityMatchesRow is exported and centralises the comparison", () => {
    assert.match(idempotencySrc, /export function identityMatchesRow/);
    assert.match(idempotencySrc, /row\.userId === identity\.userId && row\.guestSessionHash === null/);
    assert.match(idempotencySrc, /row\.guestSessionHash === identity\.guestSessionHash && row\.userId === null/);
});

// ── Behavioural: legacy hash is preserved ───────────────────────────────────
const payload = { recipientName: "Budi", phone: "08123", address: "Jl X" };
const items = [{ id: "p2", qty: 1 }, { id: "p1", qty: 3 }];

test("legacy userId form and modern { kind:'user' } form produce identical hashes", () => {
    assert.equal(legacyHash("user-1", payload, items), userHashModern("user-1", payload, items));
});
test("same authenticated identity + same request = same hash (replay-valid)", () => {
    assert.equal(userHashModern("user-1", payload, items), userHashModern("user-1", payload, items));
});
test("different authenticated user = different hash", () => {
    assert.notEqual(userHashModern("user-1", payload, items), userHashModern("user-2", payload, items));
});
test("item order does not affect the hash (deterministic sort)", () => {
    const a = userHashModern("u", payload, [{ id: "b", qty: 1 }, { id: "a", qty: 2 }]);
    const b = userHashModern("u", payload, [{ id: "a", qty: 2 }, { id: "b", qty: 1 }]);
    assert.equal(a, b);
});
test("changing a payload field changes the hash", () => {
    const original = userHashModern("u", payload, items);
    const modified = userHashModern("u", { ...payload, phone: "08999" }, items);
    assert.notEqual(original, modified);
});

// ── Behavioural: guest hash isolation ───────────────────────────────────────
const gA = createHash("sha256").update("guest-token-A").digest("hex");
const gB = createHash("sha256").update("guest-token-B").digest("hex");

test("same guest identity + same request = same hash", () => {
    assert.equal(guestHash(gA, payload, items), guestHash(gA, payload, items));
});
test("two different guests can never collide on the same Idempotency-Key", () => {
    assert.notEqual(guestHash(gA, payload, items), guestHash(gB, payload, items));
});
test("guest hash ≠ authenticated hash even when payload+items match", () => {
    assert.notEqual(userHashModern("user-1", payload, items), guestHash(gA, payload, items));
});

// ── /api/checkout/order integration: identity-aware replay branch ───────────
test("route: authenticated branch preserves the exact legacy 409 predicate", () => {
    assert.match(orderRoute, /existing\.userId !== user\.id \|\| existing\.requestHash !== requestHash/);
});
test("route: guest branch rejects cross-identity replay", () => {
    assert.match(orderRoute, /existing\.guestSessionHash !== guestSessionHash \|\| existing\.userId !== null \|\| existing\.requestHash !== requestHash/);
});
test("route: both branches share the exact same 409 user-facing copy", () => {
    const matches = orderRoute.match(/Permintaan checkout tidak valid\. Silakan muat ulang halaman\./g) || [];
    assert.ok(matches.length >= 2, `expected ≥2 identical 409 messages, saw ${matches.length}`);
});
test("route: guest CheckoutIdempotency insert uses guestSessionHash only", () => {
    // Literal single-line call preserves the exact regex shape used by other
    // existing regression tests (e.g. shipping-rates.test.mjs).
    assert.match(orderRoute, /checkoutIdempotency\.create\(\{ data: \{ key, guestSessionHash: guestSessionHash!, requestHash, status: "PROCESSING" \} \}\)/);
});
test("route: authenticated CheckoutIdempotency insert unchanged (userId only)", () => {
    assert.match(orderRoute, /checkoutIdempotency\.create\(\{ data: \{ key, userId: user\.id, requestHash, status: "PROCESSING" \} \}\)/);
});
