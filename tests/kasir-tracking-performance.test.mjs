// ---------------------------------------------------------------------------
// AFA STORE — cashier tracking PERFORMANCE regressions.
//
// The cashier detail page used to answer one automatic tracking tick with TWO serial
// round trips: GET /api/admin/orders/[id]/biteship (provider read + persist) and then a
// full GET /api/admin/kasir/orders/[id] (admin lookup + order/items/product/payment read)
// only to re-render shipment fields. These tests lock in the optimized flow:
//
//   * a tracking poll is ONE request and never re-reads the transaction,
//   * the sanitized sync response is enough to update the delivery card,
//   * only one tracking request may be in flight (auto + manual share one lock),
//   * every existing business/security invariant is still enforced.
//
// Nothing here weakens shipment creation, payment, stock, totals, items, admin auth,
// timeline progression protection or the delivery_type "now" contract.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    KASIR_DELIVERY_AUTO_REFRESH_MS,
    hasRealShipment,
    isKasirDeliveryStatusTerminal,
    kasirDeliveryTimeline,
    kasirShipmentAction,
    normalizeKasirDeliveryStatus,
    resolveKasirDeliveryStatusUpdate,
    shouldAutoRefreshKasirDeliveryStatus,
} from "../src/lib/kasir-delivery.ts";
import { BITESHIP_DELIVERY_TYPE_NOW, buildBiteshipOrderPayload } from "../src/lib/biteship-order.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

/** Comment-free view of a source file, so "must NOT contain" rules apply to real code. */
const code = (source) =>
    source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
const detailRoute = read("../src/app/api/admin/kasir/orders/[id]/route.ts");
const kasirLib = read("../src/lib/kasir.ts");
const shared = read("../src/components/admin/kasir/kasir-shared.ts");
const detail = read("../src/components/admin/kasir/KasirTransactionDetail.tsx");
const shipmentActions = read("../src/components/admin/kasir/KasirShipmentActions.tsx");
const history = read("../src/components/admin/kasir/KasirHistory.tsx");
const receipt = read("../src/components/admin/kasir/KasirReceipt.tsx");
const printerPanel = read("../src/components/admin/kasir/KasirPrinterPanel.tsx");

/** The tracking refresh handler only (never the shipment-creation handler). */
const getHandler = biteshipRoute.slice(biteshipRoute.indexOf("export async function GET("));
/** The automatic sync function of the open detail page. */
const syncFn = detail.slice(
    detail.indexOf("const syncShipmentStatus = useCallback"),
    detail.indexOf("const confirmCodPayment ="),
);

// ---------------------------------------------------------------------------
// 1. An automatic poll never reloads the whole transaction
// ---------------------------------------------------------------------------

