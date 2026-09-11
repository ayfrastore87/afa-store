import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reportSource = fs.readFileSync(new URL("../src/app/api/partner/sales/report/route.ts", import.meta.url), "utf8");
const wibSource = fs.readFileSync(new URL("../src/lib/wib.ts", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(new URL("../src/app/api/partner/dashboard/route.ts", import.meta.url), "utf8");
const reportsTabSource = fs.readFileSync(new URL("../src/components/partner/reports-tab.tsx", import.meta.url), "utf8");

test("partner sales report is read-only and derives partnerId from the session", () => {
    assert.match(reportSource, /export async function GET/);
    assert.doesNotMatch(reportSource, /export async function POST/);
    assert.match(reportSource, /getCurrentPartner\(\)/);
    assert.match(reportSource, /current\.partner\.id/);
    assert.doesNotMatch(reportSource, /partnerId\s*=\s*request\./);
    assert.doesNotMatch(reportSource, /body\.partnerId/);
    assert.doesNotMatch(reportSource, /updateMany|createMany|decrement|increment|\.create\(/);
});

test("sales report aggregates PartnerSale totals, item counts, and best sellers", () => {
    assert.match(reportSource, /partnerSale\.aggregate/);
    assert.match(reportSource, /_sum: \{ total: true, grossProfit: true \}/);
    assert.match(reportSource, /partnerSaleItem\.aggregate/);
    assert.match(reportSource, /partnerSaleItem\.groupBy/);
    assert.match(reportSource, /by: \["name"\]/);
    assert.match(reportSource, /subtotalCost/);
    assert.match(reportSource, /slice\(0, 10\)/);
});

test("sales report maps every WIB period to a deterministic lower bound", () => {
    assert.match(reportSource, /"hari"/);
    assert.match(reportSource, /"minggu"/);
    assert.match(reportSource, /"bulan"/);
    assert.match(reportSource, /"tahun"/);
    assert.match(reportSource, /"semua"/);
    assert.match(reportSource, /wibStartOfDay/);
    assert.match(reportSource, /wibStartOfMonth/);
    assert.match(reportSource, /wibStartOfYear/);
    assert.match(reportSource, /wibDaysAgo\(6, now\)/);
});

test("WIB calendar helpers are shared, not duplicated in the dashboard route", () => {
    assert.match(wibSource, /wibStartOfDay/);
    assert.match(wibSource, /wibStartOfMonth/);
    assert.match(wibSource, /wibStartOfYear/);
    assert.match(wibSource, /wibDaysAgo/);
    assert.doesNotMatch(dashboardSource, /function wibStartOfDay/);
    assert.doesNotMatch(dashboardSource, /function wibZonedParts/);
});

test("partner reports tab exposes period filter, top products, and export", () => {
    assert.match(reportsTabSource, /Laporan Penjualan/);
    assert.match(reportsTabSource, /Produk Terlaris/);
    assert.match(reportsTabSource, /exportCsv/);
    assert.match(reportsTabSource, /exportPdf/);
    assert.match(reportsTabSource, /exportXlsx/);
    assert.match(reportsTabSource, /window\.print\(\)/);
});
