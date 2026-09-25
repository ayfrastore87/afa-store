/*
 * Spec for the AFA STORE cashier DELIVERY TIMELINE and provider-update progression (Tahap G).
 *
 * A cashier delivery order already had a persisted provider status, a resi and an explicit
 * "PERBARUI STATUS" refresh (Tahap F). This phase adds the human readable TIMELINE and makes
 * every stored provider value SAFE:
 *   - the timeline is a PURE derivation of the normalized, PERSISTED provider status
 *     (src/lib/kasir-delivery.ts) — no stage is ever computed in the browser,
 *   - an unknown provider status never advances the timeline to "Terkirim",
 *   - failure / cancellation / return / hold render as an explicit interruption,
 *   - a duplicated, stale or unrecognized provider value can never move a shipment
 *     backwards (a delivered shipment stays delivered),
 *   - NO webhook was added: the official Biteship documentation defines the webhook events
 *     and payload but NOT any verifiable authentication/signature mechanism, so the
 *     authenticated GET refresh (plus the conservative polling) stays the only sync path,
 *   - no new shipment, no new database column, payment / stock / totals / items untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    KASIR_DELIVERY_AUTO_REFRESH_MS,
    KASIR_DELIVERY_TIMELINE_LABELS,
    KASIR_DELIVERY_TIMELINE_STAGES,
    canAdvanceKasirDeliveryStatus,
    isFinalKasirDeliveryStatus,
    isKasirDeliveryStatusTerminal,
    kasirDeliveryStatusRank,
    kasirDeliveryTimeline,
    normalizeKasirDeliveryStatus,
    resolveKasirDeliveryStatusUpdate,
    shouldAutoRefreshKasirDeliveryStatus,
} from "../src/lib/kasir-delivery.ts";

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

/** Comment-free view of a source file, so "must NOT contain" rules apply to real code. */
const code = (source) =>
    source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Absolute file paths of a directory tree, with forward slashes. */
function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(full.replace(/\\/g, "/"));
    }
    return out;
}

const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
const kasirLib = read("../src/lib/kasir.ts");
const detail = read("../src/components/admin/kasir/KasirTransactionDetail.tsx");
const timelineComponent = read("../src/components/admin/kasir/KasirDeliveryTimeline.tsx");
const history = read("../src/components/admin/kasir/KasirHistory.tsx");
const receipt = read("../src/components/admin/kasir/KasirReceipt.tsx");
const shipmentActions = read("../src/components/admin/kasir/KasirShipmentActions.tsx");
const escpos = read("../src/lib/thermal-printer/escpos.ts");
const schema = read("../prisma/schema.prisma");

/** The tracking refresh handler only (never the shipment-creation handler). */
const getHandler = biteshipRoute.slice(biteshipRoute.indexOf("export async function GET("));
const getCode = code(getHandler);

const stepStates = (timeline) => Object.fromEntries(timeline.steps.map((step) => [step.stage, step.state]));
const currentLabels = (timeline) => timeline.steps.filter((step) => step.state === "current").map((step) => step.label);

const PENDING_AFTER_FIRST = {
    KURIR_DICARI: "pending",
    KURIR_MENUJU_PICKUP: "pending",
    PESANAN_DIAMBIL: "pending",
    DALAM_PENGIRIMAN: "pending",
    TERKIRIM: "pending",
};

// ---------------------------------------------------------------------------
// A. Delivery timeline — every stage justified by the persisted provider state
// ---------------------------------------------------------------------------

test("1. a delivery order without a shipment only proves 'Pesanan Dibuat'", () => {
    const timeline = kasirDeliveryTimeline({ biteshipStatus: null, hasShipment: false });

    assert.deepEqual(
        timeline.steps.map((step) => step.stage),
        [...KASIR_DELIVERY_TIMELINE_STAGES],
    );
    assert.deepEqual(stepStates(timeline), { PESANAN_DIBUAT: "completed", ...PENDING_AFTER_FIRST });
    assert.equal(timeline.currentStage, null, "no courier stage is claimed before a shipment exists");
    assert.equal(timeline.interrupted, false);
    assert.ok(timeline.note, "the honest reason is shown instead of a guessed stage");
});