test("1. an automatic tracking poll performs no full transaction reload and no router refresh", () => {
    assert.ok(syncFn.length > 0, "the automatic sync function still exists");
    // ONE provider read per cycle...
    assert.equal((code(syncFn).match(/await fetch\(/g) || []).length, 1, "exactly one request per tracking cycle");
    assert.match(code(syncFn), /\/api\/admin\/orders\/\$\{id\}\/biteship/);
    // ...and never the cashier transaction endpoint again.
    assert.doesNotMatch(code(syncFn), /readDetail\(\)/, "the transaction is not re-read after a poll");
    assert.doesNotMatch(code(syncFn), /loadDetail\(/, "a poll never triggers the full detail loader");
    assert.doesNotMatch(code(syncFn), /kasir\/orders/, "a poll never calls the cashier detail route");
    // No router.refresh()/reload anywhere on the page.
    assert.doesNotMatch(code(detail), /router\.refresh\(\)|useRouter\(|location\.reload\(\)/);
});

// ---------------------------------------------------------------------------
// 2. The sanitized sync response is enough to update the delivery UI
// ---------------------------------------------------------------------------

test("2. a successful sync updates the shipment card from the sanitized response", () => {
    // Server: the refresh answers with a sanitized delivery block next to the existing view.
    assert.match(code(getHandler), /delivery: kasirShipmentSyncView\(updated\)/);
    assert.match(code(kasirLib), /export function kasirShipmentSyncView\(/);
    for (const field of ["status:", "timeline:", "hasShipment,", "trackingId:", "labelUrl:", "lastUpdatedAt:", "shipmentAction:"]) {
        assert.ok(kasirLib.includes(field), `the sync view exposes ${field}`);
    }
    // Client: it is merged into the delivery card that is already on screen.
    assert.match(code(detail), /const applyShipmentSync = useCallback/);
    assert.match(code(detail), /delivery: \{ \.\.\.current\.delivery, \.\.\.synced \}/);
    assert.match(code(detail), /onShipmentSynced=\{applyShipmentSync\}/);
    // The shared client type is a strict subset of the persisted delivery detail.
    assert.match(shared, /export type KasirShipmentSyncDelivery = Pick<\s*KasirDeliveryDetail,/);
});

// ---------------------------------------------------------------------------
// 3 + 4. Single-flight: auto and manual tracking reads can never overlap
// ---------------------------------------------------------------------------

test("3. only one tracking sync can be in flight", () => {
    assert.match(code(detail), /const syncLockRef = useRef\(false\);/);
    assert.match(code(syncFn), /if \(syncLockRef\.current\) return;/);
    assert.match(code(syncFn), /syncLockRef\.current = true;/);
    assert.match(code(syncFn), /finally \{\s*syncLockRef\.current = false;/);
    // The skipped tick is dropped, never queued.
    assert.doesNotMatch(code(syncFn), /setTimeout|queue|retry/i);
});

test("4. manual PERBARUI STATUS shares the same lock as the automatic refresh", () => {
    assert.match(code(detail), /syncLock=\{syncLockRef\}/);
    assert.match(code(shipmentActions), /syncLock\?: \{ current: boolean \}/);
    assert.match(code(shipmentActions), /const lock = kind === "refresh" \? syncLock : undefined;/);
    assert.match(code(shipmentActions), /if \(lock\?\.current\) return;/);
    assert.match(code(shipmentActions), /if \(lock\) lock\.current = false;/);
    // The in-component double-click guard stays too.
    assert.match(code(shipmentActions), /if \(busy\) return;/);
});


// ---------------------------------------------------------------------------
// 5 + 6. Polling policy is unchanged: 60s, active shipments, visible tab only
// ---------------------------------------------------------------------------

test("5. a terminal shipment stops the automatic polling", () => {
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, statusKey: "TERKIRIM" }), false);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, statusKey: "GAGAL" }), false);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, statusKey: "DALAM_PENGIRIMAN" }), true);
    assert.equal(isKasirDeliveryStatusTerminal("TERKIRIM"), true);
    assert.match(code(detail), /if \(!hasActiveShipment\) return;/);
    assert.match(code(detail), /shouldAutoRefreshKasirDeliveryStatus\(\{/);
});

test("6. a hidden tab never polls, the interval stays 60s and is cleaned up", () => {
    assert.match(code(detail), /document\.visibilityState !== "visible"/);
    assert.match(code(detail), /window\.setInterval\(/);
    assert.match(code(detail), /return \(\) => window\.clearInterval\(timer\);/);
    assert.match(code(detail), /KASIR_DELIVERY_AUTO_REFRESH_MS\)/);
    assert.ok(KASIR_DELIVERY_AUTO_REFRESH_MS >= 60_000, "polling never became more frequent");
    // No extra provider read is fired during mount/hydration.
    assert.equal((code(detail).match(/void syncShipmentStatus\(\)/g) || []).length, 1, "only the interval syncs");
});

// ---------------------------------------------------------------------------
// 7. A failed provider read keeps the last persisted state on screen
// ---------------------------------------------------------------------------

