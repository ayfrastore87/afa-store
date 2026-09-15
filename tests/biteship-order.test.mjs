import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    isOriginIdentityComplete,
    hasCourierCode,
    buildBiteshipOrderPayload,
    normalizeBiteshipOrderResponse,
    isBiteshipReferenceIdConflict,
} from "../src/lib/biteship-order.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const schema = read("../prisma/schema.prisma");
const migration = read("../prisma/migrations/20260915000000_add_biteship_order_fields/migration.sql");
const orderRoute = read("../src/app/api/checkout/order/route.ts");
const biteshipLib = read("../src/lib/biteship.ts");
const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
const adminDashboard = read("../src/components/admin/AdminDashboard.tsx");
const manualShipping = read("../src/app/api/admin/orders/[id]/shipping/route.ts");

const ORIGIN = { contactName: "AFA STORE", contactPhone: "081234567890", address: "Jl. Contoh No.1", areaId: "IDJK01" };

test("origin identity requires all four fields (no fake fallback)", () => {
    assert.equal(isOriginIdentityComplete(ORIGIN), true);
    assert.equal(isOriginIdentityComplete({ ...ORIGIN, contactName: "" }), false);
    assert.equal(isOriginIdentityComplete({ ...ORIGIN, contactPhone: " " }), false);
    assert.equal(isOriginIdentityComplete({ ...ORIGIN, address: "" }), false);
    assert.equal(isOriginIdentityComplete({ ...ORIGIN, areaId: "" }), false);
});

test("origin identity reads only server env and never exposes names to browser", () => {
    assert.match(biteshipLib, /BITESHIP_ORIGIN_CONTACT_NAME/);
    assert.match(biteshipLib, /BITESHIP_ORIGIN_CONTACT_PHONE/);
    assert.match(biteshipLib, /BITESHIP_ORIGIN_ADDRESS/);
    assert.match(biteshipLib, /BITESHIP_ORIGIN_AREA_ID/);
    assert.doesNotMatch(biteshipLib, /NEXT_PUBLIC/);
    assert.doesNotMatch(biteshipLib, /"0\d{9,}"/);
    assert.match(biteshipRoute, /BITESHIP_ORIGIN_INCOMPLETE_MESSAGE/);
    assert.match(biteshipRoute, /getBiteshipOriginIdentity\(\)/);
    assert.match(biteshipRoute, /status: 503/);
});

test("Order schema has separate courierCode from courier (display)", () => {
    assert.match(schema, /courier\s+String\?/);
    assert.match(schema, /courierCode\s+String\?/);
    assert.match(schema, /biteshipOrderId\s+String\?\s+@unique/);
});

test("migration adds courierCode + unique biteshipOrderId index only", () => {
    assert.match(migration, /ADD COLUMN "courierCode" TEXT/);
    assert.match(migration, /ADD COLUMN "biteshipOrderId" TEXT/);
    assert.match(migration, /CREATE UNIQUE INDEX "orders_biteshipOrderId_key"/);
    assert.doesNotMatch(migration, /DROP/);
    assert.doesNotMatch(migration, /ALTER COLUMN/);
});

test("checkout stores courierCode from selected.courierCode (server quote)", () => {
    assert.match(orderRoute, /courierCode = selected\.courierCode/);
    assert.match(orderRoute, /courierCode,/);
    assert.match(orderRoute, /selectRate\(quoted\.rates, selection\)/);
});

test("checkout keeps display name and code as separate persisted fields", () => {
    assert.match(orderRoute, /courier: courierName,/);
    assert.match(orderRoute, /courierCode,/);
    assert.match(orderRoute, /service: serviceName,/);
    assert.match(orderRoute, /serviceCode: selection\.serviceCode,/);
});

test("no hardcoded courier name -> code mapping exists", () => {
    assert.doesNotMatch(biteshipRoute, /JNE|J&T|SiCepat/i);
    assert.doesNotMatch(biteshipLib, /JNE|J&T|SiCepat/i);
    assert.doesNotMatch(orderRoute, /toLowerCase\(\).*courier/i);
});

test("legacy order with null courierCode is refused with manual-shipping message", () => {
    assert.match(biteshipRoute, /hasCourierCode\(order\.courierCode\)/);
    assert.match(biteshipRoute, /BITESHIP_LEGACY_COURIER_MESSAGE/);
    assert.equal(hasCourierCode(null), false);
    assert.equal(hasCourierCode(undefined), false);
    assert.equal(hasCourierCode(""), false);
    assert.equal(hasCourierCode("jne"), true);
});

