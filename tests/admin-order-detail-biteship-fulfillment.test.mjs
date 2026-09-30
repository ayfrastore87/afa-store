import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const detail = fs.readFileSync(new URL("../src/components/admin/orders/OrderDetail.tsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../src/app/api/admin/orders/[id]/biteship/route.ts", import.meta.url), "utf8");
const delivery = fs.readFileSync(new URL("../src/lib/kasir-delivery.ts", import.meta.url), "utf8");

test("admin order detail exposes only an eligible explicit Biteship action", () => {
    assert.match(detail, /kasirShipmentAction\(/);
    assert.match(detail, /!hasRealShipment\(order\.biteshipOrderId\)/);
    assert.match(detail, /Buat Pengiriman Biteship/);
    assert.match(detail, /confirmButtonText: "Buat Pengiriman"/);
    assert.match(detail, /method: "POST"/);
    assert.match(detail, /Membuat Pengiriman\.\.\./);
});

test("the UI calls the canonical route only after confirmation and refreshes persisted order state", () => {
    assert.match(detail, /title: "Buat Pengiriman\?"/);
    assert.match(detail, /if \(!result\.isConfirmed\) return/);
    assert.match(detail, /fetch\(`\/api\/admin\/orders\/\$\{order\.id\}`\)/);
    assert.match(detail, /setOrder\(payload\.order\)/);
    assert.doesNotMatch(detail, /createBiteshipOrder|api\.biteship/);
});

test("backend eligibility and duplicate protection remain authoritative", () => {
    assert.match(route, /const cashier = await getCurrentCashier\(\)/);
    assert.match(route, /paymentStatus !== "PAID"/);
    assert.match(route, /destinationAreaId\?\.trim\(\)/);
    assert.match(route, /where: \{ id, biteshipOrderId: null \}/);
    assert.match(route, /const CLAIM_PREFIX = "claim:"/);
    assert.match(route, /40002060|biteshipReferenceIdConflict/);
    assert.match(delivery, /hasRealShipment/);
    assert.match(delivery, /SHIPMENT_BLOCKED_ORDER_STATUSES/);
});

test("shipment creation does not alter payment, stock, totals, or order completion", () => {
    const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function GET"));
    assert.doesNotMatch(post, /payment\.update|stock\s*:/);
    assert.doesNotMatch(post, /status:\s*["'](?:SHIPPED|COMPLETED)["']/);
    assert.match(post, /biteshipOrderId: created\.orderId/);
    assert.match(post, /biteshipTrackingId: created\.trackingId/);
});