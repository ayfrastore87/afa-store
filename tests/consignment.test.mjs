// AFA STORE — Sales & Titip Jual (consignment) module tests.
//
// Part 1 exercises the pure calculation library (src/lib/consignment.ts)
// directly — the exact functions every sales/admin route relies on for stock
// and money. Part 2 asserts the safety-critical source patterns (auth guards,
// single transaction, conditional stock decrements, idempotency, additive
// migration, night-mode CSS, admin nav) so a refactor cannot silently drop
// them.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    CONSIGNMENT_PAYMENT_METHODS,
    ConsignmentError,
    MAX_CONSIGNMENT_PAYMENT,
    MAX_CONSIGNMENT_QUANTITY,
    MAX_VISIT_ITEMS,
    PAYMENT_STATUS_VALID,
    VISIT_STATUS_COMPLETED,
    computeClosingStock,
    computeReceivable,
    computeVisitItem,
    computeVisitTotals,
    isConsignmentPaymentMethod,
    normalizeIdempotencyKey,
    parseVisitItems,
    validatePaymentAmount,
} from "../src/lib/consignment.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

// ---------------------------------------------------------------------------
// Part 1 — pure formulas
// ---------------------------------------------------------------------------

test("1. closing stock = opening + supplied - sold - returned - damaged", () => {
    assert.equal(computeClosingStock(10, 5, 8, 2, 1), 4);
    assert.equal(computeClosingStock(0, 10, 10, 0, 0), 0);
    assert.equal(computeClosingStock(0, 0, 0, 0, 0), 0);
});

test("2. closing stock can never go negative (409) and rejects bad operands (400)", () => {
    try {
        computeClosingStock(2, 0, 3, 0, 0);
        assert.fail("must throw");
    } catch (error) {
        assert.ok(error instanceof ConsignmentError);
        assert.equal(error.status, 409);
    }
    for (const bad of [[-1, 0, 0, 0, 0], [1.5, 0, 0, 0, 0], [0, NaN, 0, 0, 0], [0, 0, MAX_CONSIGNMENT_QUANTITY + 1, 0, 0]]) {
        try {
            computeClosingStock(...bad);
            assert.fail(`must throw for ${JSON.stringify(bad)}`);
        } catch (error) {
            assert.ok(error instanceof ConsignmentError, JSON.stringify(bad));
            assert.equal(error.status, 400, JSON.stringify(bad));
        }
    }
});

test("3. visit item snapshots DB price and computes sales amount server-side", () => {
    const item = { productId: "p1", quantitySold: 3, quantitySupplied: 5, quantityReturned: 1, quantityDamaged: 0 };
    const computed = computeVisitItem(item, 4, 15000);
    assert.equal(computed.openingStock, 4);
    assert.equal(computed.closingStock, 4 + 5 - 3 - 1);
    assert.equal(computed.unitPrice, 15000);
    assert.equal(computed.salesAmount, 3 * 15000);
});

test("4. visit totals aggregate item computations (Int rupiah)", () => {
    const totals = computeVisitTotals([
        computeVisitItem({ productId: "a", quantitySold: 2, quantitySupplied: 4, quantityReturned: 0, quantityDamaged: 0 }, 0, 10000),
        computeVisitItem({ productId: "b", quantitySold: 1, quantitySupplied: 0, quantityReturned: 1, quantityDamaged: 1 }, 5, 20000),
    ]);
    assert.deepEqual(totals, { totalSold: 3, totalSupplied: 4, totalReturned: 1, totalDamaged: 1, salesAmount: 40000 });
});

test("5. receivable = sales - paid, clamped at zero (overpayment safe)", () => {
    assert.equal(computeReceivable(100000, 40000), 60000);
    assert.equal(computeReceivable(100000, 100000), 0);
    assert.equal(computeReceivable(100000, 150000), 0);
    assert.throws(() => computeReceivable(NaN, 0), ConsignmentError);
});

