import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    normalizeSearchResults,
    normalizeReverseResult,
    normalizeNominatimPlace,
} from "../src/lib/geocoding-normalize.ts";
import { buildAreaSearchQueries, pickBestAreaMatch } from "../src/lib/area-match.ts";
import { normalizeLatitude, normalizeLongitude } from "../src/lib/coordinates.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const schema = read("../prisma/schema.prisma");
const migration = read("../prisma/migrations/20260915020000_add_destination_admin_address/migration.sql");
const orderRoute = read("../src/app/api/checkout/order/route.ts");
const ratesRoute = read("../src/app/api/shipping/rates/route.ts");
const checkoutPage = read("../src/app/checkout/page.tsx");
const locationSearchRoute = read("../src/app/api/location/search/route.ts");
const locationReverseRoute = read("../src/app/api/location/reverse/route.ts");
const geocodingLib = read("../src/lib/geocoding.ts");
const locationMap = read("../src/components/checkout/location-map.tsx");

// 1. Search normalization
test("normalizes Nominatim search results to a stable shape", () => {
    const results = normalizeSearchResults([
        {
            lat: "-6.2", lon: "106.816666", display_name: "Kalitimbang, Cibeber, Kota Cilegon, Banten",
            address: { state: "Banten", county: "Kota Cilegon", city_district: "Cibeber", village: "Kalitimbang", postcode: "42426", road: "Jl. Melati" },
        },
        { lat: "not-a-number", lon: "106.8" },
        null,
    ]);
    assert.equal(results.length, 1);
    assert.equal(results[0].latitude, -6.2);
    assert.equal(results[0].longitude, 106.816666);
    assert.equal(results[0].address.province, "Banten");
    assert.equal(results[0].address.city, "Kota Cilegon");
    assert.equal(results[0].address.district, "Cibeber");
    assert.equal(results[0].address.village, "Kalitimbang");
    assert.equal(results[0].address.postcode, "42426");
});

// 2. Reverse geocode normalization
test("normalizes a Nominatim reverse result (single object)", () => {
    const result = normalizeReverseResult({
        lat: "-6.2", lon: "106.816666", display_name: "Perumahan Griya, Cilegon",
        address: { state: "Banten", city: "Cilegon", suburb: "Kalitimbang", postcode: "42426" },
    });
    assert.equal(result?.address.province, "Banten");
    assert.equal(result?.address.city, "Cilegon");
    assert.equal(result?.address.village, "Kalitimbang");
});

test("normalizeNominatimPlace rejects missing/invalid coordinates", () => {
    assert.equal(normalizeNominatimPlace(null), null);
    assert.equal(normalizeNominatimPlace({}), null);
    assert.equal(normalizeNominatimPlace({ lat: "abc", lon: "1" }), null);
});

// 3. invalid lat/lng rejected
test("reverse route validates lat/lng (finite + range)", () => {
    assert.equal(normalizeLatitude(91), null);
    assert.equal(normalizeLatitude(-91), null);
    assert.equal(normalizeLongitude(181), null);
    assert.match(locationReverseRoute, /normalizeLatitude/);
    assert.match(locationReverseRoute, /normalizeLongitude/);
});

// 4. geolocation metadata does not affect ongkir
test("coordinates are metadata only — never affect shipping price", () => {
    assert.doesNotMatch(ratesRoute, /latitude|longitude/);
    assert.match(orderRoute, /coordinates\.coordinates\?\.latitude/);
});

// 5-6. destinationAreaId comes from Biteship; auto-match uses official results
test("auto-match builds query fallbacks and ranks official Biteship results", () => {
    const queries = buildAreaSearchQueries({ village: "Kalitimbang", district: "Cibeber", city: "Kota Cilegon", postcode: "42426" });
    assert.equal(queries[0], "Kalitimbang Cibeber Kota Cilegon 42426");
    assert.ok(queries.includes("Cibeber Kota Cilegon"));
    assert.ok(queries.includes("Kota Cilegon"));

    const best = pickBestAreaMatch(
        [
            { id: "a1", name: "Cibeber", type: "level_3", district: "Cibeber", city: "Kota Cilegon" },
            { id: "a2", name: "Kalitimbang", type: "level_4", district: "Cibeber", city: "Kota Cilegon", postalCode: "42426" },
        ],
        { village: "Kalitimbang", district: "Cibeber", city: "Kota Cilegon", postcode: "42426" },
    );
    assert.equal(best?.id, "a2"); // prefers most specific level (kelurahan)
});

