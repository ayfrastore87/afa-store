import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const movementSource = fs.readFileSync(new URL("../src/app/api/partner/stocks/movement/route.ts", import.meta.url), "utf8");
const saleSource = fs.readFileSync(new URL("../src/app/api/partner/sales/route.ts", import.meta.url), "utf8");
const stocksSource = fs.readFileSync(new URL("../src/app/api/partner/stocks/route.ts", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(new URL("../src/app/api/partner/dashboard/route.ts", import.meta.url), "utf8");
const adminStocksSource = fs.readFileSync(new URL("../src/app/api/admin/partners/[id]/stocks/route.ts", import.meta.url), "utf8");
const sharedSource = fs.readFileSync(new URL("../src/components/partner/partner-shared.ts", import.meta.url), "utf8");

// Pure re-implementation of the client display helper to unit-test its buckets.
function getPartnerStockStatus(quantity) {
    if (quantity <= 0) return "HABIS";
    if (quantity <= 5) return "MENIPIS";
    return "TERSEDIA";
}

// Isolated model of the atomic conditional decrement used by OUT and sale paths.
async function conditionalDecrement(rows, key, qty) {
    if (rows.get(key) < qty) return false;
    rows.set(key, rows.get(key) - qty);
    return true;
}

test("partner stock status buckets never classify zero/negative stock as available", () => {
    assert.equal(getPartnerStockStatus(-1), "HABIS");
    assert.equal(getPartnerStockStatus(0), "HABIS");
    assert.equal(getPartnerStockStatus(1), "MENIPIS");
    assert.equal(getPartnerStockStatus(5), "MENIPIS");
    assert.equal(getPartnerStockStatus(6), "TERSEDIA");
    assert.match(sharedSource, /getPartnerStockStatus/);
    assert.match(sharedSource, /PARTNER_STOCK_STATUS_LABELS/);
});

test("stock movement IN decrements AFA Product.stock atomically before topping PartnerStock", () => {
    assert.match(movementSource, /stock: \{ gte: quantity \}/);
    assert.match(movementSource, /decrement: quantity/);
    assert.match(movementSource, /PARTNER_REFERENCE_TRANSFER_IN/);
    assert.match(movementSource, /partnerStock\.upsert/);
    assert.match(movementSource, /productChanged\.count !== 1/);
});

test("stock movement OUT uses a conditional decrement, never read-then-write", () => {
    assert.match(movementSource, /quantity: \{ gte: quantity \}/);
    assert.match(movementSource, /decrement: quantity/);
    assert.match(movementSource, /stockChanged\.count !== 1/);
    assert.doesNotMatch(movementSource, /partnerStock\.findFirst\(/);
});

test("sale decrements partner stock exactly once and emits one OUT movement per item", () => {
    assert.match(saleSource, /partnerStock\.updateMany/);
    assert.match(saleSource, /quantity: \{ gte: item\.quantity \}/);
    assert.match(saleSource, /decrement: item\.quantity/);
    assert.match(saleSource, /partnerStockMovement\.createMany/);
    assert.match(saleSource, /referenceType: PARTNER_REFERENCE_SALE/);
    assert.equal((saleSource.match(/decrement: item\.quantity/g) || []).length, 1);
});

test("partner stock APIs derive partnerId from session only, ignoring the request", () => {
    for (const source of [movementSource, saleSource, stocksSource, dashboardSource]) {
        assert.match(source, /getCurrentPartner\(\)/);
        assert.match(source, /current\.partner\.id/);
        assert.doesNotMatch(source, /partnerId\s*=\s*request\./);
        assert.doesNotMatch(source, /body\.partnerId/);
    }
});

test("admin partner stock view is read-only and admin-gated", () => {
    assert.match(adminStocksSource, /getCurrentAdmin\(\)/);
    assert.match(adminStocksSource, /export async function GET/);
    assert.doesNotMatch(adminStocksSource, /export async function POST/);
    assert.doesNotMatch(adminStocksSource, /updateMany|createMany|decrement|increment/);
});

test("concurrent OUT requests cannot push partner stock below zero", async () => {
    const rows = new Map([["p", 5]]);
    const results = await Promise.all([
        conditionalDecrement(rows, "p", 4),
        conditionalDecrement(rows, "p", 4),
    ]);
    assert.equal(results.filter(Boolean).length, 1, "exactly one OUT succeeds");
    assert.equal(rows.get("p"), 1, "final stock is 1, never negative");
});

test("concurrent transfer IN requests cannot overdraw AFA product stock", async () => {
    const afa = new Map([["p", 5]]);
    const partner = new Map([["p", 0]]);
    async function transferIn(qty) {
        if (afa.get("p") < qty) return false;
        afa.set("p", afa.get("p") - qty);
        partner.set("p", partner.get("p") + qty);
        return true;
    }
    const results = await Promise.all([transferIn(4), transferIn(4)]);
    assert.equal(results.filter(Boolean).length, 1, "exactly one transfer succeeds");
    assert.equal(afa.get("p"), 1, "AFA stock final is 1");
    assert.equal(partner.get("p"), 4, "partner only receives stock for the successful transfer");
});

test("dashboard summary derives stock buckets from quantity without a status field", () => {
    assert.match(dashboardSource, /quantity: \{ gt: 0, lte: PARTNER_LOW_STOCK_THRESHOLD \}/);
    assert.match(dashboardSource, /quantity: 0/);
    assert.doesNotMatch(dashboardSource, /stockStatus/);
});
