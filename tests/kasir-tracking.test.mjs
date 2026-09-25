/*
 * Spec for the AFA STORE cashier DELIVERY TRACKING flow (Tahap F).
 *
 * The cashier delivery order created in Tahap E (courier/service frozen server-side,
 * shipment created once through POST /api/admin/orders/[id]/biteship with
 * `delivery_type: "now"`) now has to stay SYNCHRONIZED: provider status, resi,
 * latest update and the reprinted receipt.
 *
 * Architecture rules asserted here:
 *   - REUSE the existing infrastructure: no Biteship webhook is invented, the
 *     tracking sync is the EXISTING admin route (GET /api/admin/orders/[id]/biteship)
 *     which reads GET /v1/orders/:id only,
 *   - a refresh NEVER creates a second shipment and never touches
 *     payment / stock / totals / items,
 *   - the browser never talks to Biteship: no key, no provider payload, no raw error,
 *   - NO new database column / migration (existing Order shipping fields only),
 *   - unknown provider statuses degrade safely and are never shown as "Terkirim",
 *   - the pickup cashier flow and the shipment-creation fix stay untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    KASIR_DELIVERY_AUTO_REFRESH_MS,
    KASIR_TERMINAL_DELIVERY_STATUS_KEYS,
    isKasirDeliveryStatusTerminal,
    normalizeKasirDeliveryStatus,
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
const detail = read("../src/components/admin/kasir/KasirTransactionDetail.tsx");
const history = read("../src/components/admin/kasir/KasirHistory.tsx");
const receipt = read("../src/components/admin/kasir/KasirReceipt.tsx");
const printerPanel = read("../src/components/admin/kasir/KasirPrinterPanel.tsx");
const shipmentActions = read("../src/components/admin/kasir/KasirShipmentActions.tsx");
const posPanel = read("../src/components/admin/kasir/KasirPOS.tsx");
const deliveryPanel = read("../src/components/admin/kasir/KasirDeliveryPanel.tsx");
const picker = read("../src/components/admin/kasir/KasirLocationPicker.tsx");
const escpos = read("../src/lib/thermal-printer/escpos.ts");
const printerTypes = read("../src/lib/thermal-printer/printer-types.ts");
const schema = read("../prisma/schema.prisma");

/** The tracking refresh handler only (never the shipment-creation handler). */
const getHandler = biteshipRoute.slice(biteshipRoute.indexOf("export async function GET("));
/** The persisted-field write block of the refresh handler. */
const updateBlock = getHandler.slice(
    getHandler.indexOf("prisma.order.update("),
    getHandler.indexOf("return NextResponse.json({ order: biteshipOrderView(updated)"),
);

// 1. The provider status currently in Production maps to the cashier label in use today.
test("1. `confirmed` maps to the current cashier status (Kurir Dicari)", () => {
    const status = normalizeKasirDeliveryStatus({ biteshipStatus: "confirmed", hasShipment: true });
    assert.deepEqual(status, { key: "KURIR_DICARI", label: "Kurir Dicari", raw: "confirmed", known: true });
    assert.match(detail, /deliveryStatusBadgeClass\(delivery\.status\.key\)/);
});

// 2. Every provider status the integration can store is mapped explicitly.
test("2. known provider statuses map to the expected cashier stages", () => {
    const expected = {
        confirmed: "KURIR_DICARI",
        allocated: "DIPROSES",
        picking_up: "KURIR_MENUJU_PICKUP",
        picked: "PESANAN_DIAMBIL",
        dropping_off: "DALAM_PENGIRIMAN",
        delivered: "TERKIRIM",
        cancelled: "GAGAL",
        rejected: "GAGAL",
        returned: "DIKEMBALIKAN",
        on_hold: "DITAHAN",
    };
    for (const [raw, key] of Object.entries(expected)) {
        const status = normalizeKasirDeliveryStatus({ biteshipStatus: raw, hasShipment: true });
        assert.equal(status.key, key, `${raw} -> ${key}`);
        assert.equal(status.raw, raw, "the raw provider status is preserved verbatim");
        assert.equal(status.known, true);
    }
});

