/**
 * guest-cart-store.test.mjs — Static contract for src/lib/guest-cart-store.ts
 *
 * Contract:
 *   • persist ONLY { productId, qty } — never price/name/image/subtotal
 *   • merge duplicate productIds by summing qty (add + read path)
 *   • reject qty <= 0 / non-integer / non-string productId
 *   • never throw on missing / malformed / disabled localStorage
 *   • storage key is stable and versioned: "afa_guest_cart_v1"
 *   • no server-only marker (module must be client-safe)
 *
 * Run: node --test tests/guest-cart-store.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/lib/guest-cart-store.ts", import.meta.url), "utf8");

// ── Static contract ─────────────────────────────────────────────────────────
test("storage key is versioned: afa_guest_cart_v1", () => {
    assert.match(src, /GUEST_CART_STORAGE_KEY = "afa_guest_cart_v1"/);
});
test("only { productId, qty } is serialised (no price/name/image/slug leak)", () => {
    assert.match(src, /\{ productId, qty \}/);
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const spoof of ["price", "image", "name", "slug", "subtotal"]) {
        assert.doesNotMatch(codeOnly, new RegExp(`${spoof}:\\s*(entry|item)\\.`));
    }
});
test("normalizeEntry rejects qty <= 0, non-integer, and empty productId", () => {
    assert.match(src, /!Number\.isInteger\(entry\.qty\) \|\| entry\.qty < 1/);
    assert.match(src, /typeof entry\.productId !== "string"/);
});
test("module is NOT marked server-only (client-safe by design)", () => {
    assert.doesNotMatch(src, /import "server-only"/);
});
test("every localStorage access is behind safeLocalStorage()", () => {
    assert.match(src, /function safeLocalStorage\(\)/);
    const direct = src.match(/window\.localStorage/g) || [];
    assert.equal(direct.length, 1, "window.localStorage may appear only once (inside safeLocalStorage)");
});
test("SSR guard: typeof window === 'undefined' returns null", () => {
    assert.match(src, /typeof window === "undefined"\s*\)\s*return null/);
});
test("read/write/add/update/remove/clear are all exported", () => {
    for (const fn of [
        "readGuestCart",
        "writeGuestCart",
        "addToGuestCart",
        "updateGuestCartQty",
        "removeFromGuestCart",
        "clearGuestCart",
    ]) {
        assert.match(src, new RegExp(`export function ${fn}\\b`), `missing exported function ${fn}`);
    }
});
test("readGuestCart merges duplicate productIds via a Map (sum qty)", () => {
    assert.match(src, /grouped\.set\(entry\.productId, \(grouped\.get\(entry\.productId\) \?\? 0\) \+ entry\.qty\)/);
});
test("readGuestCart returns [] on malformed JSON (try/catch fallback)", () => {
    assert.match(src, /try\s*\{[\s\S]*?JSON\.parse\(raw\)[\s\S]*?\}\s*catch\s*\{\s*return \[\];\s*\}/);
});
test("writeGuestCart swallows QuotaExceededError via inner try/catch", () => {
    assert.match(src, /try\s*\{\s*storage\.setItem\(GUEST_CART_STORAGE_KEY[\s\S]*?\}\s*catch/);
});
test("clearGuestCart calls removeItem (not setItem with empty array)", () => {
    assert.match(src, /storage\.removeItem\(GUEST_CART_STORAGE_KEY\)/);
});