test("pickBestAreaMatch returns null when no strong match", () => {
    const none = pickBestAreaMatch([{ id: "x", name: "Surabaya", type: "level_2", city: "Surabaya" }], { village: "Kalitimbang", district: "Cibeber", city: "Kota Cilegon" });
    assert.equal(none, null);
});

// 7. fallback area search lives inside Data Penerima; no unsafe areas[0] auto-select
test("checkout keeps fallback area search inside Data Penerima when auto-match fails", () => {
    assert.match(checkoutPage, /api\/shipping\/areas/);
    assert.match(checkoutPage, /AreaAutocomplete/);
    assert.match(checkoutPage, /Kami belum dapat mencocokkan area pengiriman secara otomatis\./);
    // The fallback search must be rendered within the Data Penerima panel, not a separate card.
    assert.doesNotMatch(checkoutPage, /Cari Kecamatan \/ Kelurahan \(Fallback\)/);
    assert.doesNotMatch(checkoutPage, /Pilih Tujuan \(Kecamatan \/ Kelurahan\)/);
    // Never auto-select the top result when the ranked match is null.
    assert.doesNotMatch(checkoutPage, /setDestinationArea\(areas\[0\]\)/);
});

// 8. server shipping revalidation still present
test("server shipping revalidation preserved", () => {
    assert.match(orderRoute, /selectRate\(quoted\.rates, selection\)/);
    assert.match(orderRoute, /const quoted = await getBiteshipRates/);
});

// 9. courierCode authoritative
test("courierCode comes from server quote", () => {
    assert.match(orderRoute, /courierCode = selected\.courierCode/);
});

// 10. QRIS only preserved
test("QRIS only preserved", () => {
    assert.match(checkoutPage, /const PAYMENT_METHOD = "QRIS" as const/);
    assert.match(orderRoute, /paymentMethods = \["QRIS"\] as const/);
});

// 11. dropship origin server-controlled
test("dropship does not change physical Biteship origin", () => {
    assert.match(orderRoute, /senderName/);
    assert.match(orderRoute, /getBiteshipOriginAreaId/);
    assert.doesNotMatch(orderRoute, /originAreaId = .*senderName/);
});

// 12. raw geocoder/Biteship errors not leaked (client-facing messages are safe)
test("geocoder + Biteship errors are sanitized (no raw upstream text)", () => {
    assert.match(geocodingLib, /GeocodingUnavailableError/);
    assert.match(geocodingLib, /User-Agent/);
    assert.match(geocodingLib, /NOMINATIM_TIMEOUT_MS/);
    // Client-facing responses use fixed, safe messages (server-side console logging is not the response).
    assert.match(locationSearchRoute, /"Pencarian lokasi gagal\. Silakan coba lagi\."/);
    assert.match(locationSearchRoute, /status: 503/);
    assert.match(locationReverseRoute, /"Gagal mengenali alamat\. Silakan coba lagi\."/);
});

// 13. admin shipment Phase 2 unchanged
test("admin Biteship Phase 2 shipment route untouched (guard present)", () => {
    assert.match(read("../src/app/api/admin/orders/[id]/biteship/route.ts"), /CLAIM_PREFIX/);
});

// schema + migration additive
test("schema adds nullable destination admin fields", () => {
    assert.match(schema, /destinationProvince\s+String\?/);
    assert.match(schema, /destinationCity\s+String\?/);
    assert.match(schema, /destinationDistrict\s+String\?/);
    assert.match(schema, /destinationVillage\s+String\?/);
    assert.match(schema, /destinationPostalCode\s+String\?/);
});