// 3. Unknown provider statuses degrade safely.
test("3. an unknown provider status never becomes Terkirim", () => {
    const unknown = normalizeKasirDeliveryStatus({ biteshipStatus: "some_new_state", hasShipment: true });
    assert.equal(unknown.key, "TIDAK_DIKENAL");
    assert.equal(unknown.known, false);
    assert.notEqual(unknown.key, "TERKIRIM");
    assert.equal(unknown.label, "some_new_state", "the raw provider status is shown instead of an invented one");
    // No shipment yet is not a delivery outcome either.
    const beforeShipment = normalizeKasirDeliveryStatus({ biteshipStatus: null, hasShipment: false });
    assert.equal(beforeShipment.key, "MENUNGGU_PENGIRIMAN");
    assert.notEqual(beforeShipment.key, "TERKIRIM");
});

// 4. A refresh is only possible for an EXISTING provider shipment.
test("4. tracking refresh requires a persisted biteshipOrderId", () => {
    assert.match(getHandler, /if \(!order\.biteshipOrderId \|\| order\.biteshipOrderId\.startsWith\(CLAIM_PREFIX\)\) \{/);
    assert.match(getHandler, /Pesanan ini belum memiliki pengiriman Biteship\./);
    assert.match(getHandler, /retrieveBiteshipOrder\(order\.biteshipOrderId\)/);
    // The UI only offers the refresh action once a real shipment exists.
    assert.match(shipmentActions, /canRefresh/);
    assert.match(detail, /canRefresh=\{delivery\.shipmentAction\.canRefresh\}/);
});

// 5. A refresh can never create a shipment.
test("5. tracking refresh never calls shipment creation", () => {
    assert.doesNotMatch(code(getHandler), /createBiteshipOrder|reference_id|\/v1\/orders/);
    // syncShipmentStatus does GET only, but COD confirmation uses POST separately
    const syncFnMatch = code(detail).match(/const syncShipmentStatus\s*=\s*useCallback[\s\S]*?},\s*\[applyShipmentSync,\s*id\]\);/m);
    if (syncFnMatch) {
        assert.doesNotMatch(syncFnMatch[0], /method:\s*"POST"/, "syncShipmentStatus must use GET only");
        assert.match(syncFnMatch[0], /method:\s*"GET"/, "syncShipmentStatus must call Biteship GET");
    }
    // Payment confirmation for COD exists separately and uses POST
    assert.match(code(detail), /payment\/confirm/, "COD payment confirm endpoint exists");
    assert.match(shipmentActions, /method: kind === "create" \? "POST" : "GET"/);
});

// 6. The sync writes shipment/tracking fields only.
test("6. provider status sync updates shipment fields only", () => {
    // The incoming provider status is resolved through the progression policy first, so a
    // duplicated / stale / unrecognized value can never overwrite a newer stored state.
    assert.match(code(getHandler), /const nextStatus = resolveKasirDeliveryStatusUpdate\(order\.biteshipStatus, remote\.status\);/);
    assert.match(updateBlock, /biteshipStatus: nextStatus,/, "the resolved status is what gets persisted");
    assert.match(updateBlock, /biteshipTrackingId: remote\.trackingId \?\? order\.biteshipTrackingId,/);
    assert.match(updateBlock, /biteshipLabelUrl: remote\.labelUrl \?\? order\.biteshipLabelUrl,/);
    assert.doesNotMatch(updateBlock, /payment|stock|subtotal|total|discount|voucher|items|cashReceived/i);
    // The refresh handler never re-prices, decrements stock or re-writes the order body.
    assert.doesNotMatch(code(getHandler), /prisma\.payment|prisma\.product|decrement|revalidateShipping|kasirOrderTotal/);
});