test("2. `confirmed` shows Kurir Dicari as the current stage", () => {
    const timeline = kasirDeliveryTimeline({ biteshipStatus: "confirmed", hasShipment: true });

    assert.equal(timeline.statusKey, "KURIR_DICARI");
    assert.deepEqual(currentLabels(timeline), ["Kurir Dicari"]);
    assert.equal(timeline.currentStage, 2);
    assert.equal(stepStates(timeline).PESANAN_DIBUAT, "completed");
    assert.equal(stepStates(timeline).KURIR_MENUJU_PICKUP, "pending");
    assert.equal(timeline.interrupted, false);
});

test("3. `picking_up` shows Kurir Menuju Pickup as the current stage", () => {
    const timeline = kasirDeliveryTimeline({ biteshipStatus: "picking_up", hasShipment: true });

    assert.deepEqual(currentLabels(timeline), ["Kurir Menuju Pickup"]);
    assert.equal(stepStates(timeline).PESANAN_DIBUAT, "completed");
    assert.equal(stepStates(timeline).KURIR_DICARI, "completed");
    assert.equal(stepStates(timeline).PESANAN_DIAMBIL, "pending");
});

test("4. `picked` shows Pesanan Diambil as the current stage", () => {
    const timeline = kasirDeliveryTimeline({ biteshipStatus: "picked", hasShipment: true });

    assert.deepEqual(currentLabels(timeline), ["Pesanan Diambil"]);
    assert.equal(stepStates(timeline).KURIR_MENUJU_PICKUP, "completed");
    assert.equal(stepStates(timeline).DALAM_PENGIRIMAN, "pending");
});

test("5. `dropping_off` shows Dalam Pengiriman as the current stage", () => {
    const timeline = kasirDeliveryTimeline({ biteshipStatus: "dropping_off", hasShipment: true });

    assert.deepEqual(currentLabels(timeline), ["Dalam Pengiriman"]);
    assert.equal(stepStates(timeline).PESANAN_DIAMBIL, "completed");
    assert.equal(stepStates(timeline).TERKIRIM, "pending");
});

test("6. `in_transit` is the official middle mile and is treated like the last mile", () => {
    const timeline = kasirDeliveryTimeline({ biteshipStatus: "in_transit", hasShipment: true });

    assert.equal(timeline.statusKey, "DALAM_PENGIRIMAN");
    assert.deepEqual(currentLabels(timeline), ["Dalam Pengiriman"]);
    assert.equal(stepStates(timeline).TERKIRIM, "pending");
});

test("7. `delivered` marks every earlier stage as reached", () => {
    const timeline = kasirDeliveryTimeline({ biteshipStatus: "delivered", hasShipment: true });

    assert.deepEqual(currentLabels(timeline), ["Terkirim"]);
    assert.deepEqual(stepStates(timeline), {
        PESANAN_DIBUAT: "completed",
        KURIR_DICARI: "completed",
        KURIR_MENUJU_PICKUP: "completed",
        PESANAN_DIAMBIL: "completed",
        DALAM_PENGIRIMAN: "completed",
        TERKIRIM: "current",
    });
    assert.equal(timeline.interrupted, false);
    assert.equal(timeline.note, null);
});

test("8. `allocated` / `scheduled` never claim that the courier is already on the way", () => {
    for (const raw of ["allocated", "scheduled"]) {
        const timeline = kasirDeliveryTimeline({ biteshipStatus: raw, hasShipment: true });
        assert.deepEqual(currentLabels(timeline), ["Kurir Dicari"], raw);
        assert.equal(stepStates(timeline).KURIR_MENUJU_PICKUP, "pending", raw);
    }
});

test("9. an unknown provider status never advances the timeline to Terkirim", () => {
    for (const raw of ["some_new_state", "out_for_delivery", "menuju_alamat", "delivering"]) {
        const timeline = kasirDeliveryTimeline({ biteshipStatus: raw, hasShipment: true });

        assert.equal(timeline.statusKey, "TIDAK_DIKENAL", raw);
        assert.equal(timeline.raw, raw, "the raw provider status is still shown verbatim");
        assert.notEqual(stepStates(timeline).TERKIRIM, "completed", raw);
        assert.notEqual(stepStates(timeline).TERKIRIM, "current", raw);
        assert.equal(stepStates(timeline).DALAM_PENGIRIMAN, "pending", raw);
        assert.equal(timeline.interrupted, true, raw);
        assert.ok(timeline.note, raw);
    }
});

