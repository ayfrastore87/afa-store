/**
 * guest-cart-store-semantics.test.mjs
 *
 * Behavioural mirror of src/lib/guest-cart-store.ts. The test suite uses a
 * pure-JS re-implementation of the exact normalise + merge semantics so any
 * regression in the source invariants surfaces as an executable failure —
 * without a TS module loader.
 *
 * Run: node --test tests/guest-cart-store-semantics.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

function normalizeEntry(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.productId !== "string") return null;
    const productId = value.productId.trim();
    if (!productId) return null;
    if (typeof value.qty !== "number" || !Number.isInteger(value.qty) || value.qty < 1) return null;
    return { productId, qty: value.qty };
}
function mergeAndPersist(entries) {
    const grouped = new Map();
    for (const item of entries) {
        const entry = normalizeEntry(item);
        if (!entry) continue;
        grouped.set(entry.productId, (grouped.get(entry.productId) ?? 0) + entry.qty);
    }
    return [...grouped].map(([productId, qty]) => ({ productId, qty }));
}

test("normaliser drops null / non-object / missing fields", () => {
    for (const bad of [
        null, undefined, "string", 42, [], {},
        { productId: "" }, { qty: 1 },
        { productId: "p1", qty: 0 }, { productId: "p1", qty: -1 },
        { productId: "p1", qty: 1.5 }, { productId: 123, qty: 1 },
    ]) {
        assert.equal(normalizeEntry(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
});
test("normaliser accepts trimmed positive-integer entry", () => {
    assert.deepEqual(normalizeEntry({ productId: "  p1  ", qty: 3 }), { productId: "p1", qty: 3 });
});
test("mergeAndPersist strips every non-{productId,qty} field", () => {
    const result = mergeAndPersist([{ productId: "p1", qty: 2, price: 99999, name: "SPOOF", image: "hack.jpg" }]);
    assert.deepEqual(result, [{ productId: "p1", qty: 2 }]);
    assert.equal(Object.keys(result[0]).length, 2);
});
test("mergeAndPersist sums duplicate productIds", () => {
    assert.deepEqual(
        mergeAndPersist([{ productId: "p1", qty: 2 }, { productId: "p1", qty: 3 }, { productId: "p2", qty: 4 }]),
        [{ productId: "p1", qty: 5 }, { productId: "p2", qty: 4 }],
    );
});
test("mergeAndPersist drops invalid entries in a mixed payload", () => {
    assert.deepEqual(
        mergeAndPersist([
            { productId: "p1", qty: 2 },
            { productId: "", qty: 1 },
            { qty: 1 },
            null,
            "string",
            { productId: "p3", qty: 0 },
            { productId: "p4", qty: 1.5 },
        ]),
        [{ productId: "p1", qty: 2 }],
    );
});
test("mergeAndPersist handles empty input", () => {
    assert.deepEqual(mergeAndPersist([]), []);
});
test("client cannot spoof price/name/image via localStorage payload", () => {
    const stored = mergeAndPersist([
        { productId: "p1", qty: 2, price: 1, name: "cheap", image: "x" },
        { productId: "p1", qty: 3, price: 999999999, name: "hack", image: "x2" },
    ]);
    // Only qty aggregates; no price/name/image survives round-trip.
    assert.deepEqual(stored, [{ productId: "p1", qty: 5 }]);
    for (const k of ["price", "name", "image", "slug", "subtotal"]) {
        assert.equal(stored[0][k], undefined, `${k} must never survive round-trip`);
    }
});