test("admin address migration is additive only", () => {
    assert.match(migration, /ADD COLUMN "destinationProvince" TEXT/);
    assert.match(migration, /ADD COLUMN "destinationPostalCode" TEXT/);
    assert.doesNotMatch(migration, /DROP/);
    assert.doesNotMatch(migration, /ALTER COLUMN/);
});

// map / search architecture no API key
test("map uses OSM tiles without API key; search debounced", () => {
    assert.match(checkoutPage, /CheckoutLocationMap/);
    assert.match(checkoutPage, /CheckoutLocationSearch/);
    assert.match(read("../src/components/checkout/location-search.tsx"), /450/);
    assert.match(locationMap, /tile\.openstreetmap\.org/);
    assert.match(locationMap, /OpenStreetMap contributors/);
});

// Smart map UX: draft vs confirmed location, Grab/Gojek-style center pin.
test("map exposes a controlled center/draft concept with a fixed center pin", () => {
    assert.match(locationMap, /center: DeliveryCoordinates/);
    assert.match(locationMap, /onCenterChange/);
    assert.match(locationMap, /onInteractionStart/);
    assert.match(locationMap, /onInteractionEnd/);
    assert.match(locationMap, /pointer-events-none absolute left-1\/2 top-1\/2/);
    assert.match(locationMap, /TITIK PENGIRIMAN/);
    assert.match(checkoutPage, /draftLocation/);
    assert.match(checkoutPage, /confirmedLocation/);
});

test("panning the map only updates the draft center (no geocode, no area, no rates)", () => {
    assert.match(checkoutPage, /const handleCenterChange = \(coords: DeliveryCoordinates\) => \{\s*setDraftLocation\(coords\);\s*\};/);
    assert.doesNotMatch(locationMap, /api\/location\/reverse|api\/shipping\/rates|destinationAreaId/);
});

test("search + geolocation only recenter the draft map (never final)", () => {
    assert.match(checkoutPage, /const handleSearchSelect = \(result: LocationSearchResult\) => \{[\s\S]*?setDraftLocation\(coords\);[\s\S]*?setMapZoom\(16\);[\s\S]*?\};/);
    assert.match(checkoutPage, /setMapZoom\(17\)/);
});

test("\"Pilih Lokasi Ini\" is the single trigger for location confirmation", () => {
    assert.match(checkoutPage, /Pilih Lokasi Ini/);
    assert.match(checkoutPage, /onClick=\{confirmLocation\}/);
    assert.match(checkoutPage, /const confirmLocation = \(\) => \{[\s\S]*?resetAll\(\);[\s\S]*?setConfirmedLocation\(draftLocation\);[\s\S]*?reverseGeocodeAndFill\(draftLocation\);[\s\S]*?\};/);
});

test("reverse geocoding runs only after confirmation (with manual fallback on failure)", () => {
    assert.match(checkoutPage, /reverseGeocodeAndFill\(draftLocation\)/);
    assert.match(checkoutPage, /setAreaState\("not_found"\)/);
    assert.match(checkoutPage, /Alamat lokasi belum dapat dikenali/);
});

test("confirmed location replaces the stored coordinates", () => {
    assert.match(checkoutPage, /destinationLatitude: confirmedLocation\?\.latitude/);
    assert.match(checkoutPage, /destinationLongitude: confirmedLocation\?\.longitude/);
});

test("changing the location resets the selected shipping", () => {
    assert.match(checkoutPage, /const editLocation = \(\) => \{[\s\S]*?resetAll\(\);[\s\S]*?setConfirmedLocation\(null\);[\s\S]*?\};/);
    assert.match(checkoutPage, /Ubah Titik Lokasi/);
});

test("destinationAreaId still comes from official Biteship match (no areas[0] fallback)", () => {
    assert.match(checkoutPage, /setDestinationArea\(best\)/);
    assert.doesNotMatch(checkoutPage, /setDestinationArea\(areas\[0\]\)/);
});

test("QRIS-only + server-side quote authority remain intact", () => {
    assert.match(checkoutPage, /const PAYMENT_METHOD = "QRIS" as const/);
    assert.match(orderRoute, /selectRate\(quoted\.rates, selection\)/);
    assert.match(orderRoute, /const quoted = await getBiteshipRates/);
});