test("Biteship payload uses courier_company=courierCode and courier_type=serviceCode", () => {
    const payload = buildBiteshipOrderPayload({
        origin: ORIGIN,
        destination: { contactName: "Buyer", contactPhone: "0899", address: "Addr", areaId: "IDBGR01" },
        courierCode: "jne",
        serviceCode: "reg",
        referenceId: "order_1",
        items: [{ name: "Rendang", value: 50000, quantity: 2, weight: 1000 }],
    });
    assert.equal(payload.courier_company, "jne");
    assert.equal(payload.courier_type, "reg");
    assert.equal(payload.reference_id, "order_1");
    assert.equal(payload.origin_area_id, ORIGIN.areaId);
    assert.deepEqual(payload.items, [{ name: "Rendang", value: 50000, quantity: 2, weight: 1000 }]);
});

test("route uses order.courierCode and order.serviceCode for Biteship", () => {
    assert.match(biteshipRoute, /courierCode: order\.courierCode!/);
    assert.match(biteshipRoute, /serviceCode: order\.serviceCode!/);
    assert.match(biteshipRoute, /referenceId: order\.id/);
});

test("hidePrice does not set item value to 0", () => {
    const payload = buildBiteshipOrderPayload({
        origin: ORIGIN,
        destination: { contactName: "B", contactPhone: "0", address: "A", areaId: "X" },
        courierCode: "jne",
        serviceCode: "reg",
        referenceId: "o",
        hidePrice: true,
        items: [{ name: "P", value: 10000, quantity: 1, weight: 500 }],
    });
    assert.equal(payload.items[0].value, 10000);
    assert.equal(payload.hidePrice, undefined);
});

test("normalizeBiteshipOrderResponse maps AWB/tracking/label", () => {
    const normalized = normalizeBiteshipOrderResponse({
        id: "ord123",
        status: "confirmed",
        price: 18000,
        courier: { company: "jne", type: "reg", waybill_id: "WYB-1", tracking_id: "TRK-1", link: "https://label" },
    });
    assert.deepEqual(normalized, {
        orderId: "ord123",
        waybillId: "WYB-1",
        trackingId: "TRK-1",
        labelUrl: "https://label",
        status: "confirmed",
        courierCompany: "jne",
        courierType: "reg",
        price: 18000,
    });
});

test("normalizeBiteshipOrderResponse returns null without id", () => {
    assert.equal(normalizeBiteshipOrderResponse({ status: "confirmed" }), null);
    assert.equal(normalizeBiteshipOrderResponse(null), null);
});

test("isBiteshipReferenceIdConflict detects code 40002060", () => {
    assert.deepEqual(isBiteshipReferenceIdConflict({ code: 40002060, details: { order_id: "existing", waybill_id: "WYB" } }), { orderId: "existing", waybillId: "WYB" });
    assert.deepEqual(isBiteshipReferenceIdConflict({ code: "40002060", details: {} }), { orderId: null, waybillId: null });
    assert.equal(isBiteshipReferenceIdConflict({ code: 40001 }), null);
    assert.equal(isBiteshipReferenceIdConflict(null), null);
});

test("concurrency protection: DB claim + reference_id conflict recovery", () => {
    assert.match(biteshipRoute, /updateMany\(\{/);
    assert.match(biteshipRoute, /where: \{ id, biteshipOrderId: null \}/);
    assert.match(biteshipRoute, /claimed\.count === 0/);
    assert.match(biteshipLib, /reference_id/);
    assert.match(biteshipLib, /isBiteshipReferenceIdConflict/);
    assert.match(biteshipRoute, /biteshipReferenceIdConflict/);
    assert.match(biteshipRoute, /retrieveBiteshipOrder/);
    assert.match(biteshipRoute, /releaseClaim/);
});

test("claim prefix cannot collide with a real Biteship order id", () => {
    assert.match(biteshipRoute, /const CLAIM_PREFIX = "claim:"/);
    assert.match(biteshipRoute, /startsWith\(CLAIM_PREFIX\)/);
});

test("Biteship creation requires PAID and blocks terminal statuses", () => {
    assert.match(biteshipRoute, /paymentStatus !== "PAID"/);
    assert.match(biteshipRoute, /BLOCKED_ORDER_STATUS/);
});

test("manual admin shipping endpoint remains untouched", () => {
    assert.match(manualShipping, /export async function POST/);
    assert.match(manualShipping, /courier/);
    assert.match(manualShipping, /trackingNumber/);
    assert.doesNotMatch(manualShipping, /biteshipOrderId|biteshipStatus|courierCode/);
});

test("QRIS Midtrans charge path is unchanged", () => {
    assert.match(orderRoute, /createMidtransQrisCharge/);
    assert.match(orderRoute, /name: "Ongkir", price: shipping, quantity: 1/);
});

test("admin dashboard still offers manual tracking alongside Biteship", () => {
    assert.match(adminDashboard, /PENGIRIMAN BITESHIP/);
    assert.match(adminDashboard, /PENGIRIMAN MANUAL/);
    assert.match(adminDashboard, /onCreateBiteship/);
    assert.match(adminDashboard, /courierCode/);
});

test("Biteship key remains server-only", () => {
    assert.match(biteshipLib, /import "server-only"/);
    assert.doesNotMatch(biteshipLib, /NEXT_PUBLIC/);
});
