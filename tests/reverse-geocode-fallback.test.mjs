/*
 * Spec for the FREE, server-side reverse-geocode fallback used by the checkout address flow.
 *
 * Architecture rules asserted here:
 *   - the browser calls OUR OWN same-origin route, never the provider,
 *   - exactly ONE bounded attempt per confirmed location (never per pan / zoom / drag),
 *   - the provider's raw payload never leaves the server module,
 *   - Biteship stays authoritative: no fallback output ever becomes a `destinationAreaId`,
 *   - a total reverse failure keeps the pin and always opens the manual Kecamatan/Kelurahan flow.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    REVERSE_FALLBACK_ACCEPT_LANGUAGE,
    REVERSE_FALLBACK_CACHE_MAX_ENTRIES,
    REVERSE_FALLBACK_CACHE_TTL_MS,
    REVERSE_FALLBACK_ENDPOINT,
    REVERSE_FALLBACK_MAX_RESPONSE_CHARS,
    REVERSE_FALLBACK_ROUTE,
    REVERSE_FALLBACK_ROUTE_TIMEOUT_MS,
    REVERSE_FALLBACK_TIMEOUT_MS,
    REVERSE_FALLBACK_USER_AGENT,
    buildFallbackReverseUrl,
    clearFallbackReverseCache,
    fallbackAddressToSearchResult,
    fallbackResultFromRoutePayload,
    fallbackReverseCacheSize,
    normalizeFallbackCoordinates,
    normalizeFallbackReversePayload,
    requestFallbackReverseAddress,
    resolveFallbackReverseAddress,
} from "../src/lib/reverse-geocode-fallback.ts";
import { isStalePin, isStaleResponse } from "../src/lib/checkout-address.ts";

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
const fallbackLib = read("../src/lib/reverse-geocode-fallback.ts");
const routeFile = read("../src/app/api/location/reverse-fallback/route.ts");

/** One pin inside Cilegon, in the provider's own `jsonv2` + `addressdetails` shape. */
const PROVIDER_PAYLOAD = {
    place_id: 123456,
    licence: "ODbL",
    osm_type: "way",
    osm_id: 987654,
    lat: "-6.0021000",
    lon: "106.0123456",
    display_name: "10, Jalan Melati, Kalitimbang, Cibeber, Kota Cilegon, Banten, 42426, Indonesia",
    address: {
        house_number: "10",
        road: "Jalan Melati",
        village: "Kalitimbang",
        city_district: "Cibeber",
        city: "Kota Cilegon",
        state: "Banten",
        postcode: "42426",
        country: "Indonesia",
        country_code: "id",
    },
};

/** Minimal stand-in for a `fetch` Response: only what the module reads. */
const bodyResponse = (body, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    async text() {
        return typeof body === "string" ? body : JSON.stringify(body);
    },
});

/*
 * The EXACT production payload captured from
 * `GET /api/location/reverse-fallback?lat=-6.8108478410000926&lng=107.12745051408709`
 * (HTTP 200, `cached: true` on a warm server cache). Every structured component is null except
 * city/province/postalCode, and the provider's own coordinates differ slightly from the pin the
 * customer confirmed. This response MUST count as a successful DISPLAY ADDRESS: a non-empty
 * formattedAddress is sufficient, and the provider's nearby coordinates must never become the
 * delivery pin.
 */
const PRODUCTION_PIN = { latitude: -6.8108478410000926, longitude: 107.12745051408709 };
const PRODUCTION_FORMATTED_ADDRESS = "Cianjur, Jawa Barat, 43211, Indonesia";
const PRODUCTION_ROUTE_PAYLOAD = {
    status: "ok",
    cached: true,
    address: {
        formattedAddress: PRODUCTION_FORMATTED_ADDRESS,
        latitude: -6.8109697,
        longitude: 107.1273855,
        street: null,
        houseNumber: null,
        village: null,
        district: null,
        city: "Cianjur",
        province: "Jawa Barat",
        postalCode: "43211",
        country: "Indonesia",
    },
};

/** A fetch that records every call, so the request count itself can be asserted. */
function recordingFetch(handler) {
    const calls = [];
    return {
        calls,
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init });
            return handler(String(url), init, calls.length);
        },
    };
}

test("only a finite, in-range pin is ever sent to the fallback", () => {
    // Full float precision is preserved: the confirmed pin is never rounded.
    assert.deepEqual(normalizeFallbackCoordinates(-6.0021, 106.012345678), {
        latitude: -6.0021,
        longitude: 106.012345678,
    });
    // Query parameters arrive as strings and are still understood.
    assert.deepEqual(normalizeFallbackCoordinates("-6.0021", "106.012345678"), {
        latitude: -6.0021,
        longitude: 106.012345678,
    });
    // 0 is a real coordinate, not "missing".
    assert.deepEqual(normalizeFallbackCoordinates(0, 0), { latitude: 0, longitude: 0 });

    for (const [lat, lng] of [
        [undefined, 106],
        [null, 106],
        ["", 106],
        ["abc", 106],
        [Number.NaN, 106],
        [Number.POSITIVE_INFINITY, 106],
        [91, 106],
        [-91, 106],
        [-6.0021, 181],
        [-6.0021, -181],
        [-6.0021, "abc"],
    ]) {
        assert.equal(normalizeFallbackCoordinates(lat, lng), null, `${lat} / ${lng} must be rejected`);
    }
});

