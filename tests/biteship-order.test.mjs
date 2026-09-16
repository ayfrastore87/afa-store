import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    BITESHIP_DELIVERY_TYPE_NOW,
    BITESHIP_LEGACY_PHONE_MESSAGE,
    BITESHIP_ORDER_REJECTED_MESSAGE,
    isOriginIdentityComplete,
    hasCourierCode,
    buildBiteshipOrderPayload,
    normalizeBiteshipOrderResponse,
    isBiteshipReferenceIdConflict,
} from "../src/lib/biteship-order.ts";
import { normalizeBiteshipRatesResponse } from "../src/lib/biteship-normalize.ts";
import { resolveProductWeight } from "../src/lib/shipping-weight.ts";
import { normalizeRecipientPhone } from "../src/lib/checkout-address.ts";

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

// ---------------------------------------------------------------------------
// Shipment creation failure handling (cashier/admin POST /biteship)
// ---------------------------------------------------------------------------

test("order creation normalizes the REAL provider status/body instead of a blanket retry", () => {
    // The raw transport logs ONLY the sanitized allowlisted fields.
    assert.match(
        biteshipLib,
        /console\.error\("biteship_request_failed", \{ path, status: response\.status, \.\.\.pickBiteshipErrorFields\(data\) \}\);/,
    );
    // The response status AND body decide the outcome.
    assert.match(biteshipLib, /const fields = pickBiteshipErrorFields\(data\);/);
    assert.match(biteshipLib, /isBiteshipProviderFailure\(status, fields\)/);
    assert.match(
        biteshipLib,
        /throw new BiteshipUnavailableError\(BITESHIP_FAILURE_MESSAGES\.provider, "UPSTREAM", "provider"\)/,
    );
    assert.match(biteshipLib, /if \(status >= 500\) throw new BiteshipUnavailableError\(\);/);
    assert.match(biteshipLib, /throw new BiteshipError\(BITESHIP_ORDER_REJECTED_MESSAGE\);/);
    // The misleading blanket message is gone.
    assert.doesNotMatch(biteshipLib, /Biteship order gagal dibuat/);
    // The idempotency conflict still wins over the new mapping.
    assert.ok(
        biteshipLib.indexOf("isBiteshipReferenceIdConflict(data)") < biteshipLib.indexOf("isBiteshipProviderFailure(status, fields)"),
        "reference_id conflict recovery must be evaluated first",
    );
});

test("shipment failure messages are admin-safe, actionable and carry no provider text", () => {
    assert.match(BITESHIP_ORDER_REJECTED_MESSAGE, /Biteship menolak/i);
    assert.match(BITESHIP_ORDER_REJECTED_MESSAGE, /periksa kurir, layanan, dan area tujuan/i);
    for (const message of [BITESHIP_ORDER_REJECTED_MESSAGE, BITESHIP_LEGACY_PHONE_MESSAGE]) {
        assert.ok(message.length <= 200, "a user-visible message stays short");
        assert.doesNotMatch(message, /insufficient|balance|quota|api\s?key|unauthoriz|rate limit|\b(?:401|402|403|429)\b/i);
        assert.doesNotMatch(message, /https?:|prisma|\bsql\b|\{|\}|<|>/);
        assert.doesNotMatch(message, /0812|62812|\+62/);
    }
    assert.match(BITESHIP_LEGACY_PHONE_MESSAGE, /nomor penerima/i);
});

