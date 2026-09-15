import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateProductWeightInput, calculateTotalWeight, selectRate } from "../src/lib/shipping-weight.ts";
import { normalizeBiteshipRatesResponse, normalizeRate } from "../src/lib/biteship-normalize.ts";
import { normalizeAreaId, denyArbitraryAreaId } from "../src/lib/shipping-destination.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const schema = read("../prisma/schema.prisma");
const validation = read("../src/lib/product-validation.ts");
const orderRoute = read("../src/app/api/checkout/order/route.ts");
const ratesRoute = read("../src/app/api/shipping/rates/route.ts");
const areasRoute = read("../src/app/api/shipping/areas/route.ts");
const biteshipLib = read("../src/lib/biteship.ts");
const midtrans = read("../src/lib/midtrans.ts");
const webhook = read("../src/app/api/midtrans/webhook/route.ts");
const checkoutPage = read("../src/app/checkout/page.tsx");

// 1. Product weight validation
test("validateProductWeightInput accepts positive integers in grams, rejects junk", () => {
    assert.equal(validateProductWeightInput(1000), 1000);
    assert.equal(validateProductWeightInput("250"), 250);
    assert.equal(validateProductWeightInput(0), null);
    assert.equal(validateProductWeightInput(-5), null);
    assert.equal(validateProductWeightInput(1.5), null);
    assert.equal(validateProductWeightInput("abc"), null);
    assert.equal(validateProductWeightInput(2_000_000), null);
});