// 7. Payment, stock and monetary totals are outside the refresh path.
test("7. payment, stock and totals are untouched by a refresh", () => {
    assert.doesNotMatch(code(getHandler), /paymentStatus:|amount:|subtotal:|total:|shipping:/);
    // A refresh returns the sanitized shipment view, never the whole order body. The
    // sanitized `delivery` block added for performance is built from the same persisted
    // shipment columns, so it still carries no order body, no money and no PII.
    assert.match(
        getHandler,
        /NextResponse\.json\(\{ order: biteshipOrderView\(updated\), delivery: kasirShipmentSyncView\(updated\), refreshedAt: new Date\(\)\.toISOString\(\) \}\)/,
    );
    assert.doesNotMatch(code(getHandler), /formatKasirOrder|items:|customer:/, "the refresh never serializes the transaction");
    const viewBuilder = biteshipRoute.slice(
        biteshipRoute.indexOf("function biteshipOrderView("),
        biteshipRoute.indexOf("export async function POST("),
    );
    assert.doesNotMatch(viewBuilder, /subtotal|total|cashReceived|cash|change|payment/i);
    assert.doesNotMatch(viewBuilder, /address|phone|customer|note/i, "the shipment view carries no customer PII");
});

// 8. A resi is persisted only when the provider really returns one.
test("8. the tracking id is persisted only when the provider returns one", () => {
    assert.match(printerPanel, /trackingId: delivery\.trackingId/);
    assert.match(receipt, /delivery\.trackingId \? <Row label="No\. Resi \/ Tracking"/);
    assert.doesNotMatch(code(getHandler), /trackingId: "|-TRACK|-RESI|placeholder/i);
    // The persisted value keeps the previous one when the provider omits the field.
    assert.match(updateBlock, /remote\.trackingId \?\? order\.biteshipTrackingId/);
});

// 9. The detail card always shows the latest PERSISTED status.
test("9. transaction detail shows the latest persisted shipment state", () => {
    assert.match(detail, /delivery\.status\.label/);
    assert.match(detail, /<Row label="Status Provider" value=\{delivery\.status\.raw \|\| "-"\} \/>/);
    assert.match(detail, /<Row label="No\. Resi \/ Tracking" value=\{delivery\.trackingId \|\| "Belum tersedia"\} \/>/);
    assert.match(detail, /delivery\.lastUpdatedAt \? formatDate\(delivery\.lastUpdatedAt\) : "-"/);
    assert.match(detail, /value=\{delivery\.courier \|\| "-"\}/);
    assert.match(detail, /value=\{delivery\.service \|\| "-"\}/);
    // The payload that feeds the card is the persisted model plus the normalization.
    assert.match(kasirLib, /status: normalizeKasirDeliveryStatus\(\{ biteshipStatus: order\.biteshipStatus, hasShipment \}\)/);
    assert.match(kasirLib, /lastUpdatedAt: order\.updatedAt,/);
});

// 10. Riwayat Transaksi shows the shipment info for delivery orders only.
test("10. history shows the delivery status without cluttering pickup rows", () => {
    assert.match(history, /deliveryStatusBadgeClass\(order\.delivery\.status\.key\)/);
    // One guarded delivery block (OrderKind) is shared by the desktop table row and the mobile card.
    assert.match(history, /\{order\.delivery \? \(/);
    assert.ok(
        (history.match(/<OrderKind order=\{o\}\/>/g) || []).length >= 2,
        "desktop and mobile rows both render the guarded delivery block",
    );
    assert.match(history, /\{order\.delivery\.service \? ` • \$\{order\.delivery\.service\}` : ""\}/);
    assert.match(history, /\{order\.delivery\.trackingId \? /);
    assert.match(history, /Resi \{order\.delivery\.trackingId\}/);
    // The delivery information sits in the JENIS cell, next to "Kirim" / "Ambil Sendiri".
    assert.match(history, /"JENIS"/);
    assert.match(history, /kasirOrderTypeLabel\(order\.orderType\)/);
    // Rows open the Kasir detail route (not the admin one).
    assert.match(history, /href={`\/kasir\/transaksi\/\$\{o\.id\}`}/);
});

// 11. Both print paths use the latest persisted tracking/status.
test("11. the receipt and the 58mm reprint use the latest persisted tracking/status", () => {
    assert.match(receipt, /<Row label="Status Pengiriman" value=\{delivery\.status\.label\} \/>/);
    assert.match(receipt, /<Row label="Ongkir" value=\{formatRupiah\(delivery\.shipping\)\} \/>/);
    // Penerima / WhatsApp / Kurir / Layanan / Alamat are printed from the same payload.
    assert.match(receipt, /<Row label="Nama Penerima" value=\{delivery\.recipientName \|\| "-"\} \/>/);
    assert.match(receipt, /<Row label="No\. WhatsApp" value=\{delivery\.recipientPhone \|\| "-"\} \/>/);
    assert.match(receipt, /<Row label="Kurir" value=\{delivery\.courier\} \/>/);
    assert.match(receipt, /<Row label="Layanan" value=\{delivery\.service\} \/>/);
    assert.match(receipt, /receipt-address-label/);
    assert.match(escpos, /\["No\. WhatsApp", delivery\.recipientPhone \|\| "-"\],/);
    assert.match(printerPanel, /status: delivery\.status\.label,/);
    assert.match(escpos, /deliveryRows\.push\(\["Status Pengiriman", delivery\.status\]\)/);
    assert.match(escpos, /deliveryRows\.push\(\["Ongkir", delivery\.shippingLabel\]\)/);
    assert.match(printerTypes, /status\?: string \| null;/);
    // Both paths read the SAME server payload (which already excludes internals).
    assert.match(printerPanel, /const delivery = order\.delivery;/);
    assert.match(receipt, /const delivery = order\.delivery;/);
});

// 12. A pickup receipt is untouched by the tracking feature.
test("12. the pickup receipt remains unchanged", () => {
    assert.match(receipt, /\{delivery \? \(/);
    assert.match(escpos, /if \(data\.delivery\) \{/);
    assert.match(printerPanel, /shippingLabel: delivery && delivery\.shipping > 0 \? formatRupiah\(delivery\.shipping\) : null,/);
    assert.match(printerPanel, /delivery: delivery\s*\n?\s*\? \{/);
});

// 13. Internal ids and secrets never reach the screen or the paper.
test("13. internal Biteship ids and secrets never appear on the receipt", () => {
    for (const source of [receipt, printerPanel, posPanel, deliveryPanel, picker, history, detail, shipmentActions]) {
        assert.doesNotMatch(code(source), /BITESHIP_API_KEY|MIDTRANS_SERVER_KEY|SUPABASE_SERVICE_ROLE/i);
    }
    assert.doesNotMatch(code(receipt), /destinationAreaId|shippingQuoteRef|biteshipOrderId|courierCode|serviceCode/);
    assert.doesNotMatch(code(printerPanel), /destinationAreaId|shippingQuoteRef|biteshipOrderId/);
    assert.doesNotMatch(code(escpos), /destinationAreaId|shippingQuoteRef|biteshipOrderId/);
    assert.doesNotMatch(code(detail), /destinationAreaId|shippingQuoteRef|biteshipOrderId/);
});

// 14. The refresh endpoint is admin-only.
test("14. the tracking refresh endpoint requires admin authentication", () => {
    assert.match(getHandler, /const admin = await getCurrentAdmin\(\);/);
    assert.match(getHandler, /if \(!admin\) return NextResponse\.json\(\{ message: "Forbidden" \}, \{ status: 403 \}\);/);
    assert.equal((biteshipRoute.match(/getCurrentAdmin\(\)/g) || []).length, 2, "both handlers stay guarded");
    assert.match(shipmentActions, /\/api\/admin\/orders\/\$\{orderId\}\/biteship/);
});

// 15. Terminal states never poll.
test("15. a terminal delivery status needs no further polling", () => {
    assert.deepEqual([...KASIR_TERMINAL_DELIVERY_STATUS_KEYS], ["TERKIRIM", "GAGAL"]);
    assert.equal(isKasirDeliveryStatusTerminal("TERKIRIM"), true);
    assert.equal(isKasirDeliveryStatusTerminal("GAGAL"), true);
    assert.equal(isKasirDeliveryStatusTerminal("DALAM_PENGIRIMAN"), false);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, statusKey: "TERKIRIM" }), false);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, statusKey: "GAGAL" }), false);
    // A raw provider status is handled as well, so a finished shipment can never keep polling.
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, biteshipStatus: "delivered" }), false);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, biteshipStatus: "cancelled" }), false);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, biteshipStatus: "confirmed" }), true);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: true, biteshipStatus: "dropping_off" }), true);
    assert.equal(shouldAutoRefreshKasirDeliveryStatus({ hasShipment: false, statusKey: "KURIR_DICARI" }), false);
    assert.ok(KASIR_DELIVERY_AUTO_REFRESH_MS >= 60_000, "the automatic interval is conservative (>= 60s)");
    // Polling exists ONLY on the open detail page and is cleaned up on unmount / hidden tab.
    assert.match(detail, /shouldAutoRefreshKasirDeliveryStatus\(\{/);
    assert.match(detail, /document\.visibilityState !== "visible"/);
    assert.match(detail, /window\.clearInterval\(timer\)/);
    assert.doesNotMatch(code(history), /setInterval/);
    assert.doesNotMatch(code(posPanel), /setInterval/);
});