test("no API key, header, raw body, PII or env name is ever logged", () => {
    const logLines = biteshipLib.split("\n").filter((line) => /console\.(?:error|warn|log)\(/.test(line));
    assert.ok(logLines.length > 0, "failures are still diagnosed");
    for (const line of logLines) {
        assert.doesNotMatch(line, /Authorization|apiKey|JSON\.stringify\(|\bheaders\b/);
        assert.doesNotMatch(line, /contactPhone|order\.phone|customerName|destination_contact_/);
        assert.doesNotMatch(line, /BITESHIP_API_KEY|process\.env\.\w+\s*[,}]/);
    }
    const routeLogLines = biteshipRoute.split("\n").filter((line) => /console\.(?:error|warn|log)\(/.test(line));
    for (const line of routeLogLines) {
        assert.doesNotMatch(line, /Authorization|apiKey|JSON\.stringify\(|\bheaders\b|order\.phone/);
    }
});



test("phones sent to Biteship reuse the existing checkout normalizer", () => {
    // Exactly ONE phone implementation may exist (the shared checkout helper).
    const phoneImplementations = ["checkout-address", "biteship-order", "biteship", "kasir-delivery", "shipping-weight"]
        .map((name) => read(`../src/lib/${name}.ts`))
        .filter((source) => /export function normalizeRecipientPhone\(/.test(source));
    assert.equal(phoneImplementations.length, 1, "phone canonicalization must not be duplicated");
    assert.match(read("../src/lib/checkout-address.ts"), /export function normalizeRecipientPhone\(value: unknown\): string \{/);

    // The cashier/admin route canonicalizes the stored order phone BEFORE posting.
    assert.match(biteshipRoute, /const recipientPhone = normalizeRecipientPhone\(order\.phone\);/);
    assert.match(biteshipRoute, /contactPhone: recipientPhone,/);
    assert.match(
        biteshipRoute,
        /if \(!recipientPhone\) \{\s*return NextResponse\.json\(\{ message: BITESHIP_LEGACY_PHONE_MESSAGE \}, \{ status: 409 \}\);/,
    );
    assert.match(biteshipRoute, /import \{ normalizeRecipientPhone \} from "@\/lib\/checkout-address";/);
    // The optional label-only shipper phone is never posted raw.
    assert.match(
        biteshipRoute,
        /senderPhone: order\.senderPhone \? normalizeRecipientPhone\(order\.senderPhone\) \|\| undefined : undefined,/,
    );
    // The server-owned env origin phone is canonicalized too.
    assert.match(biteshipLib, /const canonicalOriginPhone = normalizeRecipientPhone\(contactPhone\);/);
    assert.match(biteshipLib, /return \{ contactName, contactPhone: canonicalOriginPhone, address, areaId: originAreaId \};/);

    // End to end: the shared normalizer + the payload builder compose to the exact
    // canonical value Biteship receives for the env origin and the stored order phone.
    assert.equal(normalizeRecipientPhone(ORIGIN.contactPhone), "6281234567890");
    assert.equal(normalizeRecipientPhone("0812 3456 7890"), "6281234567890");
    assert.equal(normalizeRecipientPhone("+62 812-3456-7890"), "6281234567890");
    assert.equal(normalizeRecipientPhone("n/a"), "", "an unusable phone stays unusable (never invented)");

    const payload = buildBiteshipOrderPayload({
        origin: { ...ORIGIN, contactPhone: normalizeRecipientPhone(ORIGIN.contactPhone) },
        destination: {
            contactName: "Buyer",
            contactPhone: normalizeRecipientPhone("+62 812-3456-7890"),
            address: "Addr",
            areaId: "IDBGR01",
        },
        courierCode: "jne",
        serviceCode: "reg",
        referenceId: "order_phone",
        items: [{ name: "Rendang", value: 50000, quantity: 1, weight: 1000 }],
    });
    assert.equal(payload.origin_contact_phone, "6281234567890");
    assert.equal(payload.destination_contact_phone, "6281234567890");
    assert.equal(payload.origin_area_id, "IDJK01", "the server origin area is still authoritative");
    assert.equal(payload.shipper_contact_phone, undefined, "no shipper phone is invented when none is stored");

    // No second phone regex/ladder anywhere in the shipment path.
    assert.doesNotMatch(read("../src/lib/biteship-order.ts"), /replace\(\/\\D\/g/);
    // The payload builder stays dependency-free (no "@/" aliases) so the raw-node
    // test runner can load it: canonicalization belongs to the server callers.
    assert.doesNotMatch(read("../src/lib/biteship-order.ts"), /from "@\//);
    assert.doesNotMatch(biteshipRoute, /replace\(\/\\D\/g/);
});

test("the shipment weight is the authoritative product weight, never a zero/browser value", () => {
    assert.equal(resolveProductWeight(0), 1000, "legacy weight 0 is backfilled by the existing rule");
    assert.equal(resolveProductWeight(null), 1000);
    assert.equal(resolveProductWeight(750), 750);
    assert.match(biteshipRoute, /weight: resolveProductWeight\(item\.weight\)/);
    // The route reads the frozen OrderItem snapshot only (never a client body).
    assert.doesNotMatch(biteshipRoute, /request\.json\(\)/);
});

test("safe retry stays intact: claim first, release on failure, no duplicate shipment", () => {
    const postHandler = biteshipRoute.slice(
        biteshipRoute.indexOf("export async function POST("),
        biteshipRoute.indexOf("export async function GET("),
    );
    const claimAt = postHandler.indexOf("const claimed = await prisma.order.updateMany({");
    const providerCallAt = postHandler.indexOf("await createBiteshipOrder(");
    const conflictAt = postHandler.indexOf("conflict?.orderId");
    const releaseAt = postHandler.indexOf("await releaseClaim()");
    assert.ok(claimAt > -1 && providerCallAt > claimAt, "the durable claim is taken before the provider call");
    assert.ok(conflictAt > -1 && conflictAt < releaseAt, "an existing shipment is recovered before the claim is released");
    assert.match(postHandler, /await releaseClaim\(\)\.catch\(\(\) => undefined\);/);
    assert.match(postHandler, /if \(error instanceof BiteshipUnavailableError\) \{\s*return NextResponse\.json\(\{ message: error\.message \}, \{ status: 503 \}\);/);
    assert.match(postHandler, /if \(error instanceof BiteshipError\) \{\s*return NextResponse\.json\(\{ message: error\.message \}, \{ status: 400 \}\);/);
    // Nothing in the failure path touches the paid transaction, payment or stock.
    assert.doesNotMatch(postHandler, /prisma\.(?:payment|product)\b|decrement/);
});

// ---------------------------------------------------------------------------
// Production 4xx root cause: POST /v1/orders REQUIRES `delivery_type`
// ---------------------------------------------------------------------------
// Production evidence: a paid AFA delivery order quoted JNE / Reguler / Rp16.000
// successfully, but POST /v1/orders was rejected with a NON-provider 4xx. The
// official create-order contract marks `delivery_type` ("now" | "scheduled") as
// REQUIRED, while POST /v1/rates/couriers does not need it at all — so the quote
// succeeded and only the shipment request was rejected. Every other REQUIRED
// field was already sent. These tests pin the whole required-field contract so
// the same 4xx can never come back silently.
test("the provider-REQUIRED delivery_type is always sent on shipment creation", () => {
    const payload = buildBiteshipOrderPayload({
        origin: ORIGIN,
        destination: { contactName: "Buyer", contactPhone: "0899", address: "Addr", areaId: "IDBGR01" },
        courierCode: "jne",
        serviceCode: "reg",
        referenceId: "order_delivery_type",
        items: [{ name: "Rendang", value: 50000, quantity: 1, weight: 1000 }],
    });
    assert.equal(BITESHIP_DELIVERY_TYPE_NOW, "now");
    assert.equal(payload.delivery_type, "now", "delivery_type is required by POST /v1/orders");
    // Only immediate pickup is ever booked: no schedule input exists in the shipment
    // path, and a browser-supplied date/time must never be introduced.
    assert.doesNotMatch(read("../src/lib/biteship-order.ts"), /input\.deliveryDate|input\.deliveryTime/);
    assert.doesNotMatch(biteshipRoute, /delivery_date|delivery_time|deliveryDate|deliveryTime/);
});

test("the payload carries every field POST /v1/orders marks REQUIRED", () => {
    const payload = buildBiteshipOrderPayload({
        origin: ORIGIN,
        destination: { contactName: "Buyer", contactPhone: "0899", address: "Addr", areaId: "IDBGR01" },
        courierCode: "jne",
        serviceCode: "reg",
        referenceId: "order_required_fields",
        items: [{ name: "Rendang", value: 50000, quantity: 2, weight: 1000 }],
    });

    // Fields the provider's create-order contract marks REQUIRED.
    const requiredFields = [
        "origin_contact_name",
        "origin_contact_phone",
        "origin_address",
        "destination_contact_name",
        "destination_contact_phone",
        "destination_address",
        "courier_company",
        "courier_type",
        "delivery_type",
    ];
    for (const field of requiredFields) {
        assert.ok(String(payload[field] ?? "").trim().length > 0, `${field} must be present and non-empty`);
    }

    // Both endpoints satisfy "at least postal code, coordinates or area id".
    assert.ok(String(payload.origin_area_id).trim().length > 0);
    assert.ok(String(payload.destination_area_id).trim().length > 0);

    // items[] and its REQUIRED children (name/value/quantity/weight).
    assert.ok(Array.isArray(payload.items) && payload.items.length > 0, "item count must be > 0");
    for (const item of payload.items) {
        assert.ok(String(item.name).trim().length > 0, "items[].name is required");
        assert.ok(item.value > 0, "items[].value is required");
        assert.ok(item.quantity > 0, "items[].quantity is required");
        assert.ok(item.weight > 0, "items[].weight is required");
    }
});

test("the shipment reuses the EXACT provider identifiers that produced the quote", () => {
    // The Rp16.000 production quote row: display "JNE" / "Reguler", but the CODES
    // Biteship must receive are courier_code "jne" and courier_service_code "reg".
    const [rate] = normalizeBiteshipRatesResponse({
        pricing: [
            {
                courier_code: "jne",
                courier_name: "JNE",
                courier_service_code: "reg",
                courier_service_name: "Reguler",
                price: 16000,
                duration: "2-3",
            },
        ],
    });
    assert.equal(rate.courierCode, "jne");
    assert.equal(rate.serviceCode, "reg", "the display name 'Reguler' is never persisted as the code");
    assert.equal(rate.serviceName, "Reguler");
    assert.equal(rate.quoteRef, "jne|reg");

    // The persisted Order columns and the shipment payload therefore match the rate
    // row field-for-field: no display label is ever translated into a code.
    const payload = buildBiteshipOrderPayload({
        origin: ORIGIN,
        destination: { contactName: "Buyer", contactPhone: "0899", address: "Cianjur, Jawa Barat, 43211, Indonesia", areaId: "IDCJR01" },
        courierCode: rate.courierCode,
        serviceCode: rate.serviceCode,
        referenceId: "order_parity",
        items: [{ name: "Rendang", value: 50000, quantity: 1, weight: 1000 }],
    });
    assert.equal(payload.courier_company, "jne");
    assert.equal(payload.courier_type, "reg");
    assert.equal(payload.origin_area_id, ORIGIN.areaId, "origin area id matches the one used for rates");
    assert.equal(payload.destination_area_id, "IDCJR01", "destination area id matches the one used for rates");
    assert.equal(payload.delivery_type, "now");
    assert.match(read("../src/lib/shipping-weight.ts"), /rate\.courierCode === courier && rate\.serviceCode === service/);
});
