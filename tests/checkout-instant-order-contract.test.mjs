import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const order = read("../src/app/api/checkout/order/route.ts");
const session = read("../src/app/api/checkout/session/route.ts");
const checkout = read("../src/app/checkout/page.tsx");

test("checkout session refreshes the server-authorized snapshot", () => {
    assert.match(session, /authorizeProductItems\(snapshot\.map\(\(\{ id, qty \}\) => \(\{ id, qty \}\)\)\)/);
    assert.match(session, /response\.cookies\.set\(CHECKOUT_COOKIE, encodeCheckoutItems\(items\)/);
    assert.match(session, /maxAge: 60 \* 30/);
});

test("valid Regular and Grab Instant payload contracts reach server selection", () => {
    assert.match(order, /shippingMode\?: "instant" \| "package"/);
    assert.match(order, /selectRate\(eligibleRates, selection\)/);
    assert.match(order, /getBiteshipCoordinateRates\(\{ destinationLatitude: latitude\.coordinates!\.latitude, destinationLongitude: latitude\.coordinates!\.longitude/);
    assert.match(order, /getBiteshipRates\(\{\s*destinationAreaId,/);
    assert.match(checkout, /paymentMethod: form\.paymentMethod/);
    assert.match(order, /paymentMethods = \["QRIS"\] as const/);
});

test("Instant requires finite valid coordinates and never silently downgrades", () => {
    assert.match(order, /const coordinates = parseDeliveryCoordinates/);
    assert.match(order, /coordinates\.provided && !coordinates\.valid/);
    assert.match(order, /if \(instant && \(!latitude\.coordinates \|\| !getBiteshipOriginCoordinates\(\)\)/);
});

test("client shipping price and display metadata cannot set the order total", () => {
    assert.match(order, /shipping = selected\.price/);
    assert.match(order, /total = subtotal \+ shipping/);
    assert.doesNotMatch(order, /address\.shippingPrice/);
    assert.match(order, /courierName = selected\.courierName/);
    assert.match(order, /quoteRef = selected\.quoteRef/);
});

test("invalid selection and arbitrary courier/service combinations remain rejected", () => {
    assert.match(order, /if \(!isValidRateSelection\(selection\)\)/);
    assert.match(order, /if \(!selected\)/);
    assert.match(order, /Ongkir pilihan sudah berubah/);
});

test("empty snapshot diagnostics are safe and do not log customer payload", () => {
    assert.match(order, /category: "empty_server_checkout_snapshot"/);
    assert.match(order, /hasCheckoutCookie: Boolean\(store\.get\(CHECKOUT_COOKIE\)\?\.value\)/);
    assert.doesNotMatch(order, /console\.warn\([^)]*address/);
    assert.doesNotMatch(order, /console\.warn\([^)]*phone/);
});

test("guest checkout, payment, stock and transaction safeguards remain in the order route", () => {
    assert.match(order, /readGuestSessionHash/);
    assert.match(order, /paymentMethod/);
    assert.match(order, /stock: \{ gte: item\.qty \}/);
    assert.match(order, /prisma\.\$transaction/);
});