test("the provider request carries the pin and the structured-answer options, nothing else", () => {
    const url = new URL(buildFallbackReverseUrl({ latitude: -6.0021, longitude: 106.012345678 }));
    assert.equal(url.origin, "https://nominatim.openstreetmap.org");
    assert.equal(url.pathname, "/reverse");
    assert.equal(url.searchParams.get("format"), "jsonv2");
    assert.equal(url.searchParams.get("addressdetails"), "1");
    assert.equal(url.searchParams.get("lat"), "-6.0021");
    assert.equal(url.searchParams.get("lon"), "106.012345678");
    // Nothing but the pin: no name, no phone, no email, no cart, no order, no key.
    assert.equal([...url.searchParams.keys()].length, 4);
});

test("a provider payload becomes our own provider-neutral address", () => {
    const address = normalizeFallbackReversePayload(PROVIDER_PAYLOAD, { latitude: -6.0021, longitude: 106.0123456 });
    assert.ok(address);
    assert.equal(address.formattedAddress, PROVIDER_PAYLOAD.display_name);
    assert.equal(address.street, "Jalan Melati");
    assert.equal(address.houseNumber, "10");
    assert.equal(address.village, "Kalitimbang");
    assert.equal(address.district, "Cibeber");
    assert.equal(address.city, "Kota Cilegon");
    assert.equal(address.province, "Banten");
    assert.equal(address.postalCode, "42426");
    assert.equal(address.country, "Indonesia");
    assert.equal(address.latitude, -6.0021);
    assert.equal(address.longitude, 106.0123456);

    // The provider's raw keys never survive into our shape.
    for (const raw of ["display_name", "house_number", "city_district", "country_code", "osm_id", "licence", "place_id"]) {
        assert.equal(raw in address, false, `${raw} must not leak`);
    }

    // Missing fields stay null, and the label is joined from what IS there (never "null").
    const sparse = normalizeFallbackReversePayload(
        { address: { road: "Jalan Melati", city: "Kota Cilegon", postcode: "42426" } },
        { latitude: -6.1, longitude: 106.1 },
    );
    assert.ok(sparse);
    assert.equal(sparse.village, null);
    assert.equal(sparse.district, null);
    assert.equal(sparse.formattedAddress, "Jalan Melati, Kota Cilegon, 42426");
    // The pin falls back to the REQUESTED one, so a payload without coordinates is still honest.
    assert.equal(sparse.latitude, -6.1);
    assert.equal(sparse.longitude, 106.1);

    // Nothing usable, an explicit provider error, and junk are all null — never an invented address.
    assert.equal(normalizeFallbackReversePayload({}, { latitude: -6.1, longitude: 106.1 }), null);
    assert.equal(normalizeFallbackReversePayload({ error: "Unable to geocode" }), null);
    assert.equal(normalizeFallbackReversePayload(null), null);
    assert.equal(normalizeFallbackReversePayload("nope"), null);
    assert.equal(normalizeFallbackReversePayload([1, 2, 3]), null);
    assert.equal(
        normalizeFallbackReversePayload({ display_name: "Somewhere" }),
        null,
        "a label without coordinates must not invent a pin",
    );
});

test("one provider key is never read as two Indonesian levels", () => {
    // `city_district` is the KECAMATAN and `county` the KOTA: each level reads its own keys, so one
    // name can never look like two independent agreements to the Biteship matcher.
    const districtOnly = normalizeFallbackReversePayload(
        { display_name: "Cibeber, Kota Cilegon", address: { city_district: "Cibeber" } },
        { latitude: -6.0021, longitude: 106.0123456 },
    );
    assert.equal(districtOnly.district, "Cibeber");
    assert.equal(districtOnly.city, null);

    const countyOnly = normalizeFallbackReversePayload(
        { display_name: "Kota Cilegon", address: { county: "Kota Cilegon" } },
        { latitude: -6.0021, longitude: 106.0123456 },
    );
    assert.equal(countyOnly.city, "Kota Cilegon");
    assert.equal(countyOnly.district, null);
});

test("our own address shape is what the checkout matcher receives", () => {
    const address = normalizeFallbackReversePayload(PROVIDER_PAYLOAD, { latitude: -6.0021, longitude: 106.0123456 });
    const result = fallbackAddressToSearchResult(address);
    assert.equal(result.displayName, PROVIDER_PAYLOAD.display_name);
    assert.equal(result.latitude, -6.0021);
    assert.equal(result.longitude, 106.0123456);
    assert.deepEqual(result.address, {
        road: "Jalan Melati",
        houseNumber: "10",
        village: "Kalitimbang",
        district: "Cibeber",
        city: "Kota Cilegon",
        province: "Banten",
        postcode: "42426",
    });
    // It is structure-compatible with `LocationSearchResult` — no `regency`, nothing invented.
    assert.equal("regency" in result.address, false);
    // Biteship stays authoritative: the fallback can never produce an area id.
    assert.equal(JSON.stringify(result).includes("destinationAreaId"), false);
});

test("the provider is called once per confirmation, with the identifying headers and a deadline", async () => {
    clearFallbackReverseCache();
    const recorder = recordingFetch(() => bodyResponse(PROVIDER_PAYLOAD));
    const result = await resolveFallbackReverseAddress(-6.0021, 106.0123456, {
        fetchImpl: recorder.fetchImpl,
        timeoutMs: 50,
    });

    assert.equal(result.status, "ok");
    assert.equal(result.cached, false);
    assert.equal(recorder.calls.length, 1, "exactly one provider call per confirmation");

    const [{ url, init }] = recorder.calls;
    assert.equal(url, `${REVERSE_FALLBACK_ENDPOINT}?format=jsonv2&addressdetails=1&lat=-6.0021&lon=106.0123456`);
    assert.equal(init.method, "GET");
    // The provider's usage policy: an identifying User-Agent, a language, and no server-side cache.
    assert.equal(init.headers["User-Agent"], REVERSE_FALLBACK_USER_AGENT);
    assert.match(REVERSE_FALLBACK_USER_AGENT, /^AFA-STORE-checkout\/\d/);
    assert.doesNotMatch(REVERSE_FALLBACK_USER_AGENT, /Mozilla|curl|python|okhttp/i);
    assert.equal(init.headers["Accept-Language"], REVERSE_FALLBACK_ACCEPT_LANGUAGE);
    assert.equal(init.cache, "no-store");
    // A deadline exists, so a hanging provider can never hold the customer's confirmation open.
    assert.ok(init.signal instanceof AbortSignal);
    // No customer data, no credential: the pin is everything that leaves the server.
    assert.equal(/\b(name|phone|email|order|cart|token|key|apikey)\b/i.test(url), false);
    clearFallbackReverseCache();
});

