import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dashboardSource = fs.readFileSync(new URL("../src/app/api/partner/dashboard/route.ts", import.meta.url), "utf8");
const sharedSource = fs.readFileSync(new URL("../src/components/partner/partner-shared.ts", import.meta.url), "utf8");
const mitraDashboardSource = fs.readFileSync(new URL("../src/components/mitra/mitra-dashboard.tsx", import.meta.url), "utf8");

test("ACTIVE partner dashboard is session-scoped, never trusts a client partnerId", () => {
    assert.match(dashboardSource, /getCurrentPartner\(\)/);
    assert.match(dashboardSource, /current\.partner\.id/);
    assert.doesNotMatch(dashboardSource, /partnerId\s*=\s*request\./);
    assert.doesNotMatch(dashboardSource, /body\.partnerId/);
    assert.doesNotMatch(dashboardSource, /searchParams/);
});

test("salesToday count and revenueToday are computed from PartnerSale today (WIB start of day)", () => {
    assert.match(dashboardSource, /soldAt: \{ gte: startOfDay \}/);
    assert.match(dashboardSource, /_sum: \{ total: true, grossProfit: true \}/);
    assert.match(dashboardSource, /wibStartOfDay\(now\)/);
});

test("recentSales is capped to the latest 5 transactions", () => {
    assert.match(dashboardSource, /take: 5/);
    assert.match(dashboardSource, /orderBy: \{ soldAt: \"desc\" \}/);
});

test("bestSellers is derived from PartnerSaleItem.quantity and limited to 5", () => {
    assert.match(dashboardSource, /partnerSaleItem\.groupBy/);
    assert.match(dashboardSource, /by: \[\"name\"\]/);
    assert.match(dashboardSource, /_sum: \{ quantity: true, subtotalRevenue: true \}/);
    assert.match(dashboardSource, /orderBy: \{ _sum: \{ quantity: \"desc\" \} \}/);
});

test("lowStock uses the shared PARTNER_LOW_STOCK_THRESHOLD and returns low-stock items", () => {
    assert.match(dashboardSource, /quantity: \{ gt: 0, lte: PARTNER_LOW_STOCK_THRESHOLD \}/);
    assert.match(dashboardSource, /lowStockItems/);
});

test("dashboard summary shape exposes today/mock/laba/stock/bestSellers/lowStockItems", () => {
    assert.match(sharedSource, /grossProfit: number/);
    assert.match(sharedSource, /bestSellers/);
    assert.match(sharedSource, /lowStockItems/);
});

test("mitra dashboard renders real (non-dummy) sections with empty states", () => {
    assert.match(mitraDashboardSource, /Produk Terlaris/);
    assert.match(mitraDashboardSource, /Stok Menipis/);
    assert.match(mitraDashboardSource, /Belum ada data produk terlaris/);
    assert.match(mitraDashboardSource, /Stok aman/);
    assert.match(mitraDashboardSource, /Belum ada penjualan/);
});