test("7. a failed Biteship sync keeps the last persisted status visible", () => {
    assert.match(code(syncFn), /if \(!response\.ok\) return;/, "a failed read changes nothing");
    assert.match(code(syncFn), /catch \{/, "an error is swallowed, the card is not cleared");
    // Only a non-empty sanitized payload may replace shipment state.
    assert.match(code(detail), /if \(!synced\) return;/);
    // The page is never blanked again once the transaction has been read.
    assert.match(code(detail), /if \(!loadedRef\.current\) setLoading\(true\);/);
    // The manual button keeps its own small busy state instead of a page-wide loader.
    assert.match(code(shipmentActions), /aria-busy=\{busy === "refresh"\}/);
});

// ---------------------------------------------------------------------------
// 8 + 9. The optimization never creates a shipment and never touches money
// ---------------------------------------------------------------------------

test("8. a tracking sync can never create a shipment", () => {
    assert.doesNotMatch(code(getHandler), /createBiteshipOrder|reference_id|\/v1\/orders/);
    assert.doesNotMatch(code(syncFn), /method: "POST"/);
    assert.match(code(syncFn), /method: "GET",/);
    assert.match(code(getHandler), /if \(!order\.biteshipOrderId \|\| order\.biteshipOrderId\.startsWith\(CLAIM_PREFIX\)\)/);
    assert.match(biteshipRoute, /const CLAIM_PREFIX = "claim:";/);
});

test("9. a tracking sync mutates shipment columns only", () => {
    const updateBlock = getHandler.slice(
        getHandler.indexOf("prisma.order.update("),
        getHandler.indexOf("return NextResponse.json({ order: biteshipOrderView(updated)"),
    );
    assert.match(updateBlock, /biteshipStatus: nextStatus,/);
    assert.doesNotMatch(updateBlock, /payment|stock|subtotal|total|discount|voucher|items|cashReceived/i);
    assert.doesNotMatch(code(getHandler), /prisma\.payment|prisma\.product|prisma\.orderItem|decrement|increment/);
    // The client merge only replaces the delivery block of the transaction held in state.
    const mergeBlock = code(detail).slice(
        code(detail).indexOf("const applyShipmentSync"),
        code(detail).indexOf("const syncShipmentStatus"),
    );
    assert.doesNotMatch(mergeBlock, /total|subtotal|items|payment|cashReceived/i);
});


// ---------------------------------------------------------------------------
// 10 + 11. Receipt and history stay on persisted data
// ---------------------------------------------------------------------------

test("10. printing never depends on a live Biteship request", () => {
    for (const source of [receipt, printerPanel]) {
        assert.doesNotMatch(code(source), /biteship/i);
        assert.doesNotMatch(code(source), /fetch\(/);
    }
    assert.match(code(detail), /onClick=\{\(\) => window\.print\(\)\}/);
});

test("11. cashier history never polls Biteship", () => {
    assert.doesNotMatch(code(history), /setInterval/);
    assert.doesNotMatch(code(history), /biteship/i);
});

// ---------------------------------------------------------------------------
// 12. Admin authorization is still mandatory on both routes
// ---------------------------------------------------------------------------

test("12. the optimized routes remain admin-only", () => {
    assert.match(code(getHandler), /const admin = await getCurrentAdmin\(\);/);
    assert.match(code(getHandler), /if \(!admin\) return NextResponse\.json\(\{ message: "Forbidden" \}, \{ status: 403 \}\);/);
    assert.match(code(detailRoute), /const admin = await getCurrentAdmin\(\);/);
    // One verification per request — never cached across users, never skipped.
    assert.equal((code(biteshipRoute).match(/getCurrentAdmin\(\)/g) || []).length, 2, "one lookup per handler");
    assert.equal((code(detailRoute).match(/getCurrentAdmin\(\)/g) || []).length, 1, "one lookup per request");
    for (const source of [kasirLib, shared, biteshipRoute]) {
        assert.doesNotMatch(code(source), /globalThis\.__admin|adminCache|cachedAdmin/i);
    }
});

// ---------------------------------------------------------------------------
// 13 + 14. Timeline / progression protection is untouched
// ---------------------------------------------------------------------------

test("13. the synced timeline is still derived server-side from the persisted status", () => {
    assert.match(kasirLib, /timeline: kasirDeliveryTimeline\(\{ biteshipStatus: order\.biteshipStatus, hasShipment \}\)/);
    const unknown = kasirDeliveryTimeline({ biteshipStatus: "some_new_state", hasShipment: true });
    assert.equal(unknown.interrupted, true);
    assert.notEqual(unknown.statusKey, "TERKIRIM");
    assert.equal(unknown.steps.at(-1).state, "pending", "an unknown status never reaches Terkirim");
    const delivered = kasirDeliveryTimeline({ biteshipStatus: "delivered", hasShipment: true });
    assert.equal(delivered.statusKey, "TERKIRIM");
    assert.equal(delivered.steps.at(-1).state, "current", "Terkirim is the stage the shipment reached");
    assert.equal(delivered.interrupted, false);
    assert.ok(
        delivered.steps.slice(0, -1).every((step) => step.state === "completed"),
        "every earlier stage is completed once the shipment is delivered",
    );
    // The browser still renders the server-derived timeline as-is.
    assert.match(code(detail), /<KasirDeliveryTimeline timeline=\{delivery\.timeline\} \/>/);
});

test("14. a delivered shipment can never regress", () => {
    assert.equal(resolveKasirDeliveryStatusUpdate("delivered", "confirmed"), "delivered");
    assert.equal(resolveKasirDeliveryStatusUpdate("delivered", "some_new_state"), "delivered");
    assert.equal(resolveKasirDeliveryStatusUpdate("delivered", "delivered"), "delivered");
    assert.equal(resolveKasirDeliveryStatusUpdate("confirmed", "picking_up"), "picking_up");
    assert.match(code(getHandler), /const nextStatus = resolveKasirDeliveryStatusUpdate\(order\.biteshipStatus, remote\.status\);/);
    // The sanitized view reads the PERSISTED value, so it cannot advertise a rolled-back state.
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "delivered", hasShipment: true }).key, "TERKIRIM");
});