test("every provider failure mode answers `unavailable`, and a provider error is `no_address`", async () => {
    const cases = [
        ["a non-2xx status", () => bodyResponse("rate limited", { ok: false, status: 429 })],
        ["an HTML error page", () => bodyResponse("<html><body>502</body></html>")],
        ["an empty body", () => bodyResponse("")],
        ["an oversized body", () => bodyResponse("x".repeat(REVERSE_FALLBACK_MAX_RESPONSE_CHARS + 1))],
        ["a payload with nothing usable", () => bodyResponse({ place_id: 1 })],
        [
            "a socket error",
            () => {
                throw new Error("ECONNRESET");
            },
        ],
    ];

    for (const [label, handler] of cases) {
        clearFallbackReverseCache();
        const recorder = recordingFetch(handler);
        const result = await resolveFallbackReverseAddress(-6.11, 106.11, { fetchImpl: recorder.fetchImpl });
        assert.equal(result.status, "unavailable", `${label} must be unavailable`);
        assert.equal(recorder.calls.length, 1, `${label} must still be one single attempt`);
    }

    // The provider explicitly saying "no address here" is an honest no_address, not an outage.
    clearFallbackReverseCache();
    const explicit = await resolveFallbackReverseAddress(-6.12, 106.12, {
        fetchImpl: async () => bodyResponse({ error: "Unable to geocode" }),
    });
    assert.deepEqual(explicit, { status: "no_address" });
    clearFallbackReverseCache();
});

test("a repeated confirmation is free, but a transient failure is never remembered", async () => {
    // `now` is injected, so the TTL is asserted instead of waited on.
    let clock = 1_000_000;
    clearFallbackReverseCache();
    const recorder = recordingFetch(() => bodyResponse(PROVIDER_PAYLOAD));
    const dependencies = { fetchImpl: recorder.fetchImpl, now: () => clock };

    const first = await resolveFallbackReverseAddress(-6.0021, 106.0123456, dependencies);
    const second = await resolveFallbackReverseAddress(-6.0021, 106.0123456, dependencies);
    assert.equal(first.status, "ok");
    assert.equal(first.cached, false);
    assert.equal(second.status, "ok");
    assert.equal(second.cached, true, "the second confirmation is served from the short cache");
    assert.equal(recorder.calls.length, 1);
    assert.equal(fallbackReverseCacheSize(), 1);

    // Tiny jitter around the same pin is the same pin (rounded cache key), still no second call.
    const jittered = await resolveFallbackReverseAddress(-6.002100001, 106.0123456, dependencies);
    assert.equal(jittered.status, "ok");
    assert.equal(recorder.calls.length, 1);

    // After the TTL the next confirmation may call again — the cache is a short circuit, not a store.
    clock += REVERSE_FALLBACK_CACHE_TTL_MS + 1;
    await resolveFallbackReverseAddress(-6.0021, 106.0123456, dependencies);
    assert.equal(recorder.calls.length, 2);

    // An outage is NEVER cached: the next confirmation must be allowed to succeed.
    clearFallbackReverseCache();
    const flaky = recordingFetch(() => bodyResponse("nope", { ok: false, status: 500 }));
    const unavailableDeps = { fetchImpl: flaky.fetchImpl };
    assert.equal((await resolveFallbackReverseAddress(-6.2, 106.2, unavailableDeps)).status, "unavailable");
    assert.equal((await resolveFallbackReverseAddress(-6.2, 106.2, unavailableDeps)).status, "unavailable");
    assert.equal(flaky.calls.length, 2, "an unavailable answer must retry on the next confirmation");
    assert.equal(fallbackReverseCacheSize(), 0);

    // The cache is bounded, so walking the map cannot grow the process without limit.
    clearFallbackReverseCache();
    const walk = { fetchImpl: async () => bodyResponse(PROVIDER_PAYLOAD) };
    for (let step = 0; step <= REVERSE_FALLBACK_CACHE_MAX_ENTRIES; step += 1) {
        await resolveFallbackReverseAddress(-6.5, 106.5 + step * 0.001, walk);
    }
    assert.equal(fallbackReverseCacheSize(), REVERSE_FALLBACK_CACHE_MAX_ENTRIES);
    clearFallbackReverseCache();
});

test("two confirmations of the same pin share one provider call", async () => {
    clearFallbackReverseCache();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    let providerCalls = 0;
    const shared = {
        fetchImpl: async () => {
            providerCalls += 1;
            await gate;
            return bodyResponse(PROVIDER_PAYLOAD);
        },
    };

    const both = Promise.all([
        resolveFallbackReverseAddress(-6.3, 106.3, shared),
        resolveFallbackReverseAddress(-6.3, 106.3, shared),
    ]);
    release();
    const [one, two] = await both;
    assert.equal(providerCalls, 1, "one in-flight attempt is shared, never duplicated");
    assert.equal(one.status, "ok");
    assert.equal(two.status, "ok");
    clearFallbackReverseCache();
});