test("product schema keeps size as text and adds integer weight (grams)", () => {
    assert.match(validation, /size:\s*z\.string\(\)/);
    assert.match(validation, /weight:\s*z\.number\(\)\.int\(\)\.min\(/);
});

test("size is not parsed as weight", () => {
    assert.match(schema, /size\s+String\?/);
    assert.match(schema, /weight\s+Int\s+@default\(1000\)/);
});

// 2. Authoritative server-side weight
test("calculateTotalWeight derives total server-side, ignoring client data", () => {
    const items = [
        { id: "p1", weight: 500, qty: 2 },
        { id: "p2", weight: 1000, qty: 1 },
    ];
    assert.equal(calculateTotalWeight(items), 2000);
});

test("weight is never taken from the client in the rates route", () => {
    assert.match(ratesRoute, /weight:\s*true/);
    assert.match(ratesRoute, /calculateTotalWeight/);
});

// 3. Biteship response normalization
test("normalizes Biteship pricing rows to required fields only", () => {
    const rates = normalizeBiteshipRatesResponse({
        pricing: [
            { courier_code: "jne", courier_name: "JNE", courier_service_code: "reg", courier_service_name: "REG", price: 18000, duration: "2-3" },
            { courier_code: "sicepat", courier_service_code: "best", company: "SiCepat", price: "15000" },
            { courier_code: "", courier_service_code: "reg", price: 10000 },
            { courier_code: "jnt", courier_service_code: "", price: 9000 },
        ],
    });
    assert.equal(rates.length, 2);
    assert.deepEqual(rates[0], { courierCode: "sicepat", courierName: "SiCepat", serviceCode: "best", serviceName: "best", price: 15000, duration: null, quoteRef: "sicepat|best" });
    assert.equal(rates[1].courierCode, "jne");
    assert.equal(rates[1].price, 18000);
});

test("normalizeRate rejects negatives / NaN", () => {
    assert.equal(normalizeRate({ courier_code: "jne", courier_service_code: "reg", price: -1 }), null);
    assert.equal(normalizeRate({ courier_code: "jne", courier_service_code: "reg", price: "abc" }), null);
});

// 4. Rate selection
test("selectRate matches only by courier + service, ignoring price", () => {
    const rates = normalizeBiteshipRatesResponse({ pricing: [{ courier_code: "jne", courier_service_code: "reg", price: 18000 }] });
    assert.equal(selectRate(rates, { courierCode: "jne", serviceCode: "reg" })?.price, 18000);
    assert.equal(selectRate(rates, { courierCode: "jne", serviceCode: "yes" }), null);
});

// 5. Client cannot tamper shipping price
test("order route never reads shipping price from the request body", () => {
    assert.doesNotMatch(orderRoute, /address\.price/);
    assert.match(orderRoute, /selectRate\(quoted\.rates, selection\)/);
    assert.match(orderRoute, /shipping = selected\.price/);
    assert.match(orderRoute, /total = subtotal \+ shipping/);
});

// 6. Client cannot tamper product weight in order route
test("order route re-authorizes products with server weight", () => {
    assert.match(orderRoute, /authorizeProductItems/);
    assert.match(orderRoute, /calculateTotalWeight/);
});

// 7. Midtrans gross_amount remains subtotal + validated shipping
test("Midtrans charge uses server total and keeps Ongkir item", () => {
    assert.match(orderRoute, /amount: total/);
    assert.match(orderRoute, /name: "Ongkir", price: shipping, quantity: 1/);
});

// 8. Checkout idempotency preserved
test("checkout idempotency key + request hash are still enforced", () => {
    assert.match(orderRoute, /normalizeIdempotencyKey/);
    assert.match(orderRoute, /checkoutRequestHash/);
    assert.match(orderRoute, /checkoutIdempotency\.create/);
});

// 8A. Idempotency resolution happens BEFORE any Biteship / external call
test("existing idempotency record is resolved before any live Biteship quote", () => {
    const idempotencyIdx = orderRoute.indexOf("prisma.checkoutIdempotency.findUnique");
    const biteshipIdx = orderRoute.indexOf("getBiteshipRates(");
    assert.ok(idempotencyIdx !== -1, "idempotency findUnique must exist");
    assert.ok(biteshipIdx !== -1, "getBiteshipRates call must exist");
    assert.ok(idempotencyIdx < biteshipIdx, "idempotency findUnique must run before getBiteshipRates");
});

// 8B. Same key retry returns the stored responsePayload (no fresh quote needed)
test("same-key retry returns stored responsePayload without re-quoting", () => {
    assert.match(orderRoute, /if \(existing\.responsePayload\) return NextResponse\.json\(existing\.responsePayload, \{ status: 201 \}\)/);
    // The responsePayload branch must appear before the Biteship call.
    const payloadIdx = orderRoute.indexOf("existing.responsePayload) return NextResponse.json(existing.responsePayload");
    const biteshipIdx = orderRoute.indexOf("getBiteshipRates(");
    assert.ok(payloadIdx !== -1 && biteshipIdx !== -1);
    assert.ok(payloadIdx < biteshipIdx, "responsePayload resolution must occur before Biteship call");
});

// 8C. New idempotency key still requires live Biteship validation
test("new idempotency key still performs live Biteship validation", () => {
    assert.match(orderRoute, /const quoted = await getBiteshipRates\(\{/);
    assert.match(orderRoute, /const selected = selectRate\(quoted\.rates, selection\)/);
    assert.match(orderRoute, /shipping = selected\.price/);
});

// 8D. Concurrent duplicate requests remain protected at transaction level
test("concurrent duplicate keys remain guarded (P2002 + PROCESSING)", () => {
    assert.match(orderRoute, /checkoutIdempotency\.create\(\{ data: \{ key, userId: user\.id, requestHash, status: "PROCESSING" \} \}\)/);
    assert.match(orderRoute, /error\.code === "P2002"/);
    assert.match(orderRoute, /PROCESSING/);
    assert.match(orderRoute, /status: 409/);
});

// 8E. Client cannot tamper shipping price or weight (order route)
test("client cannot tamper shipping price or weight in order route", () => {
    assert.doesNotMatch(orderRoute, /address\.(price|weight|total)/);
    assert.match(orderRoute, /authorizeProductItems/);
    assert.match(orderRoute, /calculateTotalWeight/);
});

// 9. Provider failure does not fall back to a fake shipping cost
test("no arbitrary flat rate fallback (SHIPPING_COST removed)", () => {
    assert.doesNotMatch(orderRoute, /SHIPPING_COST/);
    assert.doesNotMatch(orderRoute, /15000/);
    assert.match(biteshipLib, /BiteshipUnavailableError/);
    assert.match(orderRoute, /BiteshipUnavailableError/);
});

// 10. Webhook / signature verification unchanged
test("Midtrans webhook signature verification is preserved", () => {
    assert.match(webhook, /verifyMidtransSignature/);
    assert.match(midtrans, /verifyMidtransSignature/);
});

// 11. Auth boundaries unchanged
test("admin guard remains", () => {
    assert.match(read("../src/app/api/products/route.ts"), /getCurrentAdmin/);
    assert.match(read("../src/lib/server-auth.ts"), /getCurrentAdmin/);
});

// 12. Area handling never trusts arbitrary browser area IDs
test("area IDs are normalized and guarded server-side", () => {
    assert.equal(normalizeAreaId("12345"), "12345");
    assert.equal(normalizeAreaId("  ID-1234  "), "ID-1234");
    assert.equal(normalizeAreaId("../../etc/passwd"), null);
    assert.equal(normalizeAreaId("a".repeat(200)), null);
    assert.equal(denyArbitraryAreaId("OK123"), false);
    assert.equal(denyArbitraryAreaId("bad id!"), true);
});

// 13. Biteship key is server-only
test("Biteship key is server-only (never NEXT_PUBLIC, never shipped to client)", () => {
    assert.match(biteshipLib, /process\.env\.BITESHIP_API_KEY/);
    assert.doesNotMatch(biteshipLib, /NEXT_PUBLIC/);
    assert.match(biteshipLib, /import "server-only"/);
});

// 14. Checkout UI offers courier/service selection states
test("checkout UI renders rates + courier/service selection", () => {
    assert.match(checkoutPage, /api\/shipping\/rates/);
    assert.match(checkoutPage, /api\/shipping\/areas/);
    assert.match(checkoutPage, /ShippingRates/);
});

// 15. Areas endpoint must NOT require BITESHIP_ORIGIN_AREA_ID
test("areas route never reads or requires origin area ID", () => {
    assert.doesNotMatch(areasRoute, /BITESHIP_ORIGIN_AREA_ID/);
    assert.doesNotMatch(areasRoute, /getBiteshipOriginAreaId/);
});

test("areas search does not require origin area ID (config only needs API key)", () => {
    // getBiteshipConfig must NOT throw on a missing origin area ID.
    const configFn = biteshipLib.match(/export function getBiteshipConfig\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(configFn, "getBiteshipConfig must exist");
    assert.doesNotMatch(configFn, /!originAreaId/);
    // origin area ID is enforced only by getBiteshipOriginAreaId().
    assert.match(biteshipLib, /if \(!originAreaId\) throw new BiteshipUnavailableError/);
});

test("areas search defaults to type=single with countries=ID", () => {
    assert.match(biteshipLib, /countries: "ID"/);
    assert.match(biteshipLib, /type: type \|\| "single"/);
    assert.match(biteshipLib, /\/v1\/maps\/areas\?/);
});

test("areas authorization header is the raw API key (no Bearer prefix)", () => {
    assert.match(biteshipLib, /Authorization: apiKey/);
    assert.doesNotMatch(biteshipLib, /Authorization: `?Bearer/);
});

// 16. Rates still fail-safe when origin area ID is empty
test("rates fail-safe when origin area ID is empty", () => {
    // getBiteshipRates uses getBiteshipOriginAreaId(), which throws when empty.
    assert.match(biteshipLib, /const configuredOrigin = getBiteshipOriginAreaId\(\)/);
    assert.match(ratesRoute, /BiteshipUnavailableError/);
});

// 17. Checkout must not compute shipping without origin area ID
test("checkout order route still requires origin area ID for shipping", () => {
    assert.match(orderRoute, /getBiteshipOriginAreaId/);
    assert.match(orderRoute, /BiteshipUnavailableError/);
    assert.match(orderRoute, /getBiteshipRates\(/);
});

// 18. Biteship courier listing
// NOTE: these are SOURCE-LEVEL assertions, not behavioral runtime tests.
// src/lib/biteship.ts is guarded by `import "server-only"` (and pulls in
// env/Prisma-aware helpers), so it cannot be imported by this plain node:test
// harness. We assert on the implementation shape instead.
test("rates request never sends couriers empty string", () => {
    assert.doesNotMatch(biteshipLib, /couriers:\s*""/);
});

test("courier codes are collected from the /v1/couriers endpoint", () => {
    assert.match(biteshipLib, /\/v1\/couriers/);
});

test("courier_code is trimmed before use", () => {
    assert.match(biteshipLib, /entry\.courier_code\.trim\(\)/);
});

test("courier codes are deduped via a Set", () => {
    assert.match(biteshipLib, /new Set<string>\(\)/);
});

test("blank courier_code entries are ignored", () => {
    assert.match(biteshipLib, /if \(code\) codes\.add\(code\)/);
});

test("listed courier codes are joined with commas for the rates payload", () => {
    assert.match(biteshipLib, /listBiteshipCouriers\(\)\)\.join\(","\)/);
});

test("empty courier list fails safe BEFORE the rates POST", () => {
    assert.match(biteshipLib, /if \(!couriers\) throw new BiteshipUnavailableError\(\)/);
    const emptyThrowIdx = biteshipLib.indexOf("if (!couriers) throw new BiteshipUnavailableError");
    const postRatesIdx = biteshipLib.indexOf('biteshipFetch("/v1/rates/couriers"');
    assert.ok(emptyThrowIdx !== -1 && postRatesIdx !== -1, "both markers must exist");
    assert.ok(emptyThrowIdx < postRatesIdx, "empty-couriers guard must run before POST /v1/rates/couriers");
});

test("courier cache is written only after a successful fetch", () => {
    const fetchCouriersIdx = biteshipLib.indexOf('biteshipFetch("/v1/couriers"');
    const cacheWriteIdx = biteshipLib.indexOf("couriersCache = { codes: result");
    assert.ok(fetchCouriersIdx !== -1 && cacheWriteIdx !== -1, "both markers must exist");
    assert.ok(cacheWriteIdx > fetchCouriersIdx, "cache assignment must come after the courier fetch");
});