test("10. failure, cancellation, return and hold render as an interrupted state", () => {
    const cancelled = kasirDeliveryTimeline({ biteshipStatus: "cancelled", hasShipment: true });
    assert.equal(cancelled.statusKey, "GAGAL");
    assert.equal(cancelled.interrupted, true);
    assert.equal(cancelled.currentStage, null);
    assert.notEqual(stepStates(cancelled).DALAM_PENGIRIMAN, "completed");
    assert.notEqual(stepStates(cancelled).TERKIRIM, "completed");

    const returned = kasirDeliveryTimeline({ biteshipStatus: "returned", hasShipment: true });
    assert.equal(returned.statusKey, "DIKEMBALIKAN");
    assert.equal(returned.interrupted, true);
    assert.equal(stepStates(returned).PESANAN_DIAMBIL, "completed", "a return proves the parcel was picked");
    assert.equal(stepStates(returned).DALAM_PENGIRIMAN, "pending", "a return is not a normal delivery");
    assert.notEqual(stepStates(returned).TERKIRIM, "completed");

    const held = kasirDeliveryTimeline({ biteshipStatus: "on_hold", hasShipment: true });
    assert.equal(held.statusKey, "DITAHAN");
    assert.equal(held.interrupted, true);
    assert.equal(held.currentStage, null, "a hold may happen anywhere, so no position is claimed");
});

test("11. exactly one current stage for a running flow, none once it is interrupted", () => {
    assert.deepEqual(KASIR_DELIVERY_TIMELINE_LABELS, {
        PESANAN_DIBUAT: "Pesanan Dibuat",
        KURIR_DICARI: "Kurir Dicari",
        KURIR_MENUJU_PICKUP: "Kurir Menuju Pickup",
        PESANAN_DIAMBIL: "Pesanan Diambil",
        DALAM_PENGIRIMAN: "Dalam Pengiriman",
        TERKIRIM: "Terkirim",
    });

    for (const raw of ["confirmed", "allocated", "picking_up", "picked", "in_transit", "dropping_off", "delivered"]) {
        const timeline = kasirDeliveryTimeline({ biteshipStatus: raw, hasShipment: true });
        assert.equal(currentLabels(timeline).length, 1, raw);
        assert.equal(timeline.interrupted, false, raw);
        assert.equal(timeline.note, null, raw);
    }

    for (const raw of ["cancelled", "returned", "on_hold", "unknown_state"]) {
        const timeline = kasirDeliveryTimeline({ biteshipStatus: raw, hasShipment: true });
        assert.equal(currentLabels(timeline).length, 0, raw);
        assert.equal(timeline.interrupted, true, raw);
    }
});

