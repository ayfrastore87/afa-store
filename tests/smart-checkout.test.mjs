import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    normalizeSearchResults,
    normalizeReverseResult,
    normalizeNominatimPlace,
} from "../src/lib/geocoding-normalize.ts";
import { buildAreaSearchQueries, MAX_AREA_SEARCH_QUERIES, pickBestAreaMatch, normalizeAreaName } from "../src/lib/area-match.ts";
import { normalizeLatitude, normalizeLongitude } from "../src/lib/coordinates.ts";
import { reverseGeocodeWithGoogle } from "../src/lib/google-geocoding.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const schema = read("../prisma/schema.prisma");
const migration = read("../prisma/migrations/20260915020000_add_destination_admin_address/migration.sql");
const orderRoute = read("../src/app/api/checkout/order/route.ts");
const ratesRoute = read("../src/app/api/shipping/rates/route.ts");
const checkoutPage = read("../src/app/checkout/page.tsx");
const googleMapsLoader = read("../src/lib/google-maps-loader.ts");
const googleGeocoding = read("../src/lib/google-geocoding.ts");
const locationMap = read("../src/components/checkout/location-map.tsx");
const locationSearch = read("../src/components/checkout/location-search.tsx");

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

// 3. invalid lat/lng rejected before any Google request is issued
test("reverse geocoding rejects out-of-range pins before any Google call", async () => {
    assert.equal(normalizeLatitude(91), null);
    assert.equal(normalizeLatitude(-91), null);
    assert.equal(normalizeLongitude(181), null);
    let calls = 0;
    const fakeApi = { maps: { Geocoder: class { async geocode() { calls += 1; return { results: [] }; } } } };
    assert.equal(await reverseGeocodeWithGoogle({ latitude: 91, longitude: 106.8 }, fakeApi), null);
    assert.equal(await reverseGeocodeWithGoogle({ latitude: -6.2, longitude: 181 }, fakeApi), null);
    assert.equal(await reverseGeocodeWithGoogle(null, fakeApi), null);
    // Out-of-range pins never reach the provider (no wasted quota, no invented address).
    assert.equal(calls, 0);
    // And a missing API handle is a soft failure too, never a thrown error.
    assert.equal(await reverseGeocodeWithGoogle({ latitude: -6.2, longitude: 106.8 }, null), null);
    assert.match(googleGeocoding, /export async function reverseGeocodeWithGoogle/);
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
    // Bounded, specific ladder: the most precise combinations plus the two single tokens
    // (postcode and kelurahan name) that an official Biteship area label always contains.
    assert.ok(queries.includes("Cibeber Kota Cilegon 42426"));
    assert.ok(queries.includes("Kalitimbang Kota Cilegon 42426"));
    assert.ok(queries.includes("42426"));
    assert.ok(queries.includes("Kalitimbang"));
    assert.ok(queries.length <= MAX_AREA_SEARCH_QUERIES);

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
    // The manual search is a FALLBACK with simpler wording, shown only when the
    // automatic map → reverse geocode → Biteship area resolution genuinely failed.
    assert.match(checkoutPage, /Area pengiriman belum ditemukan otomatis\./);
    assert.match(checkoutPage, /Cari kelurahan atau kecamatan\./);
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
test("geocoder + Google Maps errors are sanitized (no raw upstream text, no key)", () => {
    // A failed bootstrap is a typed error with a fixed, safe Indonesian message.
    assert.match(googleMapsLoader, /GoogleMapsLoadError/);
    assert.match(googleMapsLoader, /"MISSING_KEY" \| "UNSUPPORTED" \| "LOAD_FAILED"/);
    assert.match(googleMapsLoader, /Peta Google belum dapat dimuat\. Periksa koneksi lalu coba lagi\./);
    assert.match(googleMapsLoader, /Peta belum dikonfigurasi\. Hubungi admin AFA STORE\./);
    // The key is read from env only and is never logged, echoed or embedded in markup.
    assert.match(googleMapsLoader, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
    assert.doesNotMatch(googleMapsLoader, /console\.(log|info|warn|error)/);
    assert.doesNotMatch(locationMap + locationSearch + googleGeocoding + googleMapsLoader, /console\.(log|info|warn|error)/);
    // A failed Places pick shows a fixed, safe message instead of the upstream error.
    assert.match(locationSearch, /SELECTION_ERROR/);
    assert.match(locationSearch, /Alamat itu belum dapat dibaca/);
    // The confirmed-pin path keeps its safe, customer-facing failure copy.
    assert.match(checkoutPage, /Alamat lokasi belum dapat dikenali/);
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

// map / search architecture: official Google Maps JS API (key from env, never hardcoded)
test("map + search run on the Google Maps JS API and no longer on OSM/Nominatim", () => {
    assert.match(checkoutPage, /CheckoutLocationMap/);
    assert.match(checkoutPage, /CheckoutLocationSearch/);
    assert.match(locationMap, /loadGoogleMaps/);
    assert.match(locationSearch, /PlaceAutocompleteElement/);
    assert.match(googleMapsLoader, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
    assert.match(googleMapsLoader, /maps\.googleapis\.com/);
    // Search results and reverse geocoding both go through Google, not the OSM proxy.
    assert.match(locationSearch, /toLocationSearchResult/);
    assert.match(checkoutPage, /reverseGeocodeWithGoogle/);
    assert.doesNotMatch(checkoutPage, /api\/location\//);
    assert.doesNotMatch(locationMap + locationSearch, /tile\.openstreetmap\.org|nominatim/i);
    // No API key literal is ever committed to the repository.
    assert.doesNotMatch(locationMap + locationSearch + googleMapsLoader + googleGeocoding + checkoutPage, /AIza[0-9A-Za-z_-]{10,}/);
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

test("\"GUNAKAN LOKASI INI\" is the single trigger for location confirmation", () => {
    assert.match(checkoutPage, /GUNAKAN LOKASI INI/);
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

test("opening the picker (first time or edit) never resets shipping or clears the old location", () => {
    assert.match(checkoutPage, /const openLocationPicker = \(\) => \{[\s\S]*?setMapOpen\(true\);/);
    assert.doesNotMatch(checkoutPage, /const openLocationPicker = \(\) => \{[\s\S]*?resetAll\(\);/);
    assert.doesNotMatch(checkoutPage, /const openLocationPicker = \(\) => \{[\s\S]*?setConfirmedLocation\(null\);/);
});

test("closing/canceling the picker keeps the previously confirmed location intact", () => {
    assert.match(checkoutPage, /const closeLocationPicker = \(\) => \{[\s\S]*?setMapOpen\(false\);/);
    assert.doesNotMatch(checkoutPage, /const closeLocationPicker = \(\) => \{[\s\S]*?setConfirmedLocation/);
});

test("a newly confirmed location resets the previous shipping", () => {
    assert.match(checkoutPage, /const confirmLocation = \(\) => \{[\s\S]*?resetAll\(\);[\s\S]*?setConfirmedLocation\(draftLocation\);/);
    assert.match(checkoutPage, /Ubah Lokasi/);
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

// Fullscreen location picker UX.
test("checkout opens a fullscreen location picker instead of an inline map card", () => {
    assert.match(checkoutPage, /mapOpen/);
    assert.match(checkoutPage, /CheckoutLocationMap/);
    assert.match(checkoutPage, /fullscreen/);
    assert.match(checkoutPage, /BUKA PETA/);
    assert.match(checkoutPage, /Tentukan Lokasi Pengiriman/);
});

test("checkout no longer permanently renders the map inside the address flow", () => {
    // The location card is a lightweight CTA; the map only lives inside the gated picker.
    assert.match(checkoutPage, /PILIH LOKASI/);
    assert.match(checkoutPage, /Lokasi pengiriman dipilih/);
    assert.doesNotMatch(checkoutPage, /<CheckoutLocationMap\s*\n\s*center=\{draftLocation\}/);
});

test("fullscreen picker closes only after reverse geocode succeeds", () => {
    // Success: reverse state flips to "done" before the picker is dismissed.
    assert.match(checkoutPage, /setReverseState\("done"\);[\s\S]*?setMapOpen\(false\)/);
    // Failure: the error path re-enters manual area fallback and does NOT dismiss the picker.
    assert.match(checkoutPage, /setReverseState\("error"\);[\s\S]*?setAreaState\("not_found"\);/);
    assert.doesNotMatch(checkoutPage, /setReverseState\("error"\);\s*setMapOpen\(false\)/);
});

test("reverse geocode failure keeps the picker open with a retry action", () => {
    assert.match(checkoutPage, /Alamat lokasi belum dapat dikenali\. Geser titik sedikit lalu coba kembali\./);
    assert.match(checkoutPage, /Coba Lagi/);
});

test("map provider attribution stays visible in the picker", () => {
    // Google's own logo/terms are drawn by the API; the picker adds its own chip too.
    assert.match(locationMap, /Peta &copy; Google/);
});

// ===== Biteship destination area matching (smart checkout) =====

test("area match: Bojong / Karang Tengah / Cianjur / Jawa Barat / 43125 is a strong match", () => {
    const address = { province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong", postcode: "43125" };
    const candidates = [
        { id: "bojong", name: "Bojong, Karangtengah, Kabupaten Cianjur, Jawa Barat 43125", type: "level_4", postalCode: "43125", province: "Jawa Barat", city: "Kabupaten Cianjur", district: "Karangtengah", village: "Bojong" },
    ];
    const best = pickBestAreaMatch(candidates, address);
    assert.equal(best?.id, "bojong");
});

test("area match: administrative prefixes (Kabupaten/Kecamatan/Desa) compare as equal", () => {
    const address = { province: "Jawa Barat", city: "Kabupaten Cianjur", district: "Kecamatan Karang Tengah", village: "Desa Bojong", postcode: "43125" };
    const candidates = [
        { id: "bojong", name: "Bojong, Karang Tengah, Cianjur, Jawa Barat 43125", type: "level_4", postalCode: "43125", province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong" },
    ];
    const best = pickBestAreaMatch(candidates, address);
    assert.equal(best?.id, "bojong");
    assert.equal(normalizeAreaName("Kabupaten Cianjur"), "cianjur");
    assert.equal(normalizeAreaName("Kecamatan Karang Tengah"), "karang tengah");
    assert.equal(normalizeAreaName("Desa Bojong"), "bojong");
});

test("area match: whitespace variation Karangtengah vs Karang Tengah matches when other components are strong", () => {
    const address = { province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong", postcode: "43125" };
    const candidates = [
        { id: "bojong", name: "Bojong, Karangtengah, Cianjur, Jawa Barat 43125", type: "level_4", postalCode: "43125", province: "Jawa Barat", city: "Cianjur", district: "Karangtengah", village: "Bojong" },
    ];
    const best = pickBestAreaMatch(candidates, address);
    assert.equal(best?.id, "bojong");
});

test("area match: postal + city + district exact is a strong match even without village", () => {
    const address = { province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "", postcode: "43125" };
    const candidates = [
        { id: "kec", name: "Karangtengah, Kabupaten Cianjur, Jawa Barat 43125", type: "level_3", postalCode: "43125", province: "Jawa Barat", city: "Kabupaten Cianjur", district: "Karangtengah" },
    ];
    const best = pickBestAreaMatch(candidates, address);
    assert.equal(best?.id, "kec");
});

test("area match: same village name in a different city is rejected", () => {
    const address = { province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong", postcode: "43125" };
    const candidates = [
        { id: "bandung", name: "Bojong, Bojong, Kota Bandung, Jawa Barat 40111", type: "level_4", postalCode: "40111", province: "Jawa Barat", city: "Bandung", district: "Bojong", village: "Bojong" },
    ];
    assert.equal(pickBestAreaMatch(candidates, address), null);
});

test("area match: postal mismatch + ambiguous other data does not strong-match", () => {
    const address = { province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong", postcode: "43125" };
    const candidates = [
        { id: "ambiguous", name: "Bojong, Cianjur, Jawa Barat 43126", type: "level_4", postalCode: "43126", province: "Jawa Barat", city: "Cianjur", village: "Bojong" },
    ];
    assert.equal(pickBestAreaMatch(candidates, address), null);
});

test("area match: no strong match returns null (manual fallback path)", () => {
    const address = { province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong", postcode: "43125" };
    const candidates = [
        { id: "x", name: "Surabaya", type: "level_2", city: "Surabaya" },
    ];
    assert.equal(pickBestAreaMatch(candidates, address), null);
});

test("area match: search queries are most-specific-first and never rely on province", () => {
    const queries = buildAreaSearchQueries({ province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong", postcode: "43125" });
    assert.equal(queries[0], "Bojong Karang Tengah Cianjur 43125");
    assert.ok(queries.includes("Karang Tengah Cianjur 43125"));
    assert.ok(queries.includes("Bojong Cianjur 43125"));
    assert.ok(queries.includes("43125"));
    assert.ok(queries.includes("Bojong"));
    // Bounded: a precise pin never turns into a request storm against Biteship.
    assert.ok(queries.length <= MAX_AREA_SEARCH_QUERIES);
    // No query should contain the province (keeps Biteship search broad enough).
    assert.ok(queries.every((q) => !q.toLowerCase().includes("jawa barat")));
});

test("area match: never falls back to areas[0] (no unsafe auto-select)", () => {
    assert.doesNotMatch(checkoutPage, /setDestinationArea\(areas\[0\]\)/);
    assert.match(checkoutPage, /setDestinationArea\(best\)/);
});

test("destinationAreaId still comes only from an official Biteship area result", () => {
    assert.match(checkoutPage, /pickBestAreaMatch\(candidates, address\)/);
    assert.match(orderRoute, /normalizeAreaId\(address\.destinationAreaId\)/);
});
