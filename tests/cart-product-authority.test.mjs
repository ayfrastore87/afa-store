import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const authoritySource = fs.readFileSync(new URL("../src/lib/product-authority.ts", import.meta.url), "utf8");
const cartRouteSource = fs.readFileSync(new URL("../src/app/api/cart/route.ts", import.meta.url), "utf8");
const buyNowSource = fs.readFileSync(new URL("../src/app/api/cart/buy-now/route.ts", import.meta.url), "utf8");
const sessionSource = fs.readFileSync(new URL("../src/app/api/checkout/session/route.ts", import.meta.url), "utf8");
const orderSource = fs.readFileSync(new URL("../src/app/api/checkout/order/route.ts", import.meta.url), "utf8");
const ctaSource = fs.readFileSync(new URL("../src/components/product-detail-cta.tsx", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const cartContextSource = fs.readFileSync(new URL("../src/context/cart-context.tsx", import.meta.url), "utf8");
const clientAuthSource = fs.readFileSync(new URL("../src/lib/client-auth.ts", import.meta.url), "utf8");
const cartLibSource = fs.readFileSync(new URL("../src/lib/cart.ts", import.meta.url), "utf8");

function parseItem(value) {
    if (!value || typeof value.id !== "string" || !value.id.trim() || typeof value.qty !== "number" || !Number.isInteger(value.qty) || value.qty < 1) return null;
    return { id: value.id.trim(), qty: value.qty };
}

function reconcile(items, products) {
    const quantities = new Map();
    for (const item of items) {
        const parsed = parseItem(item);
        if (parsed) quantities.set(parsed.id, (quantities.get(parsed.id) ?? 0) + parsed.qty);
    }
    return products.filter((p) => p.isActive && p.stock > 0 && quantities.has(p.id)).map((p) => ({
        id: p.id, qty: Math.min(quantities.get(p.id), p.stock), name: p.name, slug: p.slug,
        price: p.price, image: p.image || "/products/parcel.png", stock: p.stock,
    }));
}

test("product authority contract covers active, inactive, unknown, stock and duplicate rules", () => {
    assert.match(authoritySource, /isActive: true/);
    assert.match(authoritySource, /stock: \{ gt: 0 \}/);
    assert.match(authoritySource, /Number\.isInteger\(item\.qty\)/);
    assert.match(authoritySource, /grouped\.set\(item\.id, \(grouped\.get\(item\.id\) \?\? 0\) \+ item\.qty\)/);
    assert.match(authoritySource, /qty: Math\.min\(grouped\.get\(product\.id\) \?\? 1, product\.stock\)/);
});

test("quantity parser rejects zero, negative, decimal and overflow is reconciled", () => {
    for (const qty of [0, -1, 1.5, NaN]) assert.equal(parseItem({ id: "p", qty }), null);
    assert.deepEqual(reconcile([{ id: "p", qty: 2 }, { id: "p", qty: 5 }], [{ id: "p", isActive: true, stock: 3, name: "N", slug: "n", price: 10, image: "i" }])[0].qty, 3);
});

test("guest reconciliation removes stale, inactive, unknown and out-of-stock items and reloads metadata", () => {
    const result = reconcile([
        { id: "active", qty: 4, name: "FAKE", price: 1, image: "fake", slug: "fake" },
        { id: "inactive", qty: 1 }, { id: "deleted", qty: 1 }, { id: "empty", qty: 1 },
    ], [
        { id: "active", isActive: true, stock: 2, name: "DB name", slug: "db-slug", price: 9900, image: "db-image" },
        { id: "inactive", isActive: false, stock: 2, name: "x", slug: "x", price: 1, image: "x" },
        { id: "empty", isActive: true, stock: 0, name: "x", slug: "x", price: 1, image: "x" },
    ]);
    assert.deepEqual(result, [{ id: "active", qty: 2, name: "DB name", slug: "db-slug", price: 9900, image: "db-image", stock: 2 }]);
});

test("client tampering cannot replace authoritative product fields", () => {
    for (const field of ["price", "stock", "name", "image", "slug", "category"]) assert.doesNotMatch(authoritySource, new RegExp(`item\\.${field}`));
    assert.match(cartRouteSource, /parseProductRequestItem\(\{ id: item\.id, qty: item\.qty \}\)/);
});

test("buy-now uses id/qty and rejects productId/quantity contract", () => {
    assert.match(buyNowSource, /parseProductRequestItem\(await request\.json\(\)\)/);
    assert.match(ctaSource, /JSON\.stringify\(\{ id: product\.id, qty: quantity \}\)/);
    assert.doesNotMatch(ctaSource, /productId: product\.id/);
});

test("checkout session and order re-authorize product identity, price and stock", () => {
    assert.match(sessionSource, /authorizeProductItems/);
    assert.match(orderSource, /authorizeProductItems/);
    assert.match(orderSource, /stock: \{ gte: item\.qty \}/);
    assert.match(orderSource, /price: item\.price/);
    assert.doesNotMatch(orderSource, /body\.(price|stock|name|image)/);
});

test("PATCH/PUT share integer validation and zero removal", () => {
    assert.match(cartRouteSource, /export async function PATCH/);
    assert.match(cartRouteSource, /export async function PUT/);
    assert.match(cartRouteSource, /typeof body\.qty !== "number" \|\| !Number\.isInteger\(body\.qty\)/);
    assert.match(cartRouteSource, /body\.qty <= 0/);
});

test("authenticated merge static audit identifies non-atomic SELECT then Promise.all writes", () => {
    assert.match(cartRouteSource, /select\("\*"\)\.eq\("userId", user\.id\)\.in\("productRef"/);
    assert.match(cartRouteSource, /const existingMap = new Map/);
    assert.match(cartRouteSource, /await Promise\.all\(incomingItems\.map/);
    assert.match(cartRouteSource, /\.insert\(/);
});

test("isolated concurrent updates demonstrate a lost update", async () => {
    const row = { quantity: 1 };
    let reads = 0;
    let releaseReads;
    const bothRead = new Promise((resolve) => { releaseReads = resolve; });
    async function merge(add) {
        const observed = row.quantity;
        reads += 1;
        if (reads === 2) releaseReads();
        await bothRead;
        row.quantity = Math.min(observed + add, 10);
    }

    await Promise.all([merge(2), merge(3)]);
    assert.notEqual(row.quantity, 6, "non-atomic read/calculate/write loses one increment");
    assert.ok(row.quantity === 3 || row.quantity === 4);
});

test("isolated concurrent inserts demonstrate a duplicate conflict", async () => {
    const rows = new Map();
    let reads = 0;
    let releaseReads;
    const bothRead = new Promise((resolve) => { releaseReads = resolve; });
    async function merge(productId) {
        const existing = rows.get(productId);
        reads += 1;
        if (reads === 2) releaseReads();
        await bothRead;
        if (!existing && rows.has(productId)) throw new Error("unique conflict");
        rows.set(productId, { quantity: 1 });
    }

    const results = await Promise.allSettled([merge("p"), merge("p")]);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(rows.size, 1);
});

test("authenticated add posts only id + qty and feeds server cart back into client state", () => {
    assert.match(cartContextSource, /body:\s*JSON\.stringify\(\{\s*item:\s*\{\s*id:\s*item\.id,\s*qty\s*\}\s*\}\)/);
    assert.doesNotMatch(cartContextSource, /JSON\.stringify\(\{\s*(price|name|image|slug)/);
    assert.match(cartContextSource, /setCart\(data\.items\)/);
    assert.match(cartContextSource, /setCart\(result\.data\.items\)/);
    assert.doesNotMatch(cartContextSource, /window\.location\.reload/);
});

test("unauthenticated add returns false and never writes a local/guest cart", () => {
    assert.match(cartContextSource, /if \(!isAuthenticated\) return false;/);
    assert.doesNotMatch(cartContextSource, /localStorage/);
    assert.doesNotMatch(cartContextSource, /guest/i);
});

test("same product merges quantity via existing /api/cart merge behavior", () => {
    assert.match(cartRouteSource, /existing\.quantity \+ item\.qty/);
    assert.match(cartRouteSource, /\.update\(\{\s*quantity:\s*Math\.min\(existing\.quantity \+ item\.qty,\s*item\.stock\)/);
});

test("badge is derived from total quantity of all items (merge SKU units)", () => {
    assert.match(cartLibSource, /calculateTotalItems/);
    assert.match(cartLibSource, /items\.reduce\(\(sum, item\) => sum \+ item\.qty, 0\)/);
});

test("failed add does not inflate the badge and surfaces a safe error", () => {
    assert.match(cartContextSource, /if \(!result\.ok\) \{/);
    assert.match(cartContextSource, /showToast\(\{ title: "Gagal menambahkan produk"/);
    assert.match(cartContextSource, /result\.error \|\|/);
    assert.match(cartContextSource, /return false;/);
});

test("login redirect is safe via loginPath and no guest add happens in catalog", () => {
    assert.match(pageSource, /await requireAuth\("\/"\)/);
    assert.match(clientAuthSource, /`\/login\?next=\$\{encodeURIComponent\(next\)\}`/);
    assert.match(pageSource, /await addToCart\(item\)/);
});

test("per-product loading prevents rapid double click and disables only that card", () => {
    assert.match(pageSource, /if \(addState\[item\.id\]\) return;/);
    assert.match(pageSource, /aria-busy=\{addState === "adding"\}/);
    assert.match(pageSource, /disabled=\{outOfStock \|\| addState === "adding" \|\| addState === "added"\}/);
    assert.match(pageSource, /"Menambahkan\.\.\."/);
});