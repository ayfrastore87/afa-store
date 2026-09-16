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
    classifyGoogleGeocodeFailure,
    isRecognizedGoogleAddress,
    normalizeGoogleComponents,
    normalizeGoogleGeocodeResult,
    normalizeGoogleGeocodeResults,
    normalizeGooglePlace,
    pickBestGoogleGeocodeResult,
    reverseGeocodeWithGoogle,
    scoreGoogleAddress,
    toLocationSearchResult,
} from "../src/lib/google-geocoding.ts";
import {
    GOOGLE_MAPS_API_KEY_ENV,
    GOOGLE_MAPS_CALLBACK,
    GOOGLE_MAPS_GEOCODING_LIBRARY,
    GOOGLE_MAPS_LIBRARIES,
    GOOGLE_MAPS_LOAD_FAILED_MESSAGE,
    GOOGLE_MAPS_MISSING_KEY_MESSAGE,
    GOOGLE_MAPS_SCRIPT_ID,
    GoogleMapsLoadError,
    buildGoogleMapsScriptUrl,
    ignoreLateGoogleMapsCallback,
    injectGoogleMapsScript,
    loadGoogleMaps,
    loadGoogleMapsGeocoder,
    readGoogleMapsApiKey,
} from "../src/lib/google-maps-loader.ts";
import { isStalePin, isStaleResponse } from "../src/lib/checkout-address.ts";
import { COARSE_POINTER_QUERY, preferredGestureHandling, prefersCoarsePointer, resolveGestureHandling } from "../src/lib/map-gesture.ts";

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

/**
 * Runs `fn` with NEXT_PUBLIC_GOOGLE_MAPS_API_KEY forced to `value` (`undefined` = absent),
 * then restores whatever the machine had, so the suite never depends on — nor pollutes —
 * the ambient environment.
 */
function withEnvKey(value, fn) {
    const previous = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (value === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = value;
    try {
        return fn();
    } finally {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = previous;
    }
}

const checkoutPage = read("../src/app/checkout/page.tsx");
const locationMap = read("../src/components/checkout/location-map.tsx");
const locationSearch = read("../src/components/checkout/location-search.tsx");
const loaderLib = read("../src/lib/google-maps-loader.ts");
const geocodingLib = read("../src/lib/google-geocoding.ts");
const mapGestureLib = read("../src/lib/map-gesture.ts");

/**
 * The fake browser the loader's *timing* can be driven with: the global namespace it reads and
 * the script element it would append. Application code never builds one (it derives the real
 * `window`/`document`), which is exactly why this can pin down behaviour that cannot be
 * observed against the live Google API.
 */
function fakeLoaderEnvironment(google) {
    return {
        global: { google },
        createScript: () => ({
            id: GOOGLE_MAPS_SCRIPT_ID,
            src: "",
            async: true,
            defer: false,
            addEventListener: () => {},
            removeEventListener: () => {},
            remove: () => {},
        }),
        appendScript: () => {},
        removeScriptById: () => {},
        schedule: (callback, ms) => setTimeout(callback, ms),
        cancel: (handle) => clearTimeout(handle),
        timeoutMs: 200,
        pollMs: 5,
    };
}

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
    // The default path (no argument) is the runtime path: it reads the literal env var,
    // so this equivalence must hold no matter what the machine has exported.
    assert.equal(readGoogleMapsApiKey(undefined), readGoogleMapsApiKey());
    assert.equal(readGoogleMapsApiKey({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "  KEY-123  " }), "KEY-123");
    // A differently named (e.g. server-side) key is never picked up by accident.
    assert.equal(readGoogleMapsApiKey({ GOOGLE_MAPS_API_KEY: "server-key" }), null);
});