test("the reader only accepts OUR route contract, never a provider payload", () => {
    const address = {
        formattedAddress: "Jalan Melati, Kalitimbang, Cibeber, Kota Cilegon",
        latitude: -6.0021,
        longitude: 106.0123456,
        street: "Jalan Melati",
        village: "Kalitimbang",
        district: "Cibeber",
        city: "Kota Cilegon",
    };

    assert.deepEqual(fallbackResultFromRoutePayload({ status: "ok", cached: true, address }), {
        status: "ok",
        cached: true,
        address: expectAddress(address),
    });
    assert.deepEqual(fallbackResultFromRoutePayload({ status: "no_address" }), { status: "no_address" });
    assert.deepEqual(fallbackResultFromRoutePayload({ status: "unavailable" }), { status: "unavailable" });
    assert.deepEqual(fallbackResultFromRoutePayload({ message: "Unauthorized" }), { status: "unavailable" });

    // A half-filled address, a mismatched status, or a RAW provider payload are all unusable.
    assert.deepEqual(fallbackResultFromRoutePayload({ status: "ok", address: { district: "Cibeber" } }), {
        status: "unavailable",
    });
    assert.deepEqual(
        fallbackResultFromRoutePayload({ status: "ok", address: { display_name: "Somewhere", lat: "-6.0", lon: "106.0" } }),
        { status: "unavailable" },
    );
    assert.deepEqual(fallbackResultFromRoutePayload(null), { status: "unavailable" });
    assert.deepEqual(fallbackResultFromRoutePayload("ok"), { status: "unavailable" });
});

/** Minimal stand-in for a route `Response` on the browser side (the module reads `json()`). */
const jsonResponse = (payload, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    async json() {
        return payload;
    },
    async text() {
        return JSON.stringify(payload);
    },
});

const ROUTE_ADDRESS = {
    formattedAddress: "10, Jalan Melati, Kalitimbang, Cibeber, Kota Cilegon, Banten, 42426, Indonesia",
    latitude: -6.0021,
    longitude: 106.0123456,
    street: "Jalan Melati",
    houseNumber: "10",
    village: "Kalitimbang",
    district: "Cibeber",
    city: "Kota Cilegon",
    province: "Banten",
    postalCode: "42426",
    country: "Indonesia",
};

test("the browser asks OUR own route, and never the provider", async () => {
    const calls = [];
    const result = await requestFallbackReverseAddress(-6.0021, 106.0123456, {
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init });
            return jsonResponse({ status: "ok", cached: false, address: ROUTE_ADDRESS });
        },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.address.district, "Cibeber");
    assert.equal(result.address.village, "Kalitimbang");

    const [{ url, init }] = calls;
    assert.equal(url, "/api/location/reverse-fallback?lat=-6.0021&lng=106.0123456");
    // A same-origin path: the browser can only ever talk to our own server.
    assert.equal(REVERSE_FALLBACK_ROUTE.startsWith("/"), true);
    assert.equal(new URL(url, "https://afa-food.example").origin, "https://afa-food.example");
    assert.doesNotMatch(url, /nominatim|openstreetmap|google|^https?:/i);
    assert.equal(init.method, "GET");
    // No provider identity and no credential ever travels from the browser.
    assert.deepEqual(init.headers, { Accept: "application/json" });
    assert.doesNotMatch(JSON.stringify(init.headers), /user-agent|authorization|api[-_]?key/i);
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);

    // An invalid pin, a rejected route, a broken body and a raw provider payload: all unavailable.
    const untouched = [];
    assert.deepEqual(
        await requestFallbackReverseAddress(Number.NaN, 106, {
            fetchImpl: async (url) => {
                untouched.push(String(url));
                return jsonResponse({ status: "ok", address: ROUTE_ADDRESS });
            },
        }),
        { status: "unavailable" },
    );
    assert.equal(untouched.length, 0, "an invalid pin is never even requested");
    assert.deepEqual(
        await requestFallbackReverseAddress(-6.0021, 106.0123456, {
            fetchImpl: async () => jsonResponse({ message: "Unauthorized" }, { ok: false, status: 401 }),
        }),
        { status: "unavailable" },
    );
    assert.deepEqual(
        await requestFallbackReverseAddress(-6.0021, 106.0123456, {
            fetchImpl: async () => jsonResponse({ status: "ok", address: { display_name: "Somewhere" } }),
        }),
        { status: "unavailable" },
    );
    assert.deepEqual(
        await requestFallbackReverseAddress(-6.0021, 106.0123456, {
            fetchImpl: async () => {
                throw new Error("network down");
            },
        }),
        { status: "unavailable" },
    );
});

test("the fallback route is server-only, authenticated, validated, bounded and uncached", () => {
    const route = code(routeFile);

    // Node runtime (never the edge), and authenticated like every other account-scoped route.
    assert.match(route, /export const runtime = "nodejs";/);
    assert.match(route, /const user = await getCurrentUser\(\);/);
    assert.match(route, /if \(!user\) return NextResponse\.json\(\{ message: "Unauthorized" \}, \{ status: 401 \}\);/);

    // The pin is validated BEFORE the upstream call: a forged request costs no provider quota.
    const validated = route.indexOf('normalizeFallbackCoordinates(url.searchParams.get("lat")');
    const upstream = route.indexOf("resolveFallbackReverseAddress(");
    assert.ok(validated > -1 && upstream > validated, "lat/lng must be validated before any upstream call");
    assert.match(route, /status: "invalid_coordinates"[^}]*\}, \{ status: 400, headers: NO_STORE \}/);

    // Our own contract only: ok / no_address / 503 unavailable / 500 internal — every one no-store.
    assert.match(route, /status: "ok", cached: result\.cached, address: result\.address/);
    assert.match(route, /if \(result\.status === "no_address"\)/);
    assert.match(route, /status: "unavailable"[^}]*\},\s*\{ status: 503, headers: NO_STORE \}/);
    assert.match(route, /status: "unavailable"[^}]*\}, \{ status: 500, headers: NO_STORE \}/);
    assert.equal((route.match(/headers: NO_STORE/g) || []).length, 5, "every exit path is no-store");

    // The route knows NOTHING about the provider: no endpoint, no identifying header, no provider
    // field name — so a raw provider payload can never be forwarded to the browser by accident.
    assert.doesNotMatch(route, /openstreetmap|nominatim|jsonv2|addressdetails|user-agent/i);
    assert.doesNotMatch(route, /display_name|house_number|city_district|formattedAddress/);

    // Development diagnostics only, and they carry the outcome — never the pin, never the payload.
    assert.equal((route.match(/console\./g) || []).length, 2);
    assert.match(
        route,
        /console\.info\("reverse_fallback_query", \{ status: result\.status, cached: result\.status === "ok"\s*\?\s*result\.cached\s*:\s*false \}\)/,
    );
    assert.match(route, /if \(process\.env\.NODE_ENV !== "production"\)/);
});