test("6. payment amount must be a positive bounded integer", () => {
    assert.equal(validatePaymentAmount(25000), 25000);
    for (const bad of [0, -1, 1.5, "25000", MAX_CONSIGNMENT_PAYMENT + 1, null, undefined]) {
        assert.throws(() => validatePaymentAmount(bad), ConsignmentError, String(bad));
    }
});

test("7. payment methods are a strict allowlist", () => {
    assert.deepEqual([...CONSIGNMENT_PAYMENT_METHODS], ["CASH", "TRANSFER", "OTHER"]);
    assert.equal(isConsignmentPaymentMethod("CASH"), true);
    assert.equal(isConsignmentPaymentMethod("cash"), false);
    assert.equal(isConsignmentPaymentMethod("QRIS"), false);
    assert.equal(isConsignmentPaymentMethod(null), false);
});

test("8. parseVisitItems enforces structure, uniqueness, caps, and drops zero lines", () => {
    const items = parseVisitItems([
        { productId: "a", quantitySold: 1 },
        { productId: "b", quantitySold: 0, quantitySupplied: 0, quantityReturned: 0, quantityDamaged: 0 },
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0].productId, "a");

    assert.throws(() => parseVisitItems([]), ConsignmentError);
    assert.throws(() => parseVisitItems("nope"), ConsignmentError);
    assert.throws(() => parseVisitItems([{ productId: "a", quantitySold: 1 }, { productId: "a", quantitySold: 2 }]), ConsignmentError);
    assert.throws(() => parseVisitItems([{ productId: "a", quantitySold: -1 }]), ConsignmentError);
    assert.throws(() => parseVisitItems([{ productId: "a", quantitySold: 0 }]), ConsignmentError); // all-zero => nothing recorded
    assert.throws(
        () => parseVisitItems(Array.from({ length: MAX_VISIT_ITEMS + 1 }, (_, i) => ({ productId: `p${i}`, quantitySold: 1 }))),
        ConsignmentError,
    );
});

test("9. idempotency keys are normalized (opaque, bounded, optional)", () => {
    assert.equal(normalizeIdempotencyKey("  abc "), "abc");
    assert.equal(normalizeIdempotencyKey(""), null);
    assert.equal(normalizeIdempotencyKey(42), null);
    assert.equal(normalizeIdempotencyKey("x".repeat(129)), null);
});

// ---------------------------------------------------------------------------
// Part 2 — safety-critical source patterns
// ---------------------------------------------------------------------------

const visitsRoute = read("../src/app/api/sales/visits/route.ts");
const paymentsRoute = read("../src/app/api/sales/payments/route.ts");
const salesStoresRoute = read("../src/app/api/sales/stores/route.ts");
const salesStoreDetailRoute = read("../src/app/api/sales/stores/[id]/route.ts");
const salesSummaryRoute = read("../src/app/api/sales/summary/route.ts");
const adminSummaryRoute = read("../src/app/api/admin/consignment/summary/route.ts");
const adminStoresRoute = read("../src/app/api/admin/consignment/stores/route.ts");
const adminStoreDetailRoute = read("../src/app/api/admin/consignment/stores/[id]/route.ts");
const adminSalespeopleRoute = read("../src/app/api/admin/consignment/salespeople/route.ts");
const adminSalesDetailRoute = read("../src/app/api/admin/consignment/salespeople/[id]/route.ts");
const adminReportRoute = read("../src/app/api/admin/consignment/report/route.ts");
const proxy = read("../src/proxy.ts");
const auth = read("../src/lib/auth.ts");
const salesLayout = read("../src/app/sales/(protected)/layout.tsx");
const salesLoginPage = read("../src/app/sales/login/page.tsx");
const globalsCss = read("../src/app/globals.css");
const adminDashboard = read("../src/components/admin/AdminDashboard.tsx");
const migration = read("../prisma/migrations/20260927000000_add_sales_consignment/migration.sql");