test("the runtime key read is a literal member expression so Next.js can inline it", () => {
    const loaderCode = code(loaderLib);
    // This exact form is what Next.js/Turbopack substitutes into the client bundle.
    assert.match(loaderCode, /process\.env\.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
    // No computed `process.env[...]` lookup may exist anywhere in the loader: it is never
    // substituted, which is what made Production render "Peta belum dikonfigurasi" even
    // though NEXT_PUBLIC_GOOGLE_MAPS_API_KEY was configured on Vercel.
    assert.doesNotMatch(loaderCode, /process\.env\s*\[/);
    assert.doesNotMatch(loaderCode, /defaultEnv/);
    // The computed lookup survives ONLY in the explicit test-injection branch.
    assert.match(loaderCode, /env \? env\[GOOGLE_MAPS_API_KEY_ENV\] : publicEnvApiKey\(\)/);
    // Injection can never be reached from application code.
    assert.doesNotMatch(code(checkoutPage), /readGoogleMapsApiKey\(/);
    assert.doesNotMatch(code(locationMap), /readGoogleMapsApiKey\(/);
    assert.doesNotMatch(code(locationSearch), /readGoogleMapsApiKey\(/);
    // Still never hardcoded.
    assert.doesNotMatch(loaderCode, /AIza/);
    assert.doesNotMatch(code(locationMap) + code(locationSearch) + code(checkoutPage), /AIza/);
});

test("the default path really reads the ambient public env var (trimmed, blank = missing)", () => {
    assert.equal(withEnvKey("  RUNTIME-KEY  ", () => readGoogleMapsApiKey()), "RUNTIME-KEY");
    assert.equal(withEnvKey("   ", () => readGoogleMapsApiKey()), null);
    assert.equal(withEnvKey(undefined, () => readGoogleMapsApiKey()), null);
    // Injection still wins, so unit tests never depend on the ambient value.
    assert.equal(
        withEnvKey("AMBIENT-KEY", () => readGoogleMapsApiKey({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "  FIXTURE-KEY  " })),
        "FIXTURE-KEY",
    );
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

test("a missing literal key still raises MISSING_KEY while a present key yields the Google script URL", async () => {
    const missing = await withEnvKey(undefined, () => loadGoogleMaps().then(() => null, (error) => error));
    assert.ok(missing instanceof GoogleMapsLoadError);
    assert.equal(missing.code, "MISSING_KEY");
    assert.equal(missing.message, GOOGLE_MAPS_MISSING_KEY_MESSAGE);
    assert.doesNotMatch(missing.message, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY|AIza|key=/i);

    // With the public env var present, the loader resolves exactly that key...
    const key = withEnvKey("TEST-KEY-123", () => readGoogleMapsApiKey());
    assert.equal(key, "TEST-KEY-123");
    // ...and it produces the official Google Maps bootstrap URL.
    const url = new URL(buildGoogleMapsScriptUrl(key));
    assert.equal(url.origin, "https://maps.googleapis.com");
    assert.equal(url.pathname, "/maps/api/js");
    assert.equal(url.searchParams.get("key"), "TEST-KEY-123");
    assert.equal(url.searchParams.get("libraries"), "places");

    // Outside the browser it still refuses instead of touching `document`.
    const unsupported = await withEnvKey("TEST-KEY-123", () => loadGoogleMaps().then(() => null, (error) => error));
    assert.equal(unsupported?.code, "UNSUPPORTED");

    // Neither failure is cached, so dropping the key again behaves identically.
    const again = await withEnvKey(undefined, () => loadGoogleMaps().then(() => null, (error) => error));
    assert.equal(again?.code, "MISSING_KEY");
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
    // The widget class is awaited through the loader (`importLibrary("places")`) instead of
    // being read off `google.maps` right after the API loads: with `loading=async` that read
    // raced the places script and built `new undefined(...)`.
    assert.match(locationSearch, /loadGoogleMapsPlaces\(\)/);
    assert.match(locationSearch, /new places\.PlaceAutocompleteElement\(/);
    assert.doesNotMatch(code(locationSearch), /api\.maps\.places/);
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
    assert.match(checkoutPage, /import \{ reverseGeocodeWithGoogle, toLocationSearchResult, isRecognizedGoogleAddress, classifyGoogleGeocodeFailure, type GoogleGeocodeFailureKind \} from "@\/lib\/google-geocoding"/);
    assert.match(checkoutPage, /import \{ loadGoogleMaps, loadGoogleMapsGeocoder \} from "@\/lib\/google-maps-loader"/);
    // The API *and* the Geocoder class are awaited before the call, so a cold picker still works
    // even though `google.maps.Geocoder` arrives with its own library (the places-class race).
    assert.match(
        checkoutPage,
        /await loadGoogleMaps\(\);\s*\n\s*const geocoder = await loadGoogleMapsGeocoder\(\);\s*\n\s*const address = await reverseGeocodeWithGoogle\(requestedPin, geocoder\);/,
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
    // An answer with nothing recognizable at all reveals the manual kecamatan/kelurahan fallback —
    // but only once the free fallback had its one bounded attempt first. The failure is therefore
    // reported AFTER that attempt, never while it is still running (the state stays "loading").
    assert.match(
        checkoutPage,
        /if \(!result \|\| !isRecognizedGoogleAddress\(address\)\) \{[\s\S]{0,700}?await reverseFallbackAndFill\(requestedPin, requestId\)\) return;[\s\S]{0,220}?setReverseState\("error"\);\s*\n\s*setReverseFailure\("no_address"\);\s*\n\s*setAreaState\("not_found"\);\s*\n\s*return;/,
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

// ===== address recognition robustness ("alamat belum dapat dikenali" in Production) =====

test("a reverse geocode weighs every result instead of trusting results[0]", async () => {
    const { api } = fakeGeocoderApi(() => ({
        status: "OK",
        results: [
            // Google's prominence order can lead with an entry that carries no address at all
            // (a plus code). Taking results[0] would throw the real address away.
            { types: ["plus_code"], geometry: { location: { lat: -6.0021, lng: 106.012345678 } } },
            {
                formatted_address: "Jl. Melati No. 10, Kalitimbang, Cibeber, Kota Cilegon, Banten 42426, Indonesia",
                geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
                address_components: [
                    { long_name: "10", short_name: "10", types: ["street_number"] },
                    { long_name: "Jl. Melati", short_name: "Jl. Melati", types: ["route"] },
                    { long_name: "Kalitimbang", short_name: "Kalitimbang", types: ["administrative_area_level_4"] },
                    { long_name: "Cibeber", short_name: "Cibeber", types: ["administrative_area_level_3"] },
                    { long_name: "Kota Cilegon", short_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
                    { long_name: "Banten", short_name: "Banten", types: ["administrative_area_level_1"] },
                    { long_name: "42426", short_name: "42426", types: ["postal_code"] },
                ],
            },
        ],
    }));

    const address = await reverseGeocodeWithGoogle({ latitude: -6.0021, longitude: 106.012345678 }, api);

    assert.equal(address.road, "Jl. Melati");
    assert.equal(address.houseNumber, "10");
    assert.equal(address.village, "Kalitimbang");
    assert.equal(address.district, "Cibeber");
    assert.equal(address.city, "Kota Cilegon");
    assert.equal(address.postcode, "42426");
    // The richer answer always outranks the component-less one, whatever the order.
    const bare = normalizeGoogleGeocodeResult({ types: ["plus_code"], geometry: { location: { lat: -6.0021, lng: 106.012345678 } } });
    assert.equal(scoreGoogleAddress(bare), 0);
    assert.ok(scoreGoogleAddress(address) > scoreGoogleAddress(bare));
    assert.equal(pickBestGoogleGeocodeResult([bare, address]), address);
    assert.equal(pickBestGoogleGeocodeResult([address, bare]), address);
    // And the implementation never falls back to the provider's first entry.
    assert.doesNotMatch(code(geocodingLib), /results\[0\]/);
});

test("a valid formatted_address is recognized even when every structured component is empty", () => {
    const bare = normalizeGoogleGeocodeResult({
        formatted_address: "Jl. Raya Cibeber, Kota Cilegon, Banten",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [],
    });
    assert.equal(bare.formattedAddress, "Jl. Raya Cibeber, Kota Cilegon, Banten");
    assert.equal(bare.district, null);
    assert.equal(bare.village, null);
    // Recognized by its formatted address alone: this must never print "tidak dikenali".
    assert.equal(isRecognizedGoogleAddress(bare), true);
    assert.equal(toLocationSearchResult(bare).displayName, "Jl. Raya Cibeber, Kota Cilegon, Banten");
    // An answer with NO address text and NO component is the only unrecognized case.
    const nothing = normalizeGoogleGeocodeResult({ geometry: { location: { lat: -6.0021, lng: 106.012345678 } } });
    assert.equal(isRecognizedGoogleAddress(nothing), false);
    assert.equal(pickBestGoogleGeocodeResult([nothing]), null);
    assert.equal(isRecognizedGoogleAddress(null), false);
    // The page decides exactly on that signal before it blames Google.
    assert.match(checkoutPage, /!isRecognizedGoogleAddress\(address\)/);
});



test("Indonesian structured levels are extracted from varied Google component sets", () => {
    // (a) level_4 = kelurahan, level_3 = kecamatan (the common full answer).
    const full = normalizeGoogleGeocodeResult({
        formatted_address: "Jl. Melati, Kalitimbang, Cibeber, Kota Cilegon",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [
            { long_name: "Jl. Melati", types: ["route"] },
            { long_name: "Kalitimbang", types: ["administrative_area_level_4"] },
            { long_name: "Cibeber", types: ["administrative_area_level_3"] },
            { long_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
            { long_name: "Banten", types: ["administrative_area_level_1"] },
        ],
    });
    assert.equal(full.village, "Kalitimbang");
    assert.equal(full.district, "Cibeber");

    // (b) No level_4 (Google often stops at level_3): sublocality_level_1 is the kelurahan.
    const withoutLevel4 = normalizeGoogleGeocodeResult({
        formatted_address: "Jl. Melati, Kalitimbang, Cibeber, Kota Cilegon",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [
            { long_name: "Jl. Melati", types: ["route"] },
            { long_name: "Kalitimbang", types: ["sublocality_level_1"] },
            { long_name: "Cibeber", types: ["administrative_area_level_3"] },
            { long_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
            { long_name: "Banten", types: ["administrative_area_level_1"] },
        ],
    });
    assert.equal(withoutLevel4.village, "Kalitimbang");
    assert.equal(withoutLevel4.district, "Cibeber");

    // (c) Only a `neighborhood` level: the finest village-level hint Google gives.
    const neighbourhoodOnly = normalizeGoogleGeocodeResult({
        formatted_address: "Kalitimbang, Cibeber, Kota Cilegon",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [
            { long_name: "Kalitimbang", types: ["neighborhood"] },
            { long_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
            { long_name: "Banten", types: ["administrative_area_level_1"] },
        ],
    });
    assert.equal(neighbourhoodOnly.village, "Kalitimbang");
    assert.equal(neighbourhoodOnly.city, "Kota Cilegon");

    // (d) Only level_3: a kecamatan stays a kecamatan, it is never promoted to a kelurahan.
    const districtOnly = normalizeGoogleGeocodeResult({
        formatted_address: "Cibeber, Kota Cilegon",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [
            { long_name: "Cibeber", types: ["administrative_area_level_3"] },
            { long_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
        ],
    });
    assert.equal(districtOnly.district, "Cibeber");
    assert.equal(districtOnly.village, null);

    // (e) A `premise` is a house-number class answer, never a street name.
    const premise = normalizeGoogleGeocodeResult({
        formatted_address: "AFA Store, Kota Cilegon",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [
            { long_name: "AFA Store", types: ["premise"] },
            { long_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
        ],
    });
    assert.equal(premise.houseNumber, "AFA Store");
    assert.equal(premise.road, null);

    // (f) Numbered sublocalities (Google reports different depths per region): the finer
    // sublocality is the kelurahan while sublocality_level_1 stays the kecamatan.
    const numberedSublocalities = normalizeGoogleGeocodeResult({
        formatted_address: "Kalitimbang, Cibeber, Kota Cilegon",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [
            { long_name: "Kalitimbang", types: ["sublocality_level_2"] },
            { long_name: "Cibeber", types: ["sublocality_level_1"] },
            { long_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
            { long_name: "Banten", types: ["administrative_area_level_1"] },
        ],
    });
    assert.equal(numberedSublocalities.village, "Kalitimbang");
    assert.equal(numberedSublocalities.district, "Cibeber");

    // (g) A numbered sublocality on its own is still captured (nothing is dropped).
    const deepestOnly = normalizeGoogleGeocodeResult({
        formatted_address: "Kalitimbang, Kota Cilegon",
        geometry: { location: { lat: -6.0021, lng: 106.012345678 } },
        address_components: [
            { long_name: "Kalitimbang", types: ["sublocality_level_4"] },
            { long_name: "Kota Cilegon", types: ["administrative_area_level_2"] },
        ],
    });
    assert.equal(deepestOnly.village, "Kalitimbang");
});

test("the address service failing is never reported as an unrecognizable location", () => {
    // The Maps JS Geocoder rejects with the raw status string.
    assert.equal(classifyGoogleGeocodeFailure("ZERO_RESULTS"), "no_address");
    assert.equal(classifyGoogleGeocodeFailure("NOT_FOUND"), "no_address");
    assert.equal(classifyGoogleGeocodeFailure("OVER_QUERY_LIMIT"), "unavailable");
    assert.equal(classifyGoogleGeocodeFailure("OVER_DAILY_LIMIT"), "unavailable");
    assert.equal(classifyGoogleGeocodeFailure("REQUEST_DENIED"), "unavailable");
    assert.equal(classifyGoogleGeocodeFailure("UNKNOWN_ERROR"), "unavailable");
    assert.equal(classifyGoogleGeocodeFailure(new Error("Geocoder failed due to: ZERO_RESULTS")), "no_address");
    assert.equal(classifyGoogleGeocodeFailure(new Error("Failed to fetch")), "unavailable");
    assert.equal(
        classifyGoogleGeocodeFailure(new GoogleMapsLoadError("LOAD_FAILED", GOOGLE_MAPS_LOAD_FAILED_MESSAGE)),
        "unavailable",
    );
    assert.equal(classifyGoogleGeocodeFailure(undefined), "unavailable");

    // The picker keeps the two apart, and only the real "no address here" case is red.
    // The classification is kept, but it is only REPORTED once the free fallback has also returned
    // nothing: a Google outage must never end the flow while a named location is still obtainable.
    assert.match(checkoutPage, /const failure = classifyGoogleGeocodeFailure\(error\);/);
    assert.match(
        checkoutPage,
        /if \(await reverseFallbackAndFill\(requestedPin, requestId\)\) return;\s*\n\s*setReverseState\("error"\);\s*\n\s*setReverseFailure\(failure\);/,
    );
    assert.match(checkoutPage, /reverseFailure === "no_address" \? REVERSE_NO_ADDRESS_MESSAGE : REVERSE_UNAVAILABLE_MESSAGE/);
    assert.match(checkoutPage, /"mt-2 rounded-xl bg-\[#FFF2D6\] p-3 text-center text-sm text-\[#8B6B3F\]"/);
    // The temporary-failure copy asks for the Biteship area instead of blaming the point.
    assert.match(checkoutPage, /Layanan alamat Google sedang tidak dapat dihubungi\./);
    // No upstream status text is EVER shown to the customer.
    assert.doesNotMatch(checkoutPage, /ZERO_RESULTS|OVER_QUERY_LIMIT|REQUEST_DENIED/);
});

test("Google address success and the Biteship area match are two separate successes", () => {
    // The address is committed and marked done BEFORE the area match even starts.
    const doneIndex = checkoutPage.indexOf('setReverseState("done")');
    const callIndex = checkoutPage.indexOf("void matchArea({", doneIndex);
    assert.ok(doneIndex > -1 && callIndex > doneIndex);
    // ...and the area match itself may only ever change the AREA state, never the address state.
    const matchFnIndex = checkoutPage.indexOf("const matchArea = async (address: AreaAddressInput) => {");
    const matchBody = checkoutPage.slice(matchFnIndex, checkoutPage.indexOf("const handleCenterChange", matchFnIndex));
    assert.ok(matchFnIndex > -1 && matchBody.length > 0);
    assert.doesNotMatch(matchBody, /setReverseState/);
    // Google found the address, Biteship has no area yet → ask for the area, never error.
    assert.match(checkoutPage, /AREA_FALLBACK_TITLE_AFTER_ADDRESS/);
    assert.match(checkoutPage, /Alamat ditemukan\. Pilih kecamatan\/kelurahan pengiriman untuk melanjutkan pengecekan ongkir\./);
    assert.match(checkoutPage, /reverseState === "done" \? AREA_FALLBACK_TITLE_AFTER_ADDRESS : AREA_FALLBACK_TITLE/);
    // The recognized address is shown as a success, and the area as its own success.
    assert.match(checkoutPage, /ADDRESS_FOUND_LABEL/);
    assert.match(checkoutPage, /reverseState === "done" && destinationAddress\?\.displayName/);
    assert.match(checkoutPage, /Area pengiriman tersedia/);
    // A Google failure is only reported while no official area has resolved yet.
    assert.match(checkoutPage, /reverseState === "error" && areaState !== "matched"/);
    // The manual kecamatan/kelurahan picker stays the fallback in both cases.
    assert.match(checkoutPage, /areaState === "not_found" && \(/);
    assert.match(checkoutPage, /AreaAutocomplete/);
});

test("a stale reverse-geocode response can never overwrite the newest confirmed pin", () => {
    const older = { latitude: -6.0021, longitude: 106.012345678 };
    const newer = { latitude: -6.917464, longitude: 107.619123 };
    // A response that belongs to an OLD pin arriving after a new confirmation is dropped...
    assert.equal(isStalePin(older, newer), true);
    assert.equal(isStalePin(newer, newer), false);
    // ...and so is any response whose request was already superseded (same pin, newer attempt).
    assert.equal(isStaleResponse(4, 3), true);
    assert.equal(isStaleResponse(4, 4), false);
    // The page applies BOTH guards (request sequence + confirmed pin) before writing anything.
    assert.match(
        checkoutPage,
        /if \(isStaleResponse\(reverseRef\.current, requestId\) \|\| isStalePin\(requestedPin, confirmedPinRef\.current\)\) return;/,
    );
    // The full-precision confirmed pin is the source of truth for the request.
    assert.match(checkoutPage, /const requestedPin = \{ latitude: coords\.latitude, longitude: coords\.longitude \};/);
    assert.match(checkoutPage, /confirmedPinRef\.current = draftLocation;/);
    assert.match(checkoutPage, /void reverseGeocodeAndFill\(draftLocation\);/);
    // Dragging/searching/GPS only move the DRAFT, so no Google request is spent on a moving pin:
    // exactly ONE reverse-geocode call site exists, and the map never geocodes at all.
    assert.equal(code(checkoutPage).split("await reverseGeocodeWithGoogle(").length - 1, 1);
    assert.doesNotMatch(code(locationMap), /reverseGeocode|Geocoder/);
    assert.match(checkoutPage, /const handleCenterChange = \(coords: DeliveryCoordinates\) => \{\s*\n\s*setDraftLocation\(coords\);\s*\n\s*\};/);
});


// ===== gestures: one-finger scroll + pinch on mobile, wheel zoom on desktop =====

test("the gesture policy is cooperative on touch and greedy with a mouse", () => {
    assert.equal(COARSE_POINTER_QUERY, "(pointer: coarse)");
    // Coarse pointer (phone/tablet): one finger scrolls the page/modal, two fingers zoom.
    assert.equal(resolveGestureHandling(true), "cooperative");
    assert.equal(prefersCoarsePointer({ matchMedia: () => ({ matches: true }) }), true);
    assert.equal(preferredGestureHandling({ matchMedia: () => ({ matches: true }) }), "cooperative");
    // Fine pointer (mouse/trackpad): the wheel zooms the map under the cursor.
    assert.equal(resolveGestureHandling(false), "greedy");
    assert.equal(prefersCoarsePointer({ matchMedia: () => ({ matches: false }) }), false);
    assert.equal(preferredGestureHandling({ matchMedia: () => ({ matches: false }) }), "greedy");
    // Unknown device: the SAFE policy. A locked page is worse than a two-finger hint.
    assert.equal(resolveGestureHandling(null), "cooperative");
    assert.equal(resolveGestureHandling(undefined), "cooperative");
    assert.equal(preferredGestureHandling(null), "cooperative");
    assert.equal(prefersCoarsePointer(null), null);
    assert.equal(prefersCoarsePointer({}), null);
    assert.equal(prefersCoarsePointer({ matchMedia: () => null }), null);
    assert.equal(preferredGestureHandling({ matchMedia: () => null }), "cooperative");
    // The pointer media query decides — NOT the window width — so a narrow desktop window still
    // gets wheel zoom and a large tablet still scrolls with one finger.
    assert.equal(code(mapGestureLib).includes("innerWidth"), false);
});

test("the map applies the policy and keeps it in sync with the device", () => {
    assert.match(locationMap, /gestureHandling: mapGestureHandling\(\)/);
    assert.match(locationMap, /window\.matchMedia\(COARSE_POINTER_QUERY\)/);
    // A live map is reconfigured on a media change / rotation instead of being rebuilt.
    assert.match(locationMap, /map\.setOptions\(\{ gestureHandling: mapGestureHandling\(\) \}\)/);
    assert.match(locationMap, /query\.addEventListener\?\.\("change", apply\)/);
    assert.match(locationMap, /query\.removeEventListener\?\.\("change", apply\)/);
    assert.match(locationMap, /window\.addEventListener\("orientationchange", apply\)/);
    // The policy is never a hardcoded constant in the component.
    assert.doesNotMatch(code(locationMap), /gestureHandling: "(?:greedy|cooperative)"/);
    // Both device classes keep the checkout's own +/- buttons.
    assert.match(locationMap, /aria-label="Perbesar peta"/);
    assert.match(locationMap, /aria-label="Perkecil peta"/);
});

test("mobile keeps the picker scrollable and never hijacks page gestures", () => {
    // The picker body scrolls with one finger; the CTA stays outside the scroll area.
    assert.match(checkoutPage, /overflow-y-auto overscroll-contain/);
    assert.match(checkoutPage, /sm:h-auto sm:min-h-0 sm:flex-1/);
    // The map keeps its own comfortable height on a phone.
    assert.match(checkoutPage, /h-\[44dvh\] min-h-\[240px\]/);
    const guarded = [code(checkoutPage), code(locationMap), code(locationSearch), code(mapGestureLib)].join("\n");
    assert.doesNotMatch(guarded, /touch-action|touchAction/);
    // No touch/wheel listener is ever hijacked anywhere in the picker path.
    assert.doesNotMatch(guarded, /addEventListener\(\s*["'](?:touchmove|touchstart|wheel|mousewheel)/);
    assert.doesNotMatch(guarded, /onTouchMove|onWheel/);
    // The ONLY preventDefault in checkout is the form's own submit handler — never a gesture.
    const withoutSubmit = code(checkoutPage).replace(
        /const submit = async \(event: React\.FormEvent\) => \{\s*\n\s*event\.preventDefault\(\);/,
        "",
    );
    assert.doesNotMatch(withoutSubmit, /preventDefault/);
    assert.doesNotMatch([code(locationMap), code(locationSearch), code(mapGestureLib)].join("\n"), /preventDefault/);
});

test("no Google API key is hardcoded, logged, or embedded in the picker", () => {
    for (const source of [checkoutPage, locationMap, locationSearch, geocodingLib, loaderLib, mapGestureLib]) {
        assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{10,}/);
        assert.doesNotMatch(source, /(?:api[_ -]?key|apikey)\s*[:=]\s*["'`][^"'`]{6,}["'`]/i);
    }
    // The geocoder is constructed by the loader: the page never sees or passes a key.
    assert.match(checkoutPage, /const geocoder = await loadGoogleMapsGeocoder\(\);/);
    assert.doesNotMatch(code(checkoutPage), /apiKey|api_key|maps\.googleapis\.com/);
    // Nothing in the picker path logs at all...
    assert.doesNotMatch(
        [code(locationMap), code(locationSearch), code(geocodingLib), code(loaderLib), code(mapGestureLib)].join("\n"),
        /console\./,
    );
    // ...and the page's single log call is the dev-only area diagnostic, which carries no key.
    const pageLogs = code(checkoutPage).split(/\r?\n/).filter((line) => line.includes("console."));
    assert.equal(pageLogs.length, 1);
    assert.match(pageLogs[0], /console\.info\("\[checkout\] area-match", snapshot\);/);
    assert.match(checkoutPage, /if \(process\.env\.NODE_ENV === "production"\) return;/);
});

test("the Geocoder class is awaited with its own library instead of read off the loaded API", async () => {
    assert.equal(GOOGLE_MAPS_GEOCODING_LIBRARY, "geocoding");
    assert.match(loaderLib, /export async function loadGoogleMapsGeocoder\(/);
    assert.match(loaderLib, /importLibrary\(GOOGLE_MAPS_GEOCODING_LIBRARY\)/);

    // The class may attach AFTER the API is usable (exactly like the places widget): the loader
    // waits through `importLibrary("geocoding")` instead of returning a broken handle.
    const late = fakeLoaderEnvironment({
        maps: {
            Map: function Map() {},
            importLibrary: async (library) =>
                library === "geocoding" ? { Geocoder: class LateGeocoder { async geocode() { return { results: [] }; } } } : {},
        },
    });
    const geocoder = await loadGoogleMapsGeocoder(late);
    assert.equal(typeof geocoder.maps.Geocoder, "function");
    // The handle really works with the checkout's reverse geocode — and an empty answer still
    // resolves to null instead of inventing an address.
    assert.equal(await reverseGeocodeWithGoogle({ latitude: -6.0021, longitude: 106.012345678 }, geocoder), null);

    // An already attached class is used straight away, with no importLibrary round trip.
    let imported = 0;
    const attached = fakeLoaderEnvironment({
        maps: {
            Map: function Map() {},
            Geocoder: class Geocoder {},
            importLibrary: async () => {
                imported += 1;
                return {};
            },
        },
    });
    assert.equal(typeof (await loadGoogleMapsGeocoder(attached)).maps.Geocoder, "function");
    assert.equal(imported, 0);

    // A class that never arrives becomes a typed, retryable LOAD_FAILED — never a silent null
    // that the UI could only report as "alamat tidak dikenali".
    const missing = fakeLoaderEnvironment({ maps: { Map: function Map() {} } });
    await assert.rejects(
        () => loadGoogleMapsGeocoder(missing),
        (error) => error.code === "LOAD_FAILED" && error.message === GOOGLE_MAPS_LOAD_FAILED_MESSAGE,
    );
    // The customer-facing failure copy carries no key and no upstream detail.
    assert.doesNotMatch(GOOGLE_MAPS_LOAD_FAILED_MESSAGE, /key|AIza|http/i);
});

test("a callback firing after the attempt settled is ignored instead of throwing", async () => {
    // The callback NAME is baked into the bootstrap URL, so Google can still call it after the
    // attempt is over: a bootstrap that stayed slow, a retry, or a second copy of the script.
    // `delete`-ing the global turned that late call into `TypeError: afaGoogleMapsReady is not a
    // function`, thrown from Google's own script — outside every `catch` this app owns. It must stay
    // CALLABLE for the rest of the page session, as one shared no-op.
    assert.doesNotMatch(loaderLib, /delete global\[GOOGLE_MAPS_CALLBACK\]/);
    assert.match(
        loaderLib,
        /if \(global\[GOOGLE_MAPS_CALLBACK\] === handleReady\) global\[GOOGLE_MAPS_CALLBACK\] = ignoreLateGoogleMapsCallback;/,
    );
    assert.equal(ignoreLateGoogleMapsCallback(), undefined);

    // The name is installed BEFORE the tag is appended, and stays callable after the attempt resolves.
    const settled = fakeLoaderEnvironment({});
    const load = injectGoogleMapsScript("TEST-KEY-123", settled);
    assert.equal(typeof settled.global[GOOGLE_MAPS_CALLBACK], "function");
    // The bootstrap attaches its classes, then fires the callback it was handed.
    settled.global.google.maps = { Map: function Map() {} };
    settled.global[GOOGLE_MAPS_CALLBACK]();
    await load;
    assert.equal(settled.global[GOOGLE_MAPS_CALLBACK], ignoreLateGoogleMapsCallback);
    assert.doesNotThrow(() => settled.global[GOOGLE_MAPS_CALLBACK]());
    assert.doesNotThrow(() => settled.global[GOOGLE_MAPS_CALLBACK]());

    // A FAILED attempt leaves it callable too: a bootstrap landing after the deadline is ignored
    // instead of throwing at the customer.
    const timedOut = { ...fakeLoaderEnvironment({}), timeoutMs: 20 };
    await assert.rejects(
        () => injectGoogleMapsScript("TEST-KEY-123", timedOut),
        (error) => error.code === "LOAD_FAILED" && error.message === GOOGLE_MAPS_LOAD_FAILED_MESSAGE,
    );
    assert.equal(timedOut.global[GOOGLE_MAPS_CALLBACK], ignoreLateGoogleMapsCallback);
    assert.doesNotThrow(() => timedOut.global[GOOGLE_MAPS_CALLBACK]());

    // A newer attempt's live handler is never clobbered by an older attempt settling late.
    const shared = fakeLoaderEnvironment({});
    const first = injectGoogleMapsScript("TEST-KEY-123", shared);
    const firstHandler = shared.global[GOOGLE_MAPS_CALLBACK];
    const second = injectGoogleMapsScript("TEST-KEY-123", shared);
    const secondHandler = shared.global[GOOGLE_MAPS_CALLBACK];
    assert.equal(typeof firstHandler, "function");
    assert.notEqual(firstHandler, secondHandler, "each attempt installs its own handler");

    shared.global.google.maps = { Map: function Map() {} };
    firstHandler();
    await first;
    assert.equal(shared.global[GOOGLE_MAPS_CALLBACK], secondHandler, "the newer attempt keeps its handler");

    secondHandler();
    await second;
    assert.equal(shared.global[GOOGLE_MAPS_CALLBACK], ignoreLateGoogleMapsCallback);
    assert.doesNotThrow(() => shared.global[GOOGLE_MAPS_CALLBACK]());
});