test("12. the timeline is derived server-side and merely rendered in the browser", () => {
    assert.match(kasirLib, /timeline: kasirDeliveryTimeline\(\{ biteshipStatus: order\.biteshipStatus, hasShipment \}\)/);
    assert.match(detail, /<KasirDeliveryTimeline timeline=\{delivery\.timeline\} \/>/);
    // The component renders whatever it receives: it maps no provider status, calls no API
    // and reads no environment variable, so the browser can never race ahead of the provider.
    const componentCode = code(timelineComponent);
    assert.doesNotMatch(componentCode, /biteshipStatus|BITESHIP_ORDER_STATUS_MAP|confirmed|picking_up|dropping_off/);
    assert.doesNotMatch(componentCode, /fetch\(|useEffect|useState|process\.env/);
});

test("13. detail keeps status, timeline, provider status, resi and last update together", () => {
    const card = detail.slice(
        detail.indexOf('uppercase tracking-[0.15em] text-[#184D47]/50">Pengiriman<'),
        detail.indexOf("Buka Label Biteship"),
    );
    assert.ok(card.length > 0, "the PENGIRIMAN card is still rendered");
    assert.ok(card.includes("<KasirDeliveryTimeline timeline={delivery.timeline} />"), "timeline lives in the card");

    assert.match(detail, /deliveryStatusBadgeClass\(delivery\.status\.key\)/);
    assert.match(detail, /<Row label="Status Provider" value=\{delivery\.status\.raw \|\| "-"\} \/>/);
    assert.match(detail, /<Row label="No\. Resi \/ Tracking" value=\{delivery\.trackingId \|\| "Belum tersedia"\} \/>/);
    assert.match(detail, /label="Terakhir Diperbarui"/);
});

test("14. the existing shipment actions are preserved and expose no internal id", () => {
    assert.match(shipmentActions, /PERBARUI STATUS/);
    assert.match(shipmentActions, /method: kind === "create" \? "POST" : "GET"/);
    assert.match(detail, /Buka Label Biteship/);
    assert.match(detail, /CETAK ULANG STRUK/);

    const detailCode = code(detail);
    for (const forbidden of ["biteshipOrderId", "destinationAreaId", "shippingQuoteRef", "originAreaId"]) {
        assert.equal(detailCode.includes(forbidden), false, forbidden);
    }
});

// ---------------------------------------------------------------------------
// B. Provider-update progression — duplicated / stale / unrecognized values
// ---------------------------------------------------------------------------

test("15. a delivered shipment can never regress to an earlier provider state", () => {
    for (const incoming of ["confirmed", "scheduled", "allocated", "picking_up", "picked", "in_transit", "dropping_off"]) {
        assert.equal(canAdvanceKasirDeliveryStatus("delivered", incoming), false, incoming);
        assert.equal(resolveKasirDeliveryStatusUpdate("delivered", incoming), "delivered", incoming);
    }
    assert.equal(kasirDeliveryStatusRank("delivered"), 6);
    assert.equal(isFinalKasirDeliveryStatus("delivered"), true);
});

test("16. a delivered shipment also survives a stale failure or unknown value", () => {
    for (const incoming of ["cancelled", "returned", "on_hold", "some_new_state", "courier_not_found"]) {
        assert.equal(resolveKasirDeliveryStatusUpdate("delivered", incoming), "delivered", incoming);
    }
    // …and the same value again is simply accepted (idempotent).
    assert.equal(resolveKasirDeliveryStatusUpdate("delivered", "delivered"), "delivered");
});

test("17. a duplicated provider update is idempotent", () => {
    for (const status of ["confirmed", "picking_up", "picked", "dropping_off", "delivered", "on_hold", "unknown_state"]) {
        assert.equal(canAdvanceKasirDeliveryStatus(status, status), true, status);
        assert.equal(resolveKasirDeliveryStatusUpdate(status, status), status, status);
    }
    // The same state in its camelCase spelling stays one state, not a new event.
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "pickingUp", hasShipment: true }).key, "KURIR_MENUJU_PICKUP");
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "droppingOff", hasShipment: true }).key, "DALAM_PENGIRIMAN");
    assert.equal(resolveKasirDeliveryStatusUpdate("picking_up", "pickingUp"), "pickingUp");
    assert.equal(resolveKasirDeliveryStatusUpdate("pickingUp", "picking_up"), "picking_up");
});

test("18. an out-of-order older provider status never overwrites a newer one", () => {
    assert.equal(resolveKasirDeliveryStatusUpdate("picked", "picking_up"), "picked");
    assert.equal(resolveKasirDeliveryStatusUpdate("dropping_off", "picked"), "dropping_off");
    assert.equal(resolveKasirDeliveryStatusUpdate("in_transit", "confirmed"), "in_transit");
    assert.equal(canAdvanceKasirDeliveryStatus("picked", "confirmed"), false);
});

test("19. the official middle-mile and last-mile states may replace each other", () => {
    assert.equal(kasirDeliveryStatusRank("in_transit"), kasirDeliveryStatusRank("dropping_off"));
    assert.equal(resolveKasirDeliveryStatusUpdate("in_transit", "dropping_off"), "dropping_off");
    assert.equal(resolveKasirDeliveryStatusUpdate("dropping_off", "in_transit"), "in_transit");
    assert.equal(canAdvanceKasirDeliveryStatus("picked", "dropping_off"), true, "further progress is accepted");
});

test("20. an unrecognized provider value never overwrites a known state", () => {
    assert.equal(resolveKasirDeliveryStatusUpdate("picked", "some_new_state"), "picked");
    assert.equal(resolveKasirDeliveryStatusUpdate("confirmed", "weird_state"), "confirmed");
    // The first recognizable value does replace an unrecognized stored one.
    assert.equal(resolveKasirDeliveryStatusUpdate("some_new_state", "picking_up"), "picking_up");
    // Nothing is invented when the provider says nothing.
    assert.equal(resolveKasirDeliveryStatusUpdate(null, null), null);
    assert.equal(resolveKasirDeliveryStatusUpdate("picked", null), "picked");
    assert.equal(resolveKasirDeliveryStatusUpdate("picked", "   "), "picked");
    assert.equal(resolveKasirDeliveryStatusUpdate(null, "confirmed"), "confirmed");
});