// ---------------------------------------------------------------------------
// 15. delivery_type "now" contract preserved
// ---------------------------------------------------------------------------

test("15. shipment creation still sends delivery_type now", () => {
    assert.equal(BITESHIP_DELIVERY_TYPE_NOW, "now");
    const payload = buildBiteshipOrderPayload({
        origin: { contactName: "AFA STORE", contactPhone: "081234567890", address: "Jl. Contoh No.1", areaId: "IDJK01" },
        destination: { contactName: "Budi", contactPhone: "081234567890", address: "Jl. Tujuan No.2", areaId: "IDJC07" },
        courierCode: "jne",
        serviceCode: "reg",
        referenceId: "order-1",
        items: [{ name: "Produk", value: 100000, quantity: 1, weight: 1000 }],
    });
    assert.equal(payload.delivery_type, BITESHIP_DELIVERY_TYPE_NOW);
    assert.equal("delivery_date" in payload, false, "a scheduled pickup is never booked implicitly");
    // The optimization touched the refresh path only: the POST creation handler is intact.
    assert.match(biteshipRoute, /export async function POST\(/);
    assert.match(biteshipRoute, /const claim = `\$\{CLAIM_PREFIX\}\$\{order\.id\}`;/);
});

// ---------------------------------------------------------------------------
// 16 + 17. No leaked internals, and the refresh reads shipment columns only
// ---------------------------------------------------------------------------

test("16. the sanitized sync payload carries no internal identifier or secret", () => {
    // The browser never mentions provider/internal identifiers or a secret.
    for (const source of [detail, shipmentActions, shared]) {
        assert.doesNotMatch(code(source), /destinationAreaId|shippingQuoteRef|biteshipOrderId/);
        assert.doesNotMatch(code(source), /BITESHIP_API_KEY|MIDTRANS_SERVER_KEY|SUPABASE_SERVICE_ROLE/i);
    }
    // The sanitized server view never forwards the raw provider response.
    const syncView = kasirLib.slice(
        kasirLib.indexOf("export function kasirShipmentSyncView("),
        kasirLib.indexOf("export function formatKasirOrder("),
    );
    assert.doesNotMatch(code(syncView), /remote|rawPayload|apiKey|headers/i);
    // A real shipment still only offers the refresh action (never a second creation).
    assert.equal(kasirShipmentAction({ biteshipOrderId: "bit-123" }).canCreate, false);
    assert.equal(kasirShipmentAction({ biteshipOrderId: "bit-123" }).canRefresh, true);
    assert.equal(hasRealShipment("claim:order-1"), false);
});

test("17. the refresh reads and writes only the shipment columns it needs", () => {
    assert.equal((code(getHandler).match(/select: SHIPMENT_SYNC_SELECT,/g) || []).length, 2, "read and write both stay narrow");
    assert.equal((code(getHandler).match(/prisma\.order\.findUnique\(/g) || []).length, 1, "no duplicate order query");
    const select = biteshipRoute.slice(
        biteshipRoute.indexOf("const SHIPMENT_SYNC_SELECT"),
        biteshipRoute.indexOf("} as const;"),
    );
    assert.doesNotMatch(select, /customer|address|subtotal|total|payment|items|latitude|longitude|QuoteRef|AreaId/i);
    assert.match(select, /biteshipStatus: true,/);
    // The cashier detail route still performs exactly one order read per request.
    assert.equal((code(detailRoute).match(/prisma\.order\./g) || []).length, 1, "one query per detail request");
});

