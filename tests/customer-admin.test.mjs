import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const listRouteSource = fs.readFileSync(
    new URL("../src/app/api/admin/customers/route.ts", import.meta.url),
    "utf8"
);
const detailRouteSource = fs.readFileSync(
    new URL("../src/app/api/admin/customers/[id]/route.ts", import.meta.url),
    "utf8"
);
const whatsappSource = fs.readFileSync(new URL("../src/lib/whatsapp.ts", import.meta.url), "utf8");
const listPanelSource = fs.readFileSync(
    new URL("../src/components/admin/CustomerAdminPanel.tsx", import.meta.url),
    "utf8"
);
const detailPanelSource = fs.readFileSync(
    new URL("../src/components/admin/CustomerAdminDetailPanel.tsx", import.meta.url),
    "utf8"
);

test("customer list route requires admin and is read-only", () => {
    assert.match(listRouteSource, /export async function GET/);
    assert.doesNotMatch(listRouteSource, /export async function (POST|PUT|PATCH|DELETE)/);
    assert.match(listRouteSource, /getCurrentAdmin\(\)/);
    assert.doesNotMatch(listRouteSource, /updateMany|createMany|decrement|increment|\.create\(|\.delete\(|\.update\(/);
});

test("customer list classifies partner vs customer via the Partner relation", () => {
    assert.match(listRouteSource, /partner: \{ isNot: null \}/);
    assert.match(listRouteSource, /partner: null/);
    assert.match(listRouteSource, /isPartner/);
});

test("customer list aggregates order metrics via a single groupBy (no N+1)", () => {
    assert.match(listRouteSource, /prisma\.order\.groupBy/);
    assert.match(listRouteSource, /by: \["userId"\]/);
    assert.match(listRouteSource, /_sum: \{ total: true \}/);
    assert.match(listRouteSource, /_count: \{ _all: true \}/);
    assert.match(listRouteSource, /_max: \{ createdAt: true \}/);
});

test("customer spending NEVER counts PartnerSale — Source of truth is Order only", () => {
    assert.match(listRouteSource, /prisma\.order\.groupBy/);
    assert.doesNotMatch(listRouteSource, /partnerSale/);
    assert.match(detailRouteSource, /prisma\.order\.aggregate/);
    assert.match(detailRouteSource, /_sum: \{ total: true \}/);
    assert.doesNotMatch(detailRouteSource, /partnerSale/);
});

test("cancelled orders are excluded from spend/count", () => {
    assert.match(listRouteSource, /CANCELLED/);
    assert.match(listRouteSource, /CANCELED/);
    assert.match(listRouteSource, /notIn:/);
    assert.match(detailRouteSource, /CANCELLED/);
});

test("customer list supports search, type filter, partner status, and pagination", () => {
    assert.match(listRouteSource, /searchParams\.get\("q"\)/);
    assert.match(listRouteSource, /searchParams\.get\("type"\)/);
    assert.match(listRouteSource, /searchParams\.get\("partnerStatus"\)/);
    assert.match(listRouteSource, /searchParams\.get\("page"\)/);
    assert.match(listRouteSource, /searchParams\.get\("limit"\)/);
    assert.match(listRouteSource, /skip:/);
    assert.match(listRouteSource, /take:/);
    assert.match(listRouteSource, /totalPages/);
});

test("customer detail is read-only and paginates order history", () => {
    assert.match(detailRouteSource, /export async function GET/);
    assert.doesNotMatch(detailRouteSource, /export async function (POST|PUT|PATCH|DELETE)/);
    assert.match(detailRouteSource, /getCurrentAdmin\(\)/);
    assert.match(detailRouteSource, /prisma\.order\.findMany/);
    assert.match(detailRouteSource, /orderBy: \{ createdAt: "desc" \}/);
});

test("whatsapp normalization converts local and international formats", () => {
    assert.match(whatsappSource, /export function normalizeWhatsAppNumber/);
    assert.match(whatsappSource, /startsWith\("0"\)/);
    assert.match(whatsappSource, /`62\$\{digits\.slice\(1\)\}`/);
    assert.match(whatsappSource, /startsWith\("62"\)/);
    assert.match(whatsappSource, /wa\.me/);
});

test("admin list panel renders badge PELANGGAN / MITRA and detail links", () => {
    assert.match(listPanelSource, /PELANGGAN/);
    assert.match(listPanelSource, /MITRA/);
    assert.match(listPanelSource, /\/admin\/pelanggan\/\$\{c\.id\}/);
    assert.match(listPanelSource, /totalSpent/);
    assert.match(listPanelSource, /orderCount/);
    assert.match(listPanelSource, /lastOrderAt/);
});

test("admin detail panel links to partner dashboard and live location", () => {
    assert.match(detailPanelSource, /Dashboard Mitra/);
    assert.match(detailPanelSource, /Live Location/);
    assert.match(detailPanelSource, /\/admin\/mitra\/\$\{customer\.partner\.id\}/);
    assert.match(detailPanelSource, /\/admin\/mitra\/\$\{customer\.partner\.id\}\/lokasi/);
    assert.match(detailPanelSource, /whatsappLink/);
});