test("21. a final failure is only replaced by a newer final truth", () => {
    assert.equal(isFinalKasirDeliveryStatus("cancelled"), true);
    assert.equal(isFinalKasirDeliveryStatus("courier_not_found"), true);
    assert.equal(isFinalKasirDeliveryStatus("on_hold"), false);
    assert.equal(isFinalKasirDeliveryStatus("picked"), false);

    assert.equal(resolveKasirDeliveryStatusUpdate("cancelled", "picking_up"), "cancelled");
    assert.equal(resolveKasirDeliveryStatusUpdate("courier_not_found", "confirmed"), "courier_not_found");
    assert.equal(resolveKasirDeliveryStatusUpdate("cancelled", "delivered"), "delivered");
    assert.equal(resolveKasirDeliveryStatusUpdate("picked", "cancelled"), "cancelled");
});

test("22. a hold is not final and may resolve back into real progress", () => {
    assert.equal(kasirDeliveryStatusRank("on_hold"), null);
    assert.equal(resolveKasirDeliveryStatusUpdate("on_hold", "picking_up"), "picking_up");
    assert.equal(resolveKasirDeliveryStatusUpdate("picking_up", "on_hold"), "on_hold");
    assert.equal(resolveKasirDeliveryStatusUpdate("delivered", "on_hold"), "delivered", "a finished delivery is never held");
});

// ---------------------------------------------------------------------------
// C. Wiring — the existing refresh route owns every write
// ---------------------------------------------------------------------------

test("23. the tracking refresh applies the progression policy before persisting", () => {
    assert.match(getCode, /const nextStatus = resolveKasirDeliveryStatusUpdate\(order\.biteshipStatus, remote\.status\);/);
    assert.match(getCode, /biteshipStatus: nextStatus,/);
    assert.doesNotMatch(getCode, /biteshipStatus: remote\.status \?\? order\.biteshipStatus/);

    // Tracking id / label url are only persisted when the provider really returned one.
    assert.match(getCode, /biteshipTrackingId: remote\.trackingId \?\? order\.biteshipTrackingId,/);
    assert.match(getCode, /biteshipLabelUrl: remote\.labelUrl \?\? order\.biteshipLabelUrl,/);
});

test("24. the refresh writes shipment fields only", () => {
    const updateBlock = getCode.slice(
        getCode.indexOf("prisma.order.update("),
        getCode.indexOf("return NextResponse.json({ order: biteshipOrderView(updated)"),
    );
    assert.ok(updateBlock.length > 0, "the refresh still persists the provider state");

    assert.deepEqual(
        [...updateBlock.matchAll(/^\s{16}([A-Za-z]+):/gm)].map((match) => match[1]).sort(),
        ["biteshipLabelUrl", "biteshipStatus", "biteshipTrackingId"],
    );
    for (const forbidden of ["payment", "stock", "subtotal", "shipping:", "total:", "items"]) {
        assert.equal(updateBlock.includes(forbidden), false, forbidden);
    }
});

