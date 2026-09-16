import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    classifyShippingService,
    groupShippingRatesByCategory,
    formatShippingDuration,
    SHIPPING_CATEGORY_LABELS,
    SHIPPING_CATEGORY_ORDER,
} from "../src/lib/shipping-category.ts";
import { BITESHIP_FAILURE_MESSAGES, isBiteshipProviderFailure } from "../src/lib/biteship-failure.ts";
import { normalizeRate } from "../src/lib/biteship-normalize.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const ratesRoute = read("../src/app/api/shipping/rates/route.ts");
const checkoutPage = read("../src/app/checkout/page.tsx");
const orderRoute = read("../src/app/api/checkout/order/route.ts");
const biteshipLib = read("../src/lib/biteship.ts");
const normalizeLib = read("../src/lib/biteship-normalize.ts");
const categoryLib = read("../src/lib/shipping-category.ts");

/*
 * Fixtures mirror the real Biteship GET /v1/rates/couriers pricing[] row shape
 * (courier_code + courier_service_code + price + duration). Nothing here is a
 * hardcoded catalogue: every row is a response row the API may or may not return.
 */
const quote = (rows) =>
    rows
        .map((row) => normalizeRate(row))
        .filter((rate) => rate !== null)
        .map((rate) => ({ ...rate, shipmentCategory: classifyShippingService(rate) }));

// 1. Gojek — instant + same day services
test("Gojek instant and same day services are classified from Biteship wording", () => {
    const rates = quote([
        { courier_code: "gojek", courier_name: "Gojek", courier_service_code: "instant", courier_service_name: "Instant", price: 25000, duration: "1 - 3 hours" },
        { courier_code: "gojek", courier_name: "Gojek", courier_service_code: "same_day", courier_service_name: "Same Day", price: 18000, duration: "1 - 3 days" },
    ]);
    assert.equal(rates.length, 2);
    assert.equal(rates[0].shipmentCategory, "instant");
    assert.equal(rates[1].shipmentCategory, "same_day");
});

// 2. Grab — instant, Instant Car and Same Day
test("Grab instant, Instant Car and Same Day services are classified", () => {
    const rates = quote([
        { courier_code: "grab", courier_name: "Grab", courier_service_code: "instant", courier_service_name: "Instant", price: 30000, duration: "1 - 2 hours" },
        { courier_code: "grab", courier_name: "Grab", courier_service_code: "instant_car", courier_service_name: "Instant Car", price: 45000, duration: "1 - 2 hours" },
        { courier_code: "grab", courier_name: "Grab", courier_service_code: "same_day", courier_service_name: "Same Day", price: 20000, duration: "1 - 3 days" },
    ]);
    assert.deepEqual(rates.map((rate) => rate.shipmentCategory), ["instant", "instant", "same_day"]);
});

// 3. Lalamove — on demand
test("Lalamove on-demand is classified as instant", () => {
    const rates = quote([
        { courier_code: "lalamove", courier_name: "Lalamove", courier_service_code: "on_demand", courier_service_name: "On Demand", price: 38000, duration: "1 - 3 hours" },
    ]);
    assert.equal(rates[0].shipmentCategory, "instant");
});

// 4. AnterAja — regular + same day
test("AnterAja regular stays regular while its same-day variant is separated", () => {
    const rates = quote([
        { courier_code: "anteraja", courier_name: "AnterAja", courier_service_code: "reg", courier_service_name: "Regular", price: 14000, duration: "2 - 3 days" },
        { courier_code: "anteraja", courier_name: "AnterAja", courier_service_code: "same_day", courier_service_name: "Same Day", price: 26000, duration: "1 - 3 days" },
    ]);
    assert.equal(rates[0].shipmentCategory, "regular");
    assert.equal(rates[1].shipmentCategory, "same_day");
});