test("checkout asks Google first and the free fallback exactly once, only for a confirmed pin", () => {
    const google = checkoutPage.indexOf("await reverseGeocodeWithGoogle(");
    const fallback = checkoutPage.indexOf("await reverseFallbackAndFill(");
    const manualPicker = checkoutPage.indexOf('setAreaState("not_found")', fallback);
    assert.ok(google > -1, "Google must still be the first choice");
    assert.ok(fallback > google, "the free fallback is only reached AFTER Google failed");
    assert.ok(manualPicker > fallback, "a total reverse failure still opens the manual picker");

    // ONE bounded attempt per confirmation: the helper is called from the two failure branches of the
    // single confirmation flow — the no-address branch and the service-failure branch — and nowhere
    // else. (Pan, zoom, drag and touch have no path to either the Google geocoder or the fallback.)
    assert.match(checkoutPage, /const reverseFallbackAndFill = async \(pin: DeliveryCoordinates, requestId: number\): Promise<boolean> => \{/);
    assert.equal(
        (code(checkoutPage).match(/await reverseFallbackAndFill\(/g) || []).length,
        2,
        "one call per failure branch, and no other caller",
    );
    const flow = checkoutPage.slice(google, checkoutPage.indexOf("const applyResolvedAddress"));
    assert.equal((flow.match(/await reverseFallbackAndFill\(/g) || []).length, 2);
    assert.equal(
        (code(checkoutPage).match(/requestFallbackReverseAddress\(/g) || []).length,
        1,
        "the fallback route is requested from exactly one place in the page",
    );

    const movement = checkoutPage.slice(
        checkoutPage.indexOf("const handleCenterChange"),
        checkoutPage.indexOf("const confirmLocation"),
    );
    assert.ok(movement.length > 0);
    assert.doesNotMatch(movement, /Fallback|reverseGeocode/i, "moving the map never triggers a lookup");

    // The attempt is bounded and cancellable: a newer confirmation aborts it, and so does unmount.
    assert.match(
        checkoutPage,
        /reverseAbortRef\.current\?\.abort\(\);\s*\n\s*const fallbackController = new AbortController\(\);\s*\n\s*reverseAbortRef\.current = fallbackController;/,
    );
    assert.match(
        checkoutPage,
        /requestFallbackReverseAddress\(pin\.latitude, pin\.longitude, \{\s*\n\s*signal: fallbackController\.signal,/,
    );
    assert.match(checkoutPage, /useEffect\(\(\) => \{\s*\n\s*return \(\) => \{[\s\S]{0,300}?reverseAbortRef\.current\?\.abort\(\);/);

    // The same stale guards protect the fallback: a superseded pin can never be written by it.
    assert.match(
        checkoutPage,
        /if \(isStaleResponse\(reverseRef\.current, requestId\) \|\| isStalePin\(pin, confirmedPinRef\.current\)\) return false;/,
    );
    assert.match(checkoutPage, /if \(fallback\.status !== "ok"\) return false;/);

    // Both sources commit through ONE shared path, which is where the Biteship area match starts.
    assert.match(checkoutPage, /const applyResolvedAddress = \(result: LocationSearchResult \| FallbackSearchResult\) => \{/);
    assert.equal(
        (code(checkoutPage).match(/applyResolvedAddress\(/g) || []).length,
        2,
        "one call per source (Google, free fallback), and no other caller",
    );
});

test("a total reverse failure is reported honestly, keeps the pin, and never invents a shipping area", () => {
    // Google unavailable is a SERVICE problem (amber), not an unrecognizable location (red).
    assert.match(
        checkoutPage,
        /reverseFailure === "no_address"\s*\n\s*\? "mt-2 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700"\s*\n\s*: "mt-2 rounded-xl bg-\[#FFF2D6\] p-3 text-center text-sm text-\[#8B6B3F\]"/,
    );
    assert.match(
        checkoutPage,
        /const REVERSE_UNAVAILABLE_MESSAGE = "Layanan alamat Google sedang tidak dapat dihubungi\. Cadangan alamat otomatis juga belum tersedia\. Coba lagi, atau pilih kecamatan\/kelurahan pengiriman secara manual\.";/,
    );
    assert.match(checkoutPage, /reverseFailure === "no_address" \? REVERSE_NO_ADDRESS_MESSAGE : REVERSE_UNAVAILABLE_MESSAGE/);

    // A failed lookup never moves the pin the customer confirmed.
    for (const line of code(checkoutPage).split("\n")) {
        if (/setReverseState\("error"\)|setAreaState\("not_found"\)|setReverseFailure\(/.test(line)) {
            assert.doesNotMatch(
                line,
                /setConfirmedPin|setLatitude|setLongitude|setMapCenter/,
                `a failure must not move the pin: ${line.trim()}`,
            );
        }
    }

    // Biteship stays the ONLY source of a destinationAreaId / shipping rate.
    assert.doesNotMatch(code(fallbackLib), /destinationAreaId|shipping_rate|rates/i);
    assert.equal(
        (code(checkoutPage).match(/destinationAreaId: destinationArea\.id/g) || []).length,
        2,
        "the rate request and the order payload take their area from the Biteship match",
    );
});

test("the fallback module is import-free and browser-free, so it runs on the server only", () => {
    // Import-free: the exact same file is loaded by Next AND by `node --test` without a loader.
    assert.doesNotMatch(fallbackLib, /^\s*import /m);
    assert.doesNotMatch(fallbackLib, /require\(/);
    // No environment, no secret, no browser global: the shared module cannot leak or read either.
    assert.doesNotMatch(code(fallbackLib), /process\.env|window\.|document\.|localStorage/);
    // The request/response types are all it needs from Next's runtime.
    assert.match(fallbackLib, /export const REVERSE_FALLBACK_ENDPOINT = "https:\/\/nominatim\.openstreetmap\.org\/reverse";/);
});

test("aborting a superseded confirmation cancels the fallback request", async () => {
    const controller = new AbortController();
    const pending = requestFallbackReverseAddress(-6.44, 106.44, {
        signal: controller.signal,
        fetchImpl: (_url, init) =>
            new Promise((_resolve, reject) => {
                init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
            }),
    });

    controller.abort();
    assert.deepEqual(await pending, { status: "unavailable" });
});

/** The expected normalized shape of a route address (absent optional levels become null). */
function expectAddress(address) {
    return {
        formattedAddress: address.formattedAddress,
        latitude: address.latitude,
        longitude: address.longitude,
        street: address.street ?? null,
        houseNumber: address.houseNumber ?? null,
        village: address.village ?? null,
        district: address.district ?? null,
        city: address.city ?? null,
        province: address.province ?? null,
        postalCode: address.postalCode ?? null,
        country: address.country ?? null,
    };
}

/*
 * ==========================================================================
 * Production regression: the captured payload above MUST be committed
 * ==========================================================================
 */

test("the exact production payload is a successful DISPLAY ADDRESS, nulls included", () => {
    // status "ok" plus a non-empty formattedAddress is SUFFICIENT. Nothing here may require a
    // street, a house number, a village, a district or any other administrative component: those
    // are legitimately unavailable for plenty of Indonesian points.
    const parsed = fallbackResultFromRoutePayload(PRODUCTION_ROUTE_PAYLOAD);
    assert.equal(parsed.status, "ok", "a valid formattedAddress is enough to be recognized");
    assert.equal(parsed.cached, true);
    assert.deepEqual(parsed.address, {
        formattedAddress: PRODUCTION_FORMATTED_ADDRESS,
        latitude: -6.8109697,
        longitude: 107.1273855,
        street: null,
        houseNumber: null,
        village: null,
        district: null,
        city: "Cianjur",
        province: "Jawa Barat",
        postalCode: "43211",
        country: "Indonesia",
    });

    // The address the checkout DISPLAYS, and the hints the Biteship matcher receives.
    const searchResult = fallbackAddressToSearchResult(parsed.address);
    assert.equal(searchResult.displayName, PRODUCTION_FORMATTED_ADDRESS);
    assert.deepEqual(searchResult.address, {
        road: null,
        houseNumber: null,
        village: null,
        district: null,
        city: "Cianjur",
        province: "Jawa Barat",
        postcode: "43211",
    });

    // That is committed through the SAME shared path Google uses, which is also the only writer of
    // the success state — so a fallback answer really does end as reverseState "done".
    assert.match(checkoutPage, /applyResolvedAddress\(fallbackAddressToSearchResult\(fallback\.address\)\);/);
    assert.equal(
        (code(checkoutPage).match(/setReverseState\("done"\)/g) || []).length,
        1,
        "the shared commit is the only success writer",
    );
    assert.match(
        checkoutPage,
        /const applyResolvedAddress = \(result: LocationSearchResult \| FallbackSearchResult\) => \{/,
    );
});

test("the browser leg commits the exact production payload, and cached:true is the same success", async () => {
    const viaRoute = async (payload) =>
        requestFallbackReverseAddress(PRODUCTION_PIN.latitude, PRODUCTION_PIN.longitude, {
            fetchImpl: async (url) => {
                assert.equal(
                    String(url),
                    "/api/location/reverse-fallback?lat=-6.8108478410000926&lng=107.12745051408709",
                    "the confirmed pin is asked about with full precision",
                );
                return jsonResponse(payload);
            },
        });

    const warm = await viaRoute(PRODUCTION_ROUTE_PAYLOAD);
    assert.equal(warm.status, "ok");
    assert.equal(warm.cached, true);
    assert.equal(fallbackAddressToSearchResult(warm.address).displayName, PRODUCTION_FORMATTED_ADDRESS);

    // A cold (uncached) answer is byte-for-byte the same success: `cached` is an optimization flag
    // the checkout reports, never a condition for committing the address.
    const cold = await viaRoute({ ...PRODUCTION_ROUTE_PAYLOAD, cached: false });
    assert.equal(cold.status, "ok");
    assert.equal(cold.cached, false);
    assert.equal(fallbackAddressToSearchResult(cold.address).displayName, PRODUCTION_FORMATTED_ADDRESS);
});

test("the browser's route budget outlasts the server's provider deadline", async () => {
    // The route's provider deadline starts only AFTER it authenticated the session and read the
    // customer row, and it ends before the answer travels back. A browser that gave up on the same
    // 4 s therefore abandoned `{ status: "ok" }` answers the server did deliver (and cache) — the
    // production symptom. The browser bound must stay strictly larger, and still bounded.
    assert.ok(
        REVERSE_FALLBACK_ROUTE_TIMEOUT_MS > REVERSE_FALLBACK_TIMEOUT_MS,
        `browser bound ${REVERSE_FALLBACK_ROUTE_TIMEOUT_MS}ms must exceed the provider deadline ${REVERSE_FALLBACK_TIMEOUT_MS}ms`,
    );
    assert.ok(REVERSE_FALLBACK_ROUTE_TIMEOUT_MS <= 15000, "the extra wait stays bounded");

    // A slow-but-successful answer is committed when the budget covers it…
    const slowAnswer = (_url, init) =>
        new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve(jsonResponse(PRODUCTION_ROUTE_PAYLOAD)), 60);
            init.signal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new Error("aborted"));
            }, { once: true });
        });
    const committed = await requestFallbackReverseAddress(PRODUCTION_PIN.latitude, PRODUCTION_PIN.longitude, {
        timeoutMs: 250,
        fetchImpl: slowAnswer,
    });
    assert.equal(committed.status, "ok");
    assert.equal(fallbackAddressToSearchResult(committed.address).displayName, PRODUCTION_FORMATTED_ADDRESS);

    // …and is thrown away when the budget is shorter than the answer: this is the bug the bound above
    // removes, reproduced on purpose.
    const abandoned = await requestFallbackReverseAddress(PRODUCTION_PIN.latitude, PRODUCTION_PIN.longitude, {
        timeoutMs: 20,
        fetchImpl: slowAnswer,
    });
    assert.deepEqual(abandoned, { status: "unavailable" });

    // The page uses that default (no smaller override) for its single call site.
    assert.match(
        checkoutPage,
        /requestFallbackReverseAddress\(pin\.latitude, pin\.longitude, \{\s*\n\s*signal: fallbackController\.signal,\s*\n\s*\}\);/,
    );
});


test("the page never reports the fallback as unusable while it is still being asked", () => {
    const flowStart = checkoutPage.indexOf("const reverseGeocodeAndFill = async (");
    const flow = code(checkoutPage.slice(flowStart, checkoutPage.indexOf("const applyResolvedAddress", flowStart)));
    assert.ok(flowStart > -1 && flow.length > 0);

    // Both Google-failure branches ask the free fallback FIRST, and only write the failure state
    // once that attempt returned nothing. The loading state covers the whole attempt, so the
    // customer-visible sentence "Cadangan alamat otomatis juga belum tersedia" can never describe a
    // fallback request that is still in flight (that is what mis-reported a 200 `status:"ok"`).
    assert.match(
        flow,
        /if \(!result \|\| !isRecognizedGoogleAddress\(address\)\) \{[\s\S]{0,700}?if \(await reverseFallbackAndFill\(requestedPin, requestId\)\) return;[\s\S]{0,220}?setReverseState\("error"\);\s*\n\s*setReverseFailure\("no_address"\);\s*\n\s*setAreaState\("not_found"\);\s*\n\s*return;/,
    );
    assert.match(
        flow,
        /const failure = classifyGoogleGeocodeFailure\(error\);[\s\S]{0,220}?if \(await reverseFallbackAndFill\(requestedPin, requestId\)\) return;[\s\S]{0,220}?setReverseState\("error"\);\s*\n\s*setReverseFailure\(failure\);\s*\n\s*setAreaState\("not_found"\);/,
    );

    // Order proof: each of the two failure reports follows its OWN fallback attempt, and no failure
    // report exists anywhere else in the confirmation flow.
    const errorWrites = [...flow.matchAll(/setReverseState\("error"\)/g)];
    assert.equal(errorWrites.length, 2, "one report per Google-failure branch");
    let previousAttempt = -1;
    for (const write of errorWrites) {
        const attempt = flow.lastIndexOf("await reverseFallbackAndFill(", write.index);
        assert.ok(attempt > previousAttempt, "every failure report must come AFTER a fallback attempt");
        previousAttempt = attempt;
    }

    // The loading state is what the customer sees while the fallback is asked.
    assert.match(flow, /setReverseState\("loading"\);\s*\n\s*setReverseFailure\("none"\);/);
});

test("the provider's nearby coordinates never become the confirmed delivery pin", () => {
    // Production: the pin that was asked about and the provider's own answer differ slightly.
    assert.notDeepEqual(
        { latitude: PRODUCTION_ROUTE_PAYLOAD.address.latitude, longitude: PRODUCTION_ROUTE_PAYLOAD.address.longitude },
        PRODUCTION_PIN,
    );

    // Feeding the staleness guard the PROVIDER's nearby answer would judge the current pin stale and
    // throw the good answer away, so only the REQUESTED/CONFIRMED pin may be compared.
    assert.equal(isStalePin(PRODUCTION_PIN, PRODUCTION_PIN), false);
    assert.equal(
        isStalePin(
            { latitude: PRODUCTION_ROUTE_PAYLOAD.address.latitude, longitude: PRODUCTION_ROUTE_PAYLOAD.address.longitude },
            PRODUCTION_PIN,
        ),
        true,
        "provider-returned coordinates are never the confirmation reference",
    );
    assert.match(
        checkoutPage,
        /if \(isStaleResponse\(reverseRef\.current, requestId\) \|\| isStalePin\(pin, confirmedPinRef\.current\)\) return false;\s*\n\s*if \(fallback\.status !== "ok"\) return false;\s*\n\s*applyResolvedAddress\(fallbackAddressToSearchResult\(fallback\.address\)\);/,
    );

    // The answer is consumed as address METADATA only: no provider coordinate is ever read out of
    // the fallback result, and the confirmed pin has exactly one writer.
    assert.doesNotMatch(code(checkoutPage), /fallback\.address\.(latitude|longitude)/);
    assert.equal((code(checkoutPage).match(/confirmedPinRef\.current = /g) || []).length, 1);
    assert.match(checkoutPage, /confirmedPinRef\.current = draftLocation;/);

    const applyBody = code(
        checkoutPage.slice(
            checkoutPage.indexOf("const applyResolvedAddress = ("),
            checkoutPage.indexOf("const reverseFallbackAndFill ="),
        ),
    );
    assert.ok(applyBody.length > 0);
    assert.doesNotMatch(applyBody, /latitude|longitude|setConfirmedPin|setDraftLocation|setMapZoom/);
});


test("a Biteship area that cannot be matched never undoes the display-address success", () => {
    const matchStart = checkoutPage.indexOf("const matchArea = async (address: AreaAddressInput) => {");
    const matchBody = code(
        checkoutPage.slice(matchStart, checkoutPage.indexOf("const handleCenterChange", matchStart)),
    );
    assert.ok(matchStart > -1 && matchBody.length > 0);
    // DISPLAY ADDRESS success and BITESHIP AREA success are two separate states: the area match may
    // only ever write the AREA state, so a no-match can never revert the address to unavailable.
    assert.doesNotMatch(matchBody, /setReverseState|setReverseFailure/);
    assert.match(matchBody, /setAreaState\("not_found"\)/);

    // The address is committed and marked done BEFORE the area match starts...
    const applyBody = code(
        checkoutPage.slice(
            checkoutPage.indexOf("const applyResolvedAddress = ("),
            checkoutPage.indexOf("const reverseFallbackAndFill ="),
        ),
    );
    assert.ok(
        applyBody.indexOf('setReverseState("done")') < applyBody.indexOf("void matchArea({"),
        "the address is marked done before the area match begins",
    );

    // ...so after a display-address success with no official area, the customer still gets the
    // "Alamat ditemukan…" copy and the existing manual kecamatan/kelurahan picker.
    assert.match(checkoutPage, /reverseState === "done" \? AREA_FALLBACK_TITLE_AFTER_ADDRESS : AREA_FALLBACK_TITLE/);
    assert.match(checkoutPage, /Alamat ditemukan\. Pilih kecamatan\/kelurahan pengiriman untuk melanjutkan pengecekan ongkir\./);
    assert.match(checkoutPage, /areaState === "not_found" && \(/);
    assert.match(checkoutPage, /<AreaAutocomplete/);
    assert.match(checkoutPage, /const chooseArea = \(a: Area\) => \{/);
    // The manual pick is the ONLY other writer of a destinationAreaId, and it is always an official
    // Biteship area: the fallback module can never produce one.
    assert.doesNotMatch(code(fallbackLib), /destinationAreaId/);
});

test("one confirmation spends at most one provider-free fallback request", async () => {
    // The browser leg is a single bounded attempt: no retry loop, no request per pan/zoom/drag.
    const browserStart = fallbackLib.indexOf("export async function requestFallbackReverseAddress(");
    const browserLeg = code(fallbackLib.slice(browserStart));
    assert.ok(browserStart > -1 && browserLeg.length > 0);
    assert.doesNotMatch(browserLeg, /\b(for|while)\s*\(/, "no retry loop around the route request");
    assert.equal((browserLeg.match(/await doFetch\(/g) || []).length, 1);

    // Panning only moves the DRAFT pin, so the fallback is unreachable while the customer moves the
    // map: no lookup, no request, no Biteship call.
    const movement = checkoutPage.slice(
        checkoutPage.indexOf("const handleCenterChange"),
        checkoutPage.indexOf("const confirmLocation"),
    );
    assert.ok(movement.length > 0);
    assert.doesNotMatch(movement, /Fallback|reverseGeocode|fetch\(/);

    // And the route is asked at most ONCE per confirmation for the same rounded pin, even when two
    // confirmations overlap: the second shares the first attempt instead of spending another call.
    clearFallbackReverseCache();
    const { calls, fetchImpl } = recordingFetch(() => bodyResponse(PROVIDER_PAYLOAD));
    const pin = { latitude: -6.1313, longitude: 106.1616 };
    const [first, second] = await Promise.all([
        resolveFallbackReverseAddress(pin.latitude, pin.longitude, { fetchImpl }),
        resolveFallbackReverseAddress(pin.latitude, pin.longitude, { fetchImpl }),
    ]);
    assert.equal(first.status, "ok");
    assert.deepEqual(second, first);
    assert.equal(calls.length, 1);
    clearFallbackReverseCache();
});

test("a genuinely superseded fallback answer can never be committed", async () => {
    // The requested pin is the reference, and the request sequence is checked too, so an answer for
    // an older confirmation is dropped even though it arrived successfully.
    assert.equal(isStaleResponse(7, 6), true);
    assert.equal(isStaleResponse(7, 7), false);
    assert.equal(isStalePin({ latitude: -6.0021, longitude: 106.0123456 }, PRODUCTION_PIN), true);
    assert.match(
        checkoutPage,
        /if \(isStaleResponse\(reverseRef\.current, requestId\) \|\| isStalePin\(pin, confirmedPinRef\.current\)\) return false;/,
    );

    // Both commits in the confirmation flow sit behind that guard: Google's answer (in the flow) and
    // the fallback's answer (inside the helper).
    const flowStart = checkoutPage.indexOf("const reverseGeocodeAndFill = async (");
    const flow = code(checkoutPage.slice(flowStart, checkoutPage.indexOf("const applyResolvedAddress", flowStart)));
    const commit = flow.indexOf("applyResolvedAddress(result);");
    assert.ok(commit > flow.lastIndexOf("isStalePin(requestedPin, confirmedPinRef.current)"));
});
