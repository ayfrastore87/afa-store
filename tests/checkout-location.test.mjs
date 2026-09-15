import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    normalizeLatitude,
    normalizeLongitude,
    parseDeliveryCoordinates,
    LATITUDE_MIN,
    LATITUDE_MAX,
    LONGITUDE_MIN,
    LONGITUDE_MAX,
} from "../src/lib/coordinates.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const schema = read("../prisma/schema.prisma");
const migration = read("../prisma/migrations/20260915010000_add_destination_coordinates/migration.sql");
const orderRoute = read("../src/app/api/checkout/order/route.ts");
const ratesRoute = read("../src/app/api/shipping/rates/route.ts");
const checkoutPage = read("../src/app/checkout/page.tsx");
const biteshipLib = read("../src/lib/biteship.ts");

// 1. Coordinate validation
test("normalizeLatitude accepts finite in-range values, rejects junk", () => {
    assert.equal(normalizeLatitude(0), 0);
    assert.equal(normalizeLatitude(-6.2), -6.2);
    assert.equal(normalizeLatitude(" 90 "), 90);
    assert.equal(normalizeLatitude(LATITUDE_MAX), LATITUDE_MAX);
    assert.equal(normalizeLatitude(LATITUDE_MIN), LATITUDE_MIN);
    assert.equal(normalizeLatitude(91), null);
    assert.equal(normalizeLatitude(-91), null);
    assert.equal(normalizeLatitude(Number.NaN), null);
    assert.equal(normalizeLatitude(Infinity), null);
    assert.equal(normalizeLatitude("abc"), null);
    assert.equal(normalizeLatitude(null), null);
    assert.equal(normalizeLatitude(undefined), null);
});

test("normalizeLongitude accepts finite in-range values, rejects junk", () => {
    assert.equal(normalizeLongitude(0), 0);
    assert.equal(normalizeLongitude(106.816666), 106.816666);
    assert.equal(normalizeLongitude("-180"), -180);
    assert.equal(normalizeLongitude(LONGITUDE_MAX), LONGITUDE_MAX);
    assert.equal(normalizeLongitude(LONGITUDE_MIN), LONGITUDE_MIN);
    assert.equal(normalizeLongitude(181), null);
    assert.equal(normalizeLongitude(-181), null);
    assert.equal(normalizeLongitude(Number.NaN), null);
    assert.equal(normalizeLongitude(Infinity), null);
    assert.equal(normalizeLongitude(""), null);
});

// 2. lat/lng optional
test("parseDeliveryCoordinates is optional (absent -> not provided)", () => {
    assert.deepEqual(parseDeliveryCoordinates(undefined, undefined), { provided: false, coordinates: null });
    assert.deepEqual(parseDeliveryCoordinates(null, null), { provided: false, coordinates: null });
    assert.deepEqual(parseDeliveryCoordinates("", ""), { provided: false, coordinates: null });
});

test("parseDeliveryCoordinates returns a valid pair when both are present", () => {
    assert.deepEqual(parseDeliveryCoordinates(-6.2, 106.816666), { provided: true, valid: true, coordinates: { latitude: -6.2, longitude: 106.816666 } });
});

// 3. invalid coordinates rejected/ignored safely
test("parseDeliveryCoordinates flags partial or invalid pairs as invalid", () => {
    assert.deepEqual(parseDeliveryCoordinates(-6.2, undefined), { provided: true, valid: false, coordinates: null });
    assert.deepEqual(parseDeliveryCoordinates(undefined, 106.8), { provided: true, valid: false, coordinates: null });
    assert.deepEqual(parseDeliveryCoordinates(999, 999), { provided: true, valid: false, coordinates: null });
    assert.deepEqual(parseDeliveryCoordinates("abc", 106.8), { provided: true, valid: false, coordinates: null });
});

// 4. schema + migration additive
test("Order schema has nullable destination coordinates", () => {
    assert.match(schema, /destinationLatitude\s+Float\?/);
    assert.match(schema, /destinationLongitude\s+Float\?/);
});

test("coordinates migration is additive only (no DROP / ALTER COLUMN)", () => {
    assert.match(migration, /ADD COLUMN "destinationLatitude" DOUBLE PRECISION/);
    assert.match(migration, /ADD COLUMN "destinationLongitude" DOUBLE PRECISION/);
    assert.doesNotMatch(migration, /DROP/);
    assert.doesNotMatch(migration, /ALTER COLUMN/);
});

// 5. lat/lng not used in Biteship rate authority
test("rates route never reads coordinates for pricing", () => {
    assert.doesNotMatch(ratesRoute, /destinationLatitude|destinationLongitude|latitude|longitude/);
});

test("order route stores coordinates as metadata only, never in quote selection", () => {
    assert.match(orderRoute, /parseDeliveryCoordinates/);
    assert.match(orderRoute, /destinationLatitude = coordinates\.coordinates\?\.latitude/);
    assert.match(orderRoute, /destinationLongitude = coordinates\.coordinates\?\.longitude/);
    assert.match(orderRoute, /const quoted = await getBiteshipRates\(\{/);
});

// 6. destinationAreaId stays authoritative
test("destinationAreaId remains required and authoritative", () => {
    assert.match(orderRoute, /normalizeAreaId\(address\.destinationAreaId\)/);
    assert.match(orderRoute, /denyArbitraryAreaId\(destinationAreaId\)/);
    assert.match(ratesRoute, /destinationAreaId/);
});

// 7. courierCode stays from revalidated quote
test("courierCode still comes from the server-side revalidated quote", () => {
    assert.match(orderRoute, /courierCode = selected\.courierCode/);
    assert.match(orderRoute, /selectRate\(quoted\.rates, selection\)/);
});

// 8. QRIS only preserved
test("checkout still offers QRIS only", () => {
    assert.match(checkoutPage, /const PAYMENT_METHOD = "QRIS" as const/);
    assert.match(orderRoute, /paymentMethods = \["QRIS"\] as const/);
});

// 9. dropship origin remains server controlled
test("dropship sender never changes physical Biteship origin", () => {
    assert.match(orderRoute, /senderName/);
    assert.match(orderRoute, /getBiteshipOriginAreaId/);
    assert.doesNotMatch(orderRoute, /originAreaId = .*senderName/);
});

// 10. shipping error states do not expose raw upstream error
test("checkout shipping error states are distinct and safe", () => {
    assert.match(checkoutPage, /Silakan pilih kecamatan\/kelurahan tujuan terlebih dahulu/);
    assert.match(checkoutPage, /Mencari layanan pengiriman/);
    assert.match(checkoutPage, /Belum ada layanan pengiriman untuk tujuan ini/);
    assert.match(checkoutPage, /Layanan pengiriman sedang mengalami gangguan/);
    assert.match(checkoutPage, /Layanan pengiriman belum dapat digunakan/);
    assert.match(checkoutPage, /Coba Lagi/);
});

test("rates route never returns raw upstream error text", () => {
    assert.match(ratesRoute, /Layanan pengiriman sedang mengalami gangguan/);
    assert.match(ratesRoute, /Layanan pengiriman belum dapat digunakan/);
    assert.match(ratesRoute, /CONFIGURATION/);
});

test("BiteshipUnavailableError carries a safe code (no env/key leakage)", () => {
    assert.match(biteshipLib, /code: "CONFIGURATION" \| "UPSTREAM"/);
});

// 11. location picker uses Geolocation + no API key (progressive enhancement)
test("checkout has location picker with geolocation + safe external map link", () => {
    assert.match(checkoutPage, /CheckoutLocationPicker/);
    assert.match(checkoutPage, /Titik Lokasi \(Opsional\)/);
});
