/*
 * Spec for the Google Maps checkout location picker migration.
 *
 * Architecture rules asserted here:
 *   - the browser key comes ONLY from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
 *   - the official Maps JS API is the single map/search/geocoder provider,
 *   - a Google `place_id` is NEVER used as a Biteship `destinationAreaId`,
 *   - the confirmed pin keeps full float precision and is never invented.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    GOOGLE_PLACE_FIELDS,
    normalizeGoogleComponents,
    normalizeGoogleGeocodeResult,
    normalizeGoogleGeocodeResults,
    normalizeGooglePlace,
    reverseGeocodeWithGoogle,
    toLocationSearchResult,
} from "../src/lib/google-geocoding.ts";
import {
    GOOGLE_MAPS_API_KEY_ENV,
    GOOGLE_MAPS_CALLBACK,
    GOOGLE_MAPS_LIBRARIES,
    GOOGLE_MAPS_SCRIPT_ID,
    GoogleMapsLoadError,
    buildGoogleMapsScriptUrl,
    loadGoogleMaps,
    readGoogleMapsApiKey,
} from "../src/lib/google-maps-loader.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * Comment-free view of a source file, so "must NOT contain" rules apply to real code
 * instead of failing on the prose that explains why the rule exists.
 */
const code = (source) =>
    source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !/^\s*\/\//.test(line))
        .join("\n");

const checkoutPage = read("../src/app/checkout/page.tsx");
const locationMap = read("../src/components/checkout/location-map.tsx");
const locationSearch = read("../src/components/checkout/location-search.tsx");
const loaderLib = read("../src/lib/google-maps-loader.ts");
const geocodingLib = read("../src/lib/google-geocoding.ts");

/** Places API (New) Place, in the exact shape `fetchFields` returns it. */
const NEW_PLACE = {
    formattedAddress: "Jl. Melati No. 10, Kalitimbang, Cibeber, Kota Cilegon, Banten 42426, Indonesia",
    displayName: { text: "Rumah Kalitimbang" },
    location: { lat: () => -6.0021, lng: () => 106.012345678 },
    addressComponents: [
        { longText: "10", shortText: "10", types: ["street_number"] },
        { longText: "Jl. Melati", shortText: "Jl. Melati", types: ["route"] },
        { longText: "Kalitimbang", shortText: "Kalitimbang", types: ["administrative_area_level_4"] },
        { longText: "Cibeber", shortText: "Cibeber", types: ["administrative_area_level_3"] },
        { longText: "Kota Cilegon", shortText: "Kota Cilegon", types: ["administrative_area_level_2"] },
        { longText: "Banten", shortText: "Banten", types: ["administrative_area_level_1"] },
        { longText: "42426", shortText: "42426", types: ["postal_code"] },
        { longText: "Indonesia", shortText: "ID", types: ["country"] },
    ],
    // Must never travel into checkout: it is not a Biteship area id.
    place_id: "ChIJPLACEIDMUSTNEVERLEAK",
};

/** Minimal stand-in for the Maps JS API handle. */
function fakeGeocoderApi(handler) {
    const calls = [];
    return {
        calls,
        api: {
            maps: {
                Geocoder: class {
                    async geocode(request) {
                        calls.push(request);
                        return handler(request);
                    }
                },
            },
        },
    };
}

// ===== loader: key handling =====