// 5. Unknown courier → regular, never invented
test("an unknown courier service falls back to regular instead of being guessed", () => {
    assert.equal(classifyShippingService({ serviceCode: "hemat", serviceName: "Hemat", duration: "2 - 4 days" }), "regular");
    assert.equal(classifyShippingService({ serviceCode: "ECO", serviceName: "Ekonomi" }), "regular");
    assert.equal(classifyShippingService({}), "regular");
    assert.equal(classifyShippingService({ serviceCode: "express", serviceName: "Express Next Day", duration: "1 - 2 days" }), "regular");
});

// 6. Price never influences the category
test("classification is semantic only and never price based", () => {
    assert.equal(classifyShippingService({ serviceCode: "instant", serviceName: "Instant", duration: "1 - 3 hours" }), "instant");
    assert.equal(classifyShippingService({ serviceCode: "reg", serviceName: "REG", duration: "2 - 3 days" }), "regular");
    const classifyFn = categoryLib.match(/export function classifyShippingService[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(classifyFn, "classifyShippingService must exist");
    assert.doesNotMatch(classifyFn, /price/);
});

test("a same-day row is never advertised as instant", () => {
    assert.equal(classifyShippingService({ serviceCode: "same_day", serviceName: "Same Day", description: "Instant same day delivery" }), "same_day");
});

// 7. Empty groups are dropped (no empty ⚡ section in the UI)
test("empty categories are dropped so no empty group is rendered", () => {
    const groups = groupShippingRatesByCategory(quote([
        { courier_code: "anteraja", courier_service_code: "reg", courier_service_name: "Regular", price: 14000, duration: "2 - 3 days" },
    ]));
    assert.deepEqual(groups.map((group) => group.category), ["regular"]);
});

test("all three categories render when Biteship returns all three", () => {
    const groups = groupShippingRatesByCategory(quote([
        { courier_code: "gojek", courier_service_code: "instant", courier_service_name: "Instant", price: 25000, duration: "1 - 3 hours" },
        { courier_code: "grab", courier_service_code: "same_day", courier_service_name: "Same Day", price: 20000, duration: "1 - 3 days" },
        { courier_code: "anteraja", courier_service_code: "reg", courier_service_name: "Regular", price: 14000, duration: "2 - 3 days" },
    ]));
    assert.deepEqual(groups.map((group) => group.category), ["instant", "same_day", "regular"]);
});

// 8. Canonical order + cheapest first inside a group
test("groups follow INSTANT -> SAME DAY -> REGULAR and stay cheapest first", () => {
    assert.deepEqual([...SHIPPING_CATEGORY_ORDER], ["instant", "same_day", "regular"]);
    assert.deepEqual(Object.keys(SHIPPING_CATEGORY_LABELS), ["instant", "same_day", "regular"]);
    assert.equal(SHIPPING_CATEGORY_LABELS.instant.icon, "⚡");
    assert.equal(SHIPPING_CATEGORY_LABELS.same_day.icon, "☀");
    assert.equal(SHIPPING_CATEGORY_LABELS.regular.icon, "📦");

    const groups = groupShippingRatesByCategory(quote([
        { courier_code: "grab", courier_service_code: "instant_car", courier_service_name: "Instant Car", price: 45000, duration: "1 - 2 hours" },
        { courier_code: "gojek", courier_service_code: "instant", courier_service_name: "Instant", price: 25000, duration: "1 - 3 hours" },
    ]));
    assert.deepEqual(groups[0].rates.map((rate) => rate.price), [25000, 45000]);
});

// 9. Server-provided category wins (server stays authoritative)
test("a server-provided shipmentCategory wins over local re-classification", () => {
    const groups = groupShippingRatesByCategory([
        { courierCode: "gojek", serviceCode: "instant", serviceName: "Instant", price: 25000, duration: "1 - 3 hours", shipmentCategory: "same_day" },
    ]);
    assert.deepEqual(groups.map((group) => group.category), ["same_day"]);
});

// 10. Legacy cached payload without a category is re-classified, not dropped
test("legacy rates without shipmentCategory are re-classified instead of disappearing", () => {
    const groups = groupShippingRatesByCategory([
        { courierCode: "grab", serviceCode: "instant", serviceName: "Instant", price: 30000, duration: "1 - 2 hours" },
        { courierCode: "jne", serviceCode: "reg", serviceName: "REG", price: 18000, duration: "2-3" },
    ]);
    assert.deepEqual(groups.map((group) => group.category), ["instant", "regular"]);
    assert.equal(groups[1].rates[0].courierCode, "jne");
});


// 11. The server attaches the category additively on the quote path
test("getBiteshipRates attaches shipmentCategory without dropping existing fields", () => {
    assert.match(biteshipLib, /import \{ classifyShippingService, type CategorizedRate \} from "@\/lib\/shipping-category"/);
    assert.match(biteshipLib, /shipmentCategory: classifyShippingService\(rate\)/);
    assert.match(biteshipLib, /\.\.\.rate,/);
    const spreadIdx = biteshipLib.indexOf("...rate,");
    const categoryIdx = biteshipLib.indexOf("shipmentCategory: classifyShippingService(rate)");
    assert.ok(spreadIdx !== -1 && categoryIdx !== -1 && spreadIdx < categoryIdx, "spread must keep the original rate fields");
});

test("normalizer keeps the semantic fields Biteship returns (serviceType/description)", () => {
    assert.match(normalizeLib, /serviceType: string \| null/);
    assert.match(normalizeLib, /description: string \| null/);
    assert.match(normalizeLib, /readText\(raw\.service_type\) \?\? readText\(raw\.tier\)/);
    assert.match(normalizeLib, /readText\(raw\.description\)/);
    const rate = normalizeRate({ courier_code: "gojek", courier_service_code: "instant", service_type: "instant", description: "Diantar dalam 1 jam", price: 25000, duration: "1 - 3 hours" });
    assert.equal(rate.serviceType, "instant");
    assert.equal(rate.description, "Diantar dalam 1 jam");
    assert.equal(classifyShippingService(rate), "instant");
});

// 12. The rates API contract stays additive for the client
test("rates route forwards courierCode/serviceCode plus the additive fields", () => {
    assert.match(ratesRoute, /rates: result\.rates\.map\(/);
    assert.match(ratesRoute, /courierCode: rate\.courierCode/);
    assert.match(ratesRoute, /serviceCode: rate\.serviceCode/);
    assert.match(ratesRoute, /shipmentCategory: rate\.shipmentCategory/);
    assert.match(ratesRoute, /description: rate\.description/);
    assert.match(ratesRoute, /price: rate\.price/);
    assert.match(ratesRoute, /duration: rate\.duration/);
});

// 13. UI renders the three groups from server data, never a hardcoded courier list/price
test("checkout renders category sections from server rates only", () => {
    assert.match(checkoutPage, /groupShippingRatesByCategory\(rates\)/);
    assert.match(checkoutPage, /SHIPPING_CATEGORY_LABELS\[group\.category\]/);
    assert.match(checkoutPage, /groups\.map\(/);
    assert.match(checkoutPage, /formatRupiah\(rate\.price\)/);
    assert.match(checkoutPage, /rate\.courierName/);
    assert.doesNotMatch(checkoutPage, /gojek|grab|anteraja|lalamove/i);
    // No invented fallback price: shipping stays 0 until a real rate is selected.
    assert.match(checkoutPage, /const shipping = selectedRate\?\.price \?\? 0;/);
});

test("checkout shows the Biteship ETA verbatim (same-day and instant ETAs included)", () => {
    assert.match(checkoutPage, /formatShippingDuration\(rate\.duration\)/);
    assert.match(checkoutPage, /formatShippingDuration\(selectedRate\.duration\)/);
    assert.doesNotMatch(checkoutPage, /\{selectedRate\.duration\} hari/);
    assert.equal(formatShippingDuration("2-3"), "2-3 hari");
    assert.equal(formatShippingDuration("1 - 3 hours"), "1 - 3 hours");
    assert.equal(formatShippingDuration(null), null);
});



// 14. Provider/account failures are never reported as an unsupported address
test("insufficient balance / auth / quota responses count as provider failures", () => {
    assert.equal(isBiteshipProviderFailure(402, { error: "No sufficient balance to call rates API" }), true);
    assert.equal(isBiteshipProviderFailure(400, { message: "Your balance is not enough" }), true);
    assert.equal(isBiteshipProviderFailure(401, {}), true);
    assert.equal(isBiteshipProviderFailure(403, {}), true);
    assert.equal(isBiteshipProviderFailure(429, { message: "Too many requests" }), true);
    assert.equal(isBiteshipProviderFailure(400, { error: "There is no courier available for this route" }), false);
    assert.equal(isBiteshipProviderFailure(404, { error: "Area not found" }), false);
    assert.equal(isBiteshipProviderFailure(500, {}), false);
});

test("provider failures surface as a retryable PROVIDER code, not an address error", () => {
    assert.match(biteshipLib, /isBiteshipProviderFailure\(response\.status, fields\)/);
    assert.match(biteshipLib, /throw new BiteshipUnavailableError\(BITESHIP_FAILURE_MESSAGES\.provider, "UPSTREAM", "provider"\)/);
    assert.match(ratesRoute, /error\.kind === "provider" \? "PROVIDER" : "UPSTREAM"/);
    assert.match(ratesRoute, /BITESHIP_FAILURE_MESSAGES\.provider/);
    assert.match(checkoutPage, /d\.code === "PROVIDER"/);
    assert.match(BITESHIP_FAILURE_MESSAGES.provider, /coba lagi/i);
    // The message a customer sees for a provider outage never claims the address is unsupported.
    assert.doesNotMatch(BITESHIP_FAILURE_MESSAGES.provider, /tidak didukung|tidak valid/i);
});

// 15. No fake rates: an empty quote is a distinct empty state
test("an empty quote stays a NO_RATES empty state with no invented rate", () => {
    assert.match(ratesRoute, /BITESHIP_FAILURE_MESSAGES\.no_rates/);
    assert.match(ratesRoute, /code: "NO_RATES"/);
    assert.match(checkoutPage, /r\.status === 404/);
    assert.match(checkoutPage, /Belum ada layanan pengiriman untuk tujuan ini\./);
    assert.deepEqual(groupShippingRatesByCategory([]), []);
});

// 16. Existing regular shipping path is unchanged
test("regular shipping (JNE REG / SiCepat BEST) still flows through the REGULAR group", () => {
    const groups = groupShippingRatesByCategory(quote([
        { courier_code: "jne", courier_name: "JNE", courier_service_code: "reg", courier_service_name: "REG", price: 18000, duration: "2-3" },
        { courier_code: "sicepat", courier_name: "SiCepat", courier_service_code: "best", courier_service_name: "BEST", price: 15000, duration: "1-2" },
    ]));
    assert.deepEqual(groups.map((group) => group.category), ["regular"]);
    assert.deepEqual(groups[0].rates.map((rate) => rate.courierCode), ["sicepat", "jne"]);
});

// 17. Server re-quote stays authoritative for whatever the customer picked
test("checkout sends only courierCode/serviceCode and the server re-quotes", () => {
    assert.match(checkoutPage, /courierCode: selectedRate\.courierCode,/);
    assert.match(checkoutPage, /serviceCode: selectedRate\.serviceCode,/);
    assert.doesNotMatch(checkoutPage, /price: selectedRate\.price/);
    assert.match(orderRoute, /const quoted = await getBiteshipRates\(\{/);
    assert.match(orderRoute, /selectRate\(quoted\.rates, selection\)/);
    assert.match(orderRoute, /shipping = selected\.price/);
});