test("25. the refresh path can never create a shipment or reach POST /v1/orders", () => {
    assert.doesNotMatch(getCode, /createBiteshipOrder/);
    assert.doesNotMatch(getCode, /method: "POST"/);
    assert.doesNotMatch(getCode, /\/v1\/orders/);
    assert.doesNotMatch(getCode, /updateMany/);
    // The claim marker is only READ as a guard; the refresh never writes one.
    assert.match(getCode, /order\.biteshipOrderId\.startsWith\(CLAIM_PREFIX\)/);
    assert.doesNotMatch(getCode, /biteshipOrderId: `\$\{CLAIM_PREFIX\}/);
    // It still synchronizes the EXISTING provider order, for an admin only.
    assert.match(getCode, /const remote = await retrieveBiteshipOrder\(order\.biteshipOrderId\);/);
    assert.match(getCode, /getCurrentAdmin\(\)/);
});

// ---------------------------------------------------------------------------
// D. Webhook decision + preserved production behaviour
// ---------------------------------------------------------------------------

test("26. no unverifiable Biteship webhook endpoint was added", () => {
    const apiDir = fileURLToPath(new URL("../src/app/api", import.meta.url));
    const files = walk(apiDir);

    // The audited official Biteship documentation describes the webhook events and payload but
    // NO verifiable authentication/signature, so a provider webhook was deliberately NOT added:
    // no endpoint under this API may accept a Biteship callback.
    const webhookFiles = files.filter((file) => /webhook/i.test(file));
    assert.ok(webhookFiles.length > 0, "the existing Midtrans webhook is untouched");
    for (const file of webhookFiles) {
        assert.doesNotMatch(fs.readFileSync(file, "utf8"), /biteship/i, `${file} must not accept Biteship callbacks`);
    }

    // The only Biteship order endpoint remains the admin-protected one.
    const biteshipRoutes = files.filter((file) => /biteship/i.test(file)).map((file) => file.split("/src/app/api/")[1]);
    assert.deepEqual(biteshipRoutes, ["admin/orders/[id]/biteship/route.ts"]);
});

test("27. the only Biteship mutation entry point stays admin-guarded and claimed", () => {
    assert.match(biteshipRoute, /export async function POST\(/);
    assert.match(code(biteshipRoute), /const admin = await getCurrentAdmin\(\);/);
    assert.match(code(biteshipRoute), /if \(!admin\) return NextResponse\.json\(\{ message: "Forbidden" \}, \{ status: 403 \}\);/);
    // Compare-and-set claim preserved verbatim (existing shipment idempotency stays intact).
    assert.match(biteshipRoute, /const CLAIM_PREFIX = "claim:";/);
    assert.match(biteshipRoute, /const claim = `\$\{CLAIM_PREFIX\}\$\{order\.id\}`;/);
});

test("28. polling stays conservative while no webhook is verified", () => {
    assert.ok(KASIR_DELIVERY_AUTO_REFRESH_MS >= 60_000, "at most one provider read per minute");
    assert.match(detail, /KASIR_DELIVERY_AUTO_REFRESH_MS/);
    assert.match(detail, /window\.setInterval\(/);
    assert.match(detail, /window\.clearInterval\(timer\)/);
    assert.match(detail, /document\.visibilityState !== "visible"/);
    assert.match(detail, /shouldAutoRefreshKasirDeliveryStatus\(\{/);

    // A terminal shipment stops asking the provider; a return/hold can still move.
    assert.equal(isKasirDeliveryStatusTerminal("TERKIRIM"), true);
    assert.equal(isKasirDeliveryStatusTerminal("GAGAL"), true);
    assert.equal(isKasirDeliveryStatusTerminal("DIKEMBALIKAN"), false);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, statusKey: "TERKIRIM" }), false);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, statusKey: "DALAM_PENGIRIMAN" }), true);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: false, statusKey: "MENUNGGU_PENGIRIMAN" }), false);
});

test("29. history stays compact and never renders the full timeline", () => {
    assert.match(history, /kasirOrderTypeLabel\(order\.orderType\)/);
    assert.match(history, /deliveryStatusBadgeClass\(order\.delivery\.status\.key\)/);
    assert.match(history, /Resi \{order\.delivery\.trackingId\}/);
    assert.match(history, /\{order\.delivery\.courier \? /);
    // Pickup rows render no delivery block at all (the single OrderKind cell is guarded by order.delivery
    // and reused by both the desktop table and the mobile card), and no card carries the timeline.
    assert.match(history, /\{order\.delivery \? \(/);
    assert.ok((history.match(/<OrderKind order=\{o\}\/>/g) || []).length >= 2, "desktop table and mobile card both render the compact kind cell");
    assert.doesNotMatch(code(history), /order\.delivery\.timeline/);
    assert.doesNotMatch(code(history), /KasirDeliveryTimeline|KASIR_DELIVERY_TIMELINE/);
});

test("30. struk (58mm + ESC/POS) prints the persisted status and never the timeline", () => {
    assert.match(receipt, /<Row label="Status Pengiriman" value=\{delivery\.status\.label\} \/>/);
    assert.match(receipt, /<Row label="No\. Resi \/ Tracking" value=\{delivery\.trackingId\} \/>/);
    assert.match(escpos, /\["Status Pengiriman", delivery\.status\]/);
    assert.match(escpos, /"No\. Resi \/ Tracking"/);

    for (const source of [code(receipt), code(escpos)]) {
        assert.doesNotMatch(source, /Timeline/i);
        assert.doesNotMatch(source, /Pesanan Diambil|Kurir Menuju Pickup/);
        assert.doesNotMatch(source, /biteshipOrderId|destinationAreaId|shippingQuoteRef/);
    }
});

test("31. the timeline needed no database change", () => {
    assert.match(schema, /biteshipStatus\s+String\?/);
    assert.match(schema, /biteshipTrackingId\s+String\?/);
    assert.match(schema, /biteshipLabelUrl\s+String\?/);
    assert.doesNotMatch(schema, /timeline/i, "the timeline is derived, never stored");
});