test("10. every sales API route requires the current sales person (403 otherwise)", () => {
    for (const [name, source] of [
        ["visits", visitsRoute],
        ["payments", paymentsRoute],
        ["stores", salesStoresRoute],
        ["stores/[id]", salesStoreDetailRoute],
        ["summary", salesSummaryRoute],
    ]) {
        assert.match(source, /getCurrentSalesPerson\(\)/, name);
        assert.match(source, /if \(!current\) return NextResponse\.json\(\{ message: "Forbidden" \}, \{ status: 403 \}\)/, name);
    }
});

test("11. every admin consignment route requires the admin (403 otherwise)", () => {
    for (const [name, source] of [
        ["summary", adminSummaryRoute],
        ["stores", adminStoresRoute],
        ["stores/[id]", adminStoreDetailRoute],
        ["salespeople", adminSalespeopleRoute],
        ["salespeople/[id]", adminSalesDetailRoute],
        ["report", adminReportRoute],
    ]) {
        assert.match(source, /getCurrentAdmin\(\)/, name);
        assert.match(source, /\{ status: 403 \}/, name);
    }
});

test("12. the visit POST is one transaction with DB-authoritative snapshots", () => {
    assert.match(visitsRoute, /prisma\.\$transaction\(async \(tx\) =>/);
    // Ownership check INSIDE the transaction, scoped to the assigned sales.
    assert.match(visitsRoute, /assignedSalesId: salesId/);
    // openingStock/unitPrice from the DB, never the payload.
    assert.match(visitsRoute, /const openingStock = existingStock\?\.currentStock \?\? 0/);
    assert.match(visitsRoute, /const unitPrice = existingStock\?\.unitPrice \?\? product\.price/);
    // Totals recomputed server-side.
    assert.match(visitsRoute, /computeVisitTotals\(computedItems\)/);
});

test("13. warehouse stock leaves ONCE via a conditional updateMany that never overdraws", () => {
    assert.match(visitsRoute, /tx\.product\.updateMany\(\{\s*\n\s*where: \{ id: item\.productId, isActive: true, stock: \{ gte: item\.quantitySupplied \} \},\s*\n\s*data: \{ stock: \{ decrement: item\.quantitySupplied \} \},/);
    assert.match(visitsRoute, /if \(changed\.count !== 1\) \{\s*\n\s*throw new ConsignmentError\(409/);
    // Exactly one Product.stock decrement site in the whole route.
    assert.equal(visitsRoute.match(/stock: \{ decrement/g)?.length, 1);
});

test("14. ConsignmentStock updates use the optimistic currentStock guard", () => {
    assert.match(visitsRoute, /where: \{ id: existingStock\.id, currentStock: openingStock \}/);
    assert.match(visitsRoute, /Stok toko berubah/);
    // Deterministic lock order: items sorted by productId.
    assert.match(visitsRoute, /\.sort\(\(a, b\) => a\.productId\.localeCompare\(b\.productId\)\)/);
});

test("15. duplicate submits are idempotent: same key -> 200 duplicated, P2002 -> 409", () => {
    assert.match(visitsRoute, /normalizeIdempotencyKey\(parsed\.data\.idempotencyKey\)/);
    assert.match(visitsRoute, /findUnique\(\{\s*\n\s*where: \{ idempotencyKey \}/);
    assert.match(visitsRoute, /duplicated: true \}, \{ status: 200 \}/);
    assert.match(visitsRoute, /code === "P2002"\) \{\s*\n\s*return NextResponse\.json\(\{ message: "Kunjungan sudah tersimpan\." \}, \{ status: 409 \}\)/);
});

test("16. other-sales stores answer 404 (not 403) so ids cannot be enumerated", () => {
    assert.match(salesStoreDetailRoute, /assignedSalesId: current\.sales\.id/);
    assert.match(salesStoreDetailRoute, /if \(!current\).*status: 403/);
    assert.match(salesStoreDetailRoute, /\{ status: 404 \}/);
    assert.match(paymentsRoute, /Toko tidak ditemukan atau bukan tugas Anda\." \}, \{ status: 404 \}/);
});

test("17. receivable is always derived from COMPLETED sales minus VALID payments", () => {
    assert.equal(VISIT_STATUS_COMPLETED, "COMPLETED");
    assert.equal(PAYMENT_STATUS_VALID, "VALID");
    for (const source of [salesSummaryRoute, salesStoresRoute, adminSummaryRoute, adminStoresRoute, adminStoreDetailRoute, adminSalesDetailRoute]) {
        assert.match(source, /computeReceivable\(/);
        assert.match(source, /VISIT_STATUS_COMPLETED/);
        assert.match(source, /PAYMENT_STATUS_VALID/);
    }
});

test("18. sales account creation mirrors the kasir pattern with rollback on failure", () => {
    assert.match(adminSalespeopleRoute, /createSupabaseAdminClient\(\)/);
    assert.match(adminSalespeopleRoute, /\$executeRaw`INSERT INTO public\.users/);
    assert.match(adminSalespeopleRoute, /\$\{"sales"\}/);
    assert.match(adminSalespeopleRoute, /supabase\.auth\.admin\.deleteUser\(data\.user\.id\)/);
    assert.match(adminSalespeopleRoute, /P2002/);
});

test("19. /sales routes are proxy-protected and server-guarded; login stays public", () => {
    assert.match(proxy, /\(pathname === "\/sales" \|\| pathname\.startsWith\("\/sales\/"\)\) && pathname !== "\/sales\/login"/);
    assert.match(auth, /export async function requireSales\(\)/);
    assert.match(auth, /redirect\("\/sales\/login"\)/);
    assert.match(salesLayout, /await requireSales\(\)/);
    // The login page never wraps itself in the guard (no redirect loop).
    assert.match(salesLoginPage, /getCurrentSalesPerson/);
    assert.match(salesLoginPage, /redirect\("\/sales"\)/);
    assert.doesNotMatch(salesLoginPage, /requireSales/);
});

test("20. sales shell has the additive night-mode block (mirrors kasir)", () => {
    for (const selector of [".sales-shell", ".sales-header", ".sales-avatar", ".sales-card", ".sales-bottom-nav"]) {
        assert.match(globalsCss, new RegExp(`html\\[data-theme="dark"\\] \\${selector}`), selector);
    }
    // Additive only: the kasir block is untouched.
    assert.match(globalsCss, /html\[data-theme="dark"\] \.kasir-shell/);
});

test("21. admin navigation exposes Sales & Titip Jual and all admin components exist", () => {
    assert.match(adminDashboard, /"Sales & Titip Jual"/);
    assert.match(adminDashboard, /href: "\/admin\/titip-jual"/);
    for (const component of [
        "ConsignmentAdminPanel",
        "ConsignmentStoreDetail",
        "ConsignmentSalesPanel",
        "ConsignmentSalesDetail",
        "ConsignmentReport",
        "ConsignmentStoreMap",
    ]) {
        assert.ok(exists(`../src/components/admin/consignment/${component}.tsx`), component);
        const source = read(`../src/components/admin/consignment/${component}.tsx`);
        assert.match(source, /"use client"/, component);
        assert.match(source, /getUserFacingMessage/, component);
    }
    // Map components reuse the singleton loader — never a second bootstrap or key.
    for (const component of ["ConsignmentStoreDetail", "ConsignmentStoreMap"]) {
        const source = read(`../src/components/admin/consignment/${component}.tsx`);
        assert.match(source, /loadGoogleMaps/, component);
        assert.doesNotMatch(source, /maps\.googleapis\.com|apiKey|api_key/, component);
    }
});

test("22. migration artifact is strictly additive (no ALTER/DROP of existing objects)", () => {
    assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)\b/i);
    assert.doesNotMatch(migration, /\bALTER\s+TABLE\s+"(users|products|orders|order_items|categories)"/i);
    assert.match(migration, /CREATE TABLE "sales_people"/);
    assert.match(migration, /CREATE TABLE "consignment_stores"/);
    assert.match(migration, /CREATE TABLE "consignment_stocks"/);
    assert.match(migration, /CREATE TABLE "sales_visits"/);
    assert.match(migration, /CREATE TABLE "sales_visit_items"/);
    assert.match(migration, /CREATE TABLE "store_payments"/);
});