test("the browser key is read only from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", () => {
    assert.equal(GOOGLE_MAPS_API_KEY_ENV, "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
    assert.equal(readGoogleMapsApiKey({}), null);
    assert.equal(readGoogleMapsApiKey({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "   " }), null);
    assert.equal(readGoogleMapsApiKey({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 42 }), null);
    assert.equal(readGoogleMapsApiKey(undefined), null);
    assert.equal(readGoogleMapsApiKey({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "  KEY-123  " }), "KEY-123");
    // A differently named (e.g. server-side) key is never picked up by accident.
    assert.equal(readGoogleMapsApiKey({ GOOGLE_MAPS_API_KEY: "server-key" }), null);
});

test("the bootstrap URL is the official Maps JS API URL with the required options", () => {
    const url = new URL(buildGoogleMapsScriptUrl("KEY-123"));
    assert.equal(url.origin, "https://maps.googleapis.com");
    assert.equal(url.pathname, "/maps/api/js");
    assert.equal(url.searchParams.get("key"), "KEY-123");
    assert.equal(url.searchParams.get("v"), "weekly");
    assert.equal(url.searchParams.get("loading"), "async");
    assert.equal(url.searchParams.get("libraries"), "places");
    assert.deepEqual([...GOOGLE_MAPS_LIBRARIES], ["places"]);
    assert.equal(url.searchParams.get("language"), "id");
    assert.equal(url.searchParams.get("region"), "ID");
    assert.equal(url.searchParams.get("callback"), GOOGLE_MAPS_CALLBACK);
    assert.equal(GOOGLE_MAPS_SCRIPT_ID, "afa-google-maps-js");
    assert.equal(loaderLib.includes("maps.googleapis.com"), true);
});

test("loadGoogleMaps fails safely outside the browser and never caches a failure", async () => {
    const first = await loadGoogleMaps().then(
        () => null,
        (error) => error,
    );
    assert.ok(first instanceof GoogleMapsLoadError);
    assert.ok(first.code === "MISSING_KEY" || first.code === "UNSUPPORTED");
    // Safe copy only: no key, no env var name, no upstream detail.
    assert.doesNotMatch(first.message, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY|key=|http/i);
    // The failure is not cached, so a retry behaves identically instead of hanging.
    const second = await loadGoogleMaps().then(
        () => null,
        (error) => error,
    );
    assert.equal(second?.code, first.code);
});

// ===== Places API (New) normalization =====

test("a Places API (New) place maps onto the internal address shape", () => {
    const address = normalizeGooglePlace(NEW_PLACE);
    assert.equal(address.road, "Jl. Melati");
    assert.equal(address.houseNumber, "10");
    assert.equal(address.village, "Kalitimbang");
    assert.equal(address.district, "Cibeber");
    assert.equal(address.city, "Kota Cilegon");
    assert.equal(address.province, "Banten");
    assert.equal(address.postcode, "42426");
    assert.equal(address.country, "Indonesia");
    // Full float precision: the confirmed pin is never rounded.
    assert.equal(address.latitude, -6.0021);
    assert.equal(address.longitude, 106.012345678);
});

test("a Google place_id or displayName never becomes an area id or an invented field", () => {
    const address = normalizeGooglePlace(NEW_PLACE);
    assert.equal("placeId" in address, false);
    assert.equal("place_id" in address, false);
    const result = toLocationSearchResult(address);
    assert.equal("placeId" in result, false);
    assert.equal("place_id" in result, false);
    assert.equal(result.address.regency, null);
    // The display name is Google's formatted address, never the raw place name.
    assert.equal(result.displayName, NEW_PLACE.formattedAddress);
    assert.equal(result.latitude, -6.0021);
    assert.equal(result.longitude, 106.012345678);
    // Its `regency` slot stays null: the kota/kabupaten already lives in `city`.
    assert.equal(result.address.city, "Kota Cilegon");
});

test("the Places field mask asks for coordinates and components, never the place id", () => {
    assert.ok(GOOGLE_PLACE_FIELDS.includes("location"));
    assert.ok(GOOGLE_PLACE_FIELDS.includes("addressComponents"));
    assert.ok(GOOGLE_PLACE_FIELDS.includes("formattedAddress"));
    assert.equal(GOOGLE_PLACE_FIELDS.includes("place_id"), false);
    assert.equal(locationSearch.includes("GOOGLE_PLACE_FIELDS"), true);
});

test("one level repeated by Google is dropped instead of faked as a kelurahan", () => {
    const address = normalizeGooglePlace({
        formattedAddress: "Cibeber, Cibeber, Kota Cilegon",
        location: { lat: -6.0021, lng: 106.012345678 },
        addressComponents: [
            { longText: "Cibeber", types: ["administrative_area_level_4"] },
            { longText: "Cibeber", types: ["administrative_area_level_3"] },
            { longText: "Kota Cilegon", types: ["administrative_area_level_2"] },
        ],
    });
    // The kecamatan stays a kecamatan; it is never duplicated as a village.
    assert.equal(address.district, "Cibeber");
    assert.equal(address.village, null);
    assert.equal(address.city, "Kota Cilegon");
});

test("legacy PlaceResult shapes (geometry.location + long_name) still normalize", () => {
    const address = normalizeGooglePlace({
        formatted_address: "Jl. Melati No. 10, Cibeber, Kota Cilegon",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [
            { long_name: "Jl. Melati", short_name: "Jl. Melati", types: ["route"] },
            { long_name: "Cibeber", short_name: "Cibeber", types: ["administrative_area_level_3"] },
        ],
    });
    assert.equal(address.road, "Jl. Melati");
    assert.equal(address.district, "Cibeber");
    // Missing/invalid coordinates never produce a result.
    assert.equal(normalizeGooglePlace({ formatted_address: "Nowhere" }), null);
    assert.equal(normalizeGooglePlace(null), null);
});

test("component reading is tolerant and free of invented values", () => {
    const components = normalizeGoogleComponents([
        { longText: "Cibeber", types: ["administrative_area_level_3"] },
        { long_name: "Banten", types: ["administrative_area_level_1"] },
        { longText: "   ", types: ["postal_code"] },
        null,
    ]);
    assert.equal(components.length, 3);
    const address = normalizeGooglePlace({
        formattedAddress: "Cibeber, Banten",
        location: { lat: -6.0021, lng: 106.012345678 },
        addressComponents: components,
    });
    assert.equal(address.district, "Cibeber");
    assert.equal(address.province, "Banten");
    // An empty postal_code component stays null — it is never filled with junk.
    assert.equal(address.postcode, null);
    assert.equal(normalizeGoogleComponents("not-an-array").length, 0);
});

// ===== Geocoding API response normalization =====

test("a Geocoding API result maps onto the internal address shape", () => {
    const address = normalizeGoogleGeocodeResult({
        formatted_address: "Jl. Melati No. 10, Kalitimbang, Cibeber, Kota Cilegon, Banten 42426, Indonesia",
        geometry: { location: { lat: () => -6.0021, lng: () => 106.012345678 } },
        place_id: "ChIJPLACEIDMUSTNEVERLEAK",
        address_components: [
            { long_name: "Jl. Melati", short_name: "Jl. Melati", types: ["route"] },
            { long_name: "Kalitimbang", short_name: "Kalitimbang", types: ["administrative_area_level_4"] },
            { long_name: "Cibeber", short_name: "Cibeber", types: ["administrative_area_level_3"] },
            { long_name: "Kota Cilegon", short_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
            { long_name: "Banten", short_name: "Banten", types: ["administrative_area_level_1"] },
            { long_name: "42426", short_name: "42426", types: ["postal_code"] },
        ],
    });
    assert.equal(address.village, "Kalitimbang");
    assert.equal(address.district, "Cibeber");
    assert.equal(address.city, "Kota Cilegon");
    assert.equal(address.province, "Banten");
    assert.equal(address.postcode, "42426");
    assert.equal(address.longitude, 106.012345678);
    // A response without geometry cannot move the confirmed pin: the requested pin wins.
    const withoutGeometry = normalizeGoogleGeocodeResult(
        { formatted_address: "Jl. Melati", address_components: [] },
        { latitude: -6.0021, longitude: 106.012345678 },
    );
    assert.equal(withoutGeometry.latitude, -6.0021);
    assert.equal(withoutGeometry.longitude, 106.012345678);
    // No geometry and no pin → no result at all (never a 0,0 address).
    assert.equal(normalizeGoogleGeocodeResult({ formatted_address: "Nowhere" }), null);
});

test("response normalization keeps every usable result and drops the unusable ones", () => {
    const results = normalizeGoogleGeocodeResults(
        {
            status: "OK",
            results: [
                { formatted_address: "A", geometry: { location: { lat: -6.0021, lng: 106.012345678 } } },
                { formatted_address: "B" },
                null,
                { formatted_address: "C", geometry: { location: { lat: 999, lng: 999 } } },
            ],
        },
        { latitude: -6.5, longitude: 106.5 },
    );
    // "B" and the bogus "C" fall back to the same requested pin, so they collapse later.
    assert.equal(results.length, 3);
    assert.equal(results[0].formattedAddress, "A");
    assert.equal(results[1].latitude, -6.5);
    assert.equal(results[2].latitude, -6.5);
    assert.deepEqual(normalizeGoogleGeocodeResults(null), []);
    assert.deepEqual(normalizeGoogleGeocodeResults({ status: "ZERO_RESULTS" }), []);
});

// ===== reverse geocoding =====

test("reverse geocoding asks Google for the exact pin and keeps full precision", async () => {
    const { api, calls } = fakeGeocoderApi(() => ({
        status: "OK",
        results: [
            {
                formatted_address: "Jl. Melati No. 10, Cibeber, Kota Cilegon",
                geometry: { location: { lat: -6.123456789123, lng: 106.987654321987 } },
                address_components: [
                    { long_name: "Jl. Melati", long_name: "Jl. Melati", types: ["route"] },
                    { long_name: "Cibeber", types: ["administrative_area_level_3"] },
                ],
            },
        ],
    }));

    const address = await reverseGeocodeWithGoogle({ latitude: -6.123456789123, longitude: 106.987654321987 }, api);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
        location: { lat: -6.123456789123, lng: 106.987654321987 },
        language: "id",
        region: "ID",
    });
    assert.equal(address.road, "Jl. Melati");
    assert.equal(address.district, "Cibeber");
    // Coordinates are never rounded to a fixed number of decimals.
    assert.equal(address.latitude, -6.123456789123);
    assert.equal(address.longitude, 106.987654321987);
});

test("reverse geocoding resolves to null instead of inventing an address", async () => {
    const empty = fakeGeocoderApi(() => ({ status: "ZERO_RESULTS", results: [] }));
    assert.equal(await reverseGeocodeWithGoogle({ latitude: -6.0021, longitude: 106.012345678 }, empty.api), null);
    assert.equal(empty.calls.length, 1);

    // No usable API handle: nothing is called at all.
    const broken = fakeGeocoderApi(() => ({ results: [] }));
    assert.equal(await reverseGeocodeWithGoogle({ latitude: -6.0021, longitude: 106.012345678 }, null), null);
    assert.equal(await reverseGeocodeWithGoogle({ latitude: -6.0021, longitude: 106.012345678 }, { maps: {} }), null);
    assert.equal(broken.calls.length, 0);

    // Out-of-range or missing pins are rejected before any Google call.
    const outOfRange = fakeGeocoderApi(() => ({ results: [] }));
    assert.equal(await reverseGeocodeWithGoogle({ latitude: 999, longitude: 106 }, outOfRange.api), null);
    assert.equal(await reverseGeocodeWithGoogle({ latitude: null, longitude: null }, outOfRange.api), null);
    assert.equal(await reverseGeocodeWithGoogle(undefined, outOfRange.api), null);
    assert.equal(outOfRange.calls.length, 0);
});

test("a provider error propagates so checkout can fall back to the manual picker", async () => {
    const { api } = fakeGeocoderApi(() => {
        throw new Error("OVER_QUERY_LIMIT");
    });
    await assert.rejects(
        () => reverseGeocodeWithGoogle({ latitude: -6.0021, longitude: 106.012345678 }, api),
        /OVER_QUERY_LIMIT/,
    );
});

// ===== map component =====

test("the map is drawn by the Maps JS API with the rose pin and Google attribution", () => {
    assert.match(locationMap, /loadGoogleMaps/);
    assert.match(locationMap, /new api\.maps\.Map\(containerRef\.current/);
    assert.match(locationMap, /disableDefaultUI: true/);
    assert.match(locationMap, /clickableIcons: false/);
    assert.match(locationMap, /map\.addListener\("dragstart"/);
    assert.match(locationMap, /map\.addListener\("dragend"/);
    assert.match(locationMap, /map\.addListener\("idle", reportCenter\)/);
    assert.match(locationMap, /map\.addListener\("zoom_changed"/);
    // Listeners are released on unmount so the map cannot leak across remounts.
    assert.match(locationMap, /api\.maps\.event\?\.clearInstanceListeners\?\.\(map\)/);
    // Google's own logo/terms are never covered up and the picker labels its own pin.
    assert.match(locationMap, /Peta &copy; Google/);
    assert.match(locationMap, /TITIK PENGIRIMAN/);
    assert.match(locationMap, /role="application" aria-label="Peta lokasi pengiriman"/);
    assert.match(locationMap, /aria-label="Perbesar peta"/);
    assert.match(locationMap, /aria-label="Perkecil peta"/);
    // The previous provider is gone for good.
    assert.doesNotMatch(code(locationMap), /openstreetmap|nominatim|leaflet/i);
});

test("panning the map never geocodes and never touches Biteship", () => {
    // The map only reports the settled center; checkout decides what happens next.
    assert.doesNotMatch(code(locationMap), /reverseGeocode/i);
    assert.doesNotMatch(code(locationMap), /fetch\(/);
    assert.doesNotMatch(code(locationMap), /destinationArea|areaId|biteship|rates/i);
});

// ===== search component =====

test("search uses the official Places autocomplete widget and never confirms a location", () => {
    assert.match(locationSearch, /new api\.maps\.places\.PlaceAutocompleteElement\(/);
    assert.match(locationSearch, /addEventListener\("gmp-select", handleSelect\)/);
    // Older builds only emit the legacy event name, so both are wired.
    assert.match(locationSearch, /addEventListener\("gmp-placeselect", handleSelect\)/);
    assert.match(locationSearch, /await place\.fetchFields\?\.\(\{ fields: \[\.\.\.GOOGLE_PLACE_FIELDS\] \}\)/);
    assert.match(locationSearch, /toLocationSearchResult\(normalizeGooglePlace\(place\)\)/);
    // It hands the DRAFT selection to the page and stops there.
    assert.match(locationSearch, /onSelectRef\.current\(result\)/);
    assert.doesNotMatch(code(locationSearch), /confirmLocation|setConfirmedLocation|destinationAreaId/);
    assert.doesNotMatch(code(locationSearch), /fetch\(|api\/location/);
});

test("a pick is normalized once, the widget is cleared, and failures stay safe", () => {
    // Latest selection wins: a slow response for an older pick is discarded.
    assert.match(locationSearch, /const selectionId = \+\+selectionRef\.current/);
    assert.match(locationSearch, /if \(disposed \|\| selectionId !== selectionRef\.current\) return/);
    // The widget's own text field is emptied after a pick so the pin stays the source of truth.
    assert.match(locationSearch, /if \(element\) element\.value = ""/);
    assert.match(locationSearch, /SELECTION_ERROR/);
    assert.match(locationSearch, /Alamat itu belum dapat dibaca\. Coba pilih saran lain atau geser peta secara manual\./);
    assert.match(locationSearch, /Memuat pencarian alamat\.\.\./);
    // Loading failures are surfaced as a retry, never as an upstream error string.
    assert.match(locationSearch, /setAttempt\(\(value\) => value \+ 1\)/);
    assert.match(locationSearch, /GoogleMapsLoadError/);
    assert.doesNotMatch(code(locationSearch), /\.message\b/);
});

// ===== checkout page wiring =====

test("a search suggestion only moves the draft pin", () => {
    assert.match(
        checkoutPage,
        /const handleSearchSelect = \(result: LocationSearchResult\) => \{\s*\n\s*const coords = \{ latitude: result\.latitude, longitude: result\.longitude \};\s*\n\s*setDraftLocation\(coords\);\s*\n\s*setMapZoom\(16\);\s*\n\s*\};/,
    );
    // Panning behaves the same way: draft only, no quote side effects.
    assert.match(
        checkoutPage,
        /const handleCenterChange = \(coords: DeliveryCoordinates\) => \{\s*\n\s*setDraftLocation\(coords\);\s*\n\s*\};/,
    );
    assert.match(checkoutPage, /<CheckoutLocationSearch onSelect=\{handleSearchSelect\} \/>/);
    assert.match(checkoutPage, /<CheckoutLocationMap/);
});

test("confirming a pin reverse-geocodes with Google in order and guards against stale answers", () => {
    assert.match(checkoutPage, /import \{ reverseGeocodeWithGoogle, toLocationSearchResult \} from "@\/lib\/google-geocoding"/);
    assert.match(checkoutPage, /import \{ getGoogleMapsApi, loadGoogleMaps \} from "@\/lib\/google-maps-loader"/);
    // The API is awaited before the handle is read, so a cold picker still works.
    assert.match(
        checkoutPage,
        /await loadGoogleMaps\(\);\s*\n\s*const address = await reverseGeocodeWithGoogle\(requestedPin, getGoogleMapsApi\(\)\);/,
    );
    // Latest pin wins: superseded responses and responses for an older pin are dropped.
    assert.match(checkoutPage, /const requestedPin = \{ latitude: coords\.latitude, longitude: coords\.longitude \};/);
    assert.match(
        checkoutPage,
        /if \(isStaleResponse\(reverseRef\.current, requestId\) \|\| isStalePin\(requestedPin, confirmedPinRef\.current\)\) return;/,
    );
    // The reverse geocode runs BEFORE the area match and the picker closes LAST.
    const reverseIndex = checkoutPage.indexOf("await reverseGeocodeWithGoogle(");
    const matchIndex = checkoutPage.indexOf("void matchArea({", reverseIndex);
    const closeIndex = checkoutPage.indexOf("setMapOpen(false)", reverseIndex);
    assert.ok(reverseIndex > -1 && matchIndex > reverseIndex && closeIndex > matchIndex);
    // Failure of either step reveals the manual kecamatan/kelurahan fallback.
    assert.match(
        checkoutPage,
        /if \(!result\) \{\s*\n\s*setReverseState\("error"\);\s*\n[\s\S]{0,200}?setAreaState\("not_found"\);\s*\n\s*return;/,
    );
});

test("the shipping quote is invalidated whenever the pin or resolved area changes", () => {
    assert.match(
        checkoutPage,
        /const destinationSignature = locationSignature\(\{\s*\n\s*latitude: confirmedLocation\?\.latitude,\s*\n\s*longitude: confirmedLocation\?\.longitude,\s*\n\s*destinationAreaId: destinationArea\?\.id \?\? "",\s*\n\s*formattedAddress: destinationAddress\?\.displayName \?\? "",\s*\n\s*\}\);/,
    );
    assert.match(checkoutPage, /mustInvalidateShipping\(quoteSignature, destinationSignature\)/);
    // The area-match effect and the rate effect both depend on the signature.
    assert.match(checkoutPage, /setQuoteSignature\(""\)/);
    assert.match(checkoutPage, /\}, \[destinationArea, destinationSignature, session\?\.items, rateReload\]\);/);
});

test("nothing in the geocoding library can carry a Google place id into the app", () => {
    // Only the prose explains the rule; no code path reads or returns `place_id`.
    assert.doesNotMatch(code(geocodingLib), /place_id|placeId/);
    // And the address it hands back is always the internal shape, never a raw Google result.
    assert.match(geocodingLib, /export function toLocationSearchResult/);
});

test("Biteship stays authoritative: only the destinationAreaId is ever sent", () => {
    // Google's place id / place name is never forwarded as an area id nor as an address.
    assert.doesNotMatch(code(checkoutPage), /place_id|placeId/);
    assert.doesNotMatch(code(checkoutPage), /googlePlace|google_place/);
    // Only the internal normalized address fields feed the area matcher.
    assert.match(
        checkoutPage,
        /void matchArea\(\{\s*\n\s*province: nextAddress\.province,\s*\n\s*city: nextAddress\.city,\s*\n\s*district: nextAddress\.district,\s*\n\s*village: nextAddress\.village,\s*\n\s*postcode: nextAddress\.postalCode,\s*\n\s*\}\);/,
    );
    assert.match(checkoutPage, /destinationAreaId: destinationArea\.id,/);
    // The pickup point never becomes a destination: the API call only needs the area.
    assert.match(checkoutPage, /body: JSON\.stringify\(\{ destinationAreaId: destinationArea\.id,/);
    assert.doesNotMatch(code(checkoutPage), /api\/location|nominatim/i);
});