// 16. Repeating the refresh is idempotent.
test("16. a repeated refresh is idempotent", () => {
    assert.match(shipmentActions, /if \(busy\) return;/);
    assert.match(getHandler, /const updated = await prisma\.order\.update\(\{/);
    assert.doesNotMatch(code(getHandler), /prisma\.order\.create/);
    // Creation keeps its compare-and-set claim and is never re-entered by a refresh.
    assert.match(biteshipRoute, /const CLAIM_PREFIX = "claim:";/);
    assert.match(biteshipRoute, /biteshipOrderId: null \},\s*data: \{ biteshipOrderId: claim \},/);
    assert.match(biteshipRoute, /await releaseClaim\(\)/);
});

// 17. Shipment creation stays exactly as it is.
test("17. the existing Biteship order creation remains green", () => {
    assert.match(biteshipRoute, /export async function POST\(/);
    assert.match(biteshipRoute, /createBiteshipOrder\(\{/);
    assert.match(
        biteshipRoute,
        /if \(order\.biteshipOrderId && !order\.biteshipOrderId\.startsWith\(CLAIM_PREFIX\)\) \{\s*return NextResponse\.json\(\{ order: biteshipOrderView\(order\) \}\)/,
    );
    assert.match(biteshipRoute, /import \{\s*BiteshipError,/);
});

// 18. The delivery_type fix that made Production succeed stays in place.
test('18. the required `delivery_type: "now"` shipment fix remains green', () => {
    const payload = buildBiteshipOrderPayload({
        origin: { contactName: "AFA STORE", contactPhone: "081234567890", address: "Jl. Contoh No.1", areaId: "IDJK01" },
        destination: { contactName: "Budi", contactPhone: "081234567890", address: "Jl. Tujuan No.2", areaId: "IDJC07" },
        courierCode: "jne",
        serviceCode: "reg",
        referenceId: "order-1",
        items: [{ name: "Produk", value: 100000, quantity: 1, weight: 1000 }],
    });
    assert.equal(payload.delivery_type, BITESHIP_DELIVERY_TYPE_NOW);
    assert.equal(payload.delivery_type, "now");
    assert.equal(payload.courier_company, "jne", "the provider code is sent, never the display name");
    assert.equal(payload.courier_type, "reg");
    assert.equal("delivery_date" in payload, false, "a scheduled pickup is never booked implicitly");
});

// 19. The existing cashier delivery contract is untouched.
test("19. the existing cashier delivery contract is preserved", () => {
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "picking_up", hasShipment: true }).label, "Kurir Menuju Pickup");
    assert.match(kasirLib, /export function formatKasirOrder/);
    assert.match(kasirLib, /shipmentAction,/);
    assert.match(detail, /<KasirShipmentActions/);
    assert.match(shipmentActions, /BUAT PENGIRIMAN/);
    assert.match(shipmentActions, /PERBARUI STATUS/);
    // Pickup orders go PAID, DELIVERY TUNAI and QRIS get WAITING_PAYMENT/PENDING
    const paymentStatusMatch = read("../src/app/api/admin/kasir/order/route.ts").match(/paymentStatus:\s*(.*),/);
    assert.ok(paymentStatusMatch, "paymentStatus must be assigned");
    const paymentExpr = paymentStatusMatch[1].trim();
    const psFn = new Function("orderType", "method", "return (" + paymentExpr + ");");
    assert.equal(psFn("DELIVERY", "TUNAI"), "WAITING_PAYMENT", "DELIVERY+TUNAI starts WAITING_PAYMENT");
    assert.equal(psFn("PICKUP", "TUNAI"), "PAID", "PICKUP+TUNAI starts PAID");
    assert.equal(psFn("DELIVERY", "QRIS"), "WAITING_PAYMENT", "DELIVERY+QRIS starts WAITING_PAYMENT");
});

// 20. The customer checkout flow keeps using the same Biteship architecture.
test("20. the customer checkout architecture is untouched", () => {
    const checkoutPage = read("../src/app/checkout/page.tsx");
    const checkoutOrderRoute = read("../src/app/api/checkout/order/route.ts");
    assert.match(checkoutPage, /<CheckoutLocationMap/);
    assert.match(checkoutPage, /mustInvalidateShipping\(quoteSignature, destinationSignature\)/);
    assert.match(checkoutOrderRoute, /getBiteshipRates\(\{/);
    assert.match(checkoutOrderRoute, /destinationAreaId/);
});

// 21. No unnecessary customer-session request is introduced on the admin kasir pages.
test("21. admin kasir pages never call the customer-only /api/auth/me", () => {
    for (const source of [posPanel, deliveryPanel, picker, receipt, printerPanel, shipmentActions, history, detail]) {
        assert.doesNotMatch(code(source), /\/api\/auth\/me/, "the admin kasir UI must not probe the customer session");
    }
    // The operator identity the receipt needs is part of the admin-authorized payload.
    assert.match(detailRoute, /cashier: \{ name: admin\.name \}/);
    assert.match(detail, /setCashierName\(payload\.cashier\?\.name \?\? ""\)/);
    assert.equal((detail.match(/cashierName=\{cashierName\}/g) || []).length, 2, "receipt + printer panel both use it");
    assert.match(receipt, /cashierName\?: string \| null;/);
    // The endpoint itself stays customer-only: an admin is never exposed as a customer.
    assert.match(read("../src/app/api/auth/me/route.ts"), /getCurrentCustomer\(\)/);
});

// Tracking reuses the persisted Order shipping columns: no migration, no new column.
test("tracking reuses existing persisted shipment fields (no schema change)", () => {
    for (const field of ["biteshipOrderId", "biteshipStatus", "biteshipTrackingId", "biteshipLabelUrl", "trackingNumber", "updatedAt"]) {
        assert.match(schema, new RegExp(`^\\s+${field}\\s`, "m"), `Order.${field} must already exist`);
    }
    // The refresh reads/writes those SAME columns only — now through an explicit narrow
    // select, so it never pulls the rest of the order row. Still no migration, no new column.
    assert.match(getHandler, /prisma\.order\.findUnique\(\{\s*where: \{ id \},\s*select: SHIPMENT_SYNC_SELECT,\s*\}\)/);
    const select = biteshipRoute.slice(biteshipRoute.indexOf("const SHIPMENT_SYNC_SELECT"), biteshipRoute.indexOf("} as const;"));
    for (const field of select.matchAll(/^\s+(\w+): true,$/gm)) {
        assert.match(schema, new RegExp(`^\\s+${field[1]}\\s`, "m"), `Order.${field[1]} must already exist`);
    }
});
