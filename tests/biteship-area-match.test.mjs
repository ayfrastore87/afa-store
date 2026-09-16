import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    addAreaCandidates,
    AREA_MATCH_HIGH_CONFIDENCE,
    AREA_MATCH_THRESHOLD,
    buildAreaSearchQueries,
    cityTier,
    coreAreaName,
    isHighConfidenceAreaMatch,
    MAX_AREA_SEARCH_QUERIES,
    normalizeAreaName,
    pickBestAreaMatch,
    rankAreaCandidates,
    scoreAreaCandidate,
} from "../src/lib/area-match.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

/** Source with comments removed: "never contains X" checks must inspect real code only. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const areaMatchLib = read("../src/lib/area-match.ts");
const areaMatchCode = code(areaMatchLib);
const checkoutPage = read("../src/app/checkout/page.tsx");
const areasRoute = read("../src/app/api/shipping/areas/route.ts");
const biteshipLib = read("../src/lib/biteship.ts");

// ==========================================================================
// Fixtures — an ANONYMIZED production shape.
//
// Reverse geocoder (Nominatim/OpenStreetMap) result for a precise map pin on
// "Jalan Ekonomi": kelurahan Karang Anyar, kecamatan Sawah Besar, Jakarta Pusat,
// DKI Jakarta 10740. Biteship formats the SAME place with different labels, which
// used to make the automatic area match fail and show the manual fallback.
// No real production area id is reproduced here — the ids are test placeholders.
// ==========================================================================
const JAKARTA_ADDRESS = {
    province: "Daerah Khusus Ibukota Jakarta",
    city: "Jakarta Pusat",
    district: "Sawah Besar",
    village: "Karang Anyar",
    postcode: "10740",
};

const BITESHIP_JAKARTA_AREA = {
    id: "test-area-jakarta-karang-anyar",
    name: "Karang Anyar, Sawah Besar, Kota Administrasi Jakarta Pusat, DKI Jakarta 10740",
    type: "level_4",
    postalCode: "10740",
    province: "DKI Jakarta",
    city: "Kota Administrasi Jakarta Pusat",
    district: "Sawah Besar",
    village: "Karang Anyar",
};

/** Same kelurahan name in a completely different city (a false-positive decoy). */
const DECOY_OTHER_CITY = {
    id: "test-area-bandung-karang-anyar",
    name: "Karang Anyar, Astanaanyar, Kota Bandung, Jawa Barat 40111",
    type: "level_4",
    postalCode: "40111",
    province: "Jawa Barat",
    city: "Kota Bandung",
    district: "Astanaanyar",
    village: "Karang Anyar",
};

/** Same kelurahan/kecamatan/city, but a neighbouring postal code (decoy). */
const DECOY_OTHER_POSTCODE = {
    id: "test-area-jakarta-neighbour-postcode",
    name: "Karang Anyar, Sawah Besar, Kota Administrasi Jakarta Pusat, DKI Jakarta 10741",
    type: "level_4",
    postalCode: "10741",
    province: "DKI Jakarta",
    city: "Kota Administrasi Jakarta Pusat",
    district: "Sawah Besar",
    village: "Karang Anyar",
};
// 1. THE production regression: a precise map pin must resolve an official Biteship
// area even though the geocoder and Biteship label the same place differently.
test("map pin resolves the official Biteship area when the admin labels differ", () => {
    const best = pickBestAreaMatch([BITESHIP_JAKARTA_AREA, DECOY_OTHER_CITY, DECOY_OTHER_POSTCODE], JAKARTA_ADDRESS);
    assert.equal(best?.id, BITESHIP_JAKARTA_AREA.id);
    // The winner is a real official candidate that crossed the strong threshold with a
    // high-confidence score, so the checkout shows the automatic success UX.
    const score = scoreAreaCandidate(BITESHIP_JAKARTA_AREA, JAKARTA_ADDRESS);
    assert.ok(score.total >= AREA_MATCH_THRESHOLD);
    assert.ok(score.total >= AREA_MATCH_HIGH_CONFIDENCE);
    assert.equal(score.disqualified, false);
    assert.deepEqual(score.conflicts, []);
    assert.ok(isHighConfidenceAreaMatch(BITESHIP_JAKARTA_AREA, JAKARTA_ADDRESS));
    // Evidence that drove the match: postcode + kelurahan + kecamatan + city + province.
    for (const field of ["postcode", "city", "district", "village", "province"]) {
        assert.ok(score.reasons.includes(field), `expected ${field} to be matched`);
    }
});

test("label normalization is generic — no destination is hardcoded in the matcher", () => {
    // Generic collapsing, not a Jakarta special case: it must work for every region.
    assert.equal(coreAreaName("Kota Administrasi Jakarta Pusat"), "jakarta pusat");
    assert.equal(coreAreaName("Jakarta Pusat"), "jakarta pusat");
    assert.equal(coreAreaName("Kabupaten Administrasi Kepulauan Seribu"), "kepulauan seribu");
    assert.equal(coreAreaName("Daerah Khusus Ibukota Jakarta"), coreAreaName("DKI Jakarta"));
    assert.equal(coreAreaName("Daerah Istimewa Yogyakarta"), coreAreaName("DI Yogyakarta"));
    assert.equal(coreAreaName("Kota Surabaya"), coreAreaName("Surabaya"));
    // The auto-match library itself must never contain a destination literal.
    assert.doesNotMatch(areaMatchCode, /jakarta/i);
    assert.doesNotMatch(areaMatchCode, /10740/);
    assert.doesNotMatch(areaMatchCode, /sawah besar/i);
});

test("prefix differences Kota/Kabupaten/Kecamatan/Kelurahan/Desa are tolerated", () => {
    assert.equal(normalizeAreaName("Kabupaten Cianjur"), "cianjur");
    assert.equal(normalizeAreaName("Kecamatan Karang Tengah"), "karang tengah");
    assert.equal(normalizeAreaName("Kelurahan Karang Anyar"), "karang anyar");
    assert.equal(normalizeAreaName("Desa Bojong"), "bojong");
    assert.equal(normalizeAreaName("Provinsi Jawa Barat"), "jawa barat");
    // Both directions: geocoder wording vs Biteship wording.
    const address = { ...JAKARTA_ADDRESS, city: "Kota Administrasi Jakarta Pusat", district: "Kecamatan Sawah Besar", village: "Kelurahan Karang Anyar" };
    const candidate = { ...BITESHIP_JAKARTA_AREA, city: "Jakarta Pusat", district: "Sawah Besar", village: "Karang Anyar" };
    assert.equal(pickBestAreaMatch([candidate], address)?.id, candidate.id);
});

test("postcode + village + compatible city wins even when the district label differs", () => {
    const address = { province: "DKI Jakarta", city: "Jakarta Pusat", district: "Sawah Besar", village: "Karang Anyar", postcode: "10740" };
    // Biteship names the kecamatan differently from the reverse geocoder.
    const candidate = { ...BITESHIP_JAKARTA_AREA, district: "Sawah Besar (Kec.)", name: "Karang Anyar, Kec. Sawah Besar, Kota Administrasi Jakarta Pusat, DKI Jakarta 10740" };
    const best = pickBestAreaMatch([candidate], address);
    assert.equal(best?.id, candidate.id);
    const score = scoreAreaCandidate(candidate, address);
    assert.ok(score.total >= AREA_MATCH_THRESHOLD);
    assert.ok(score.reasons.includes("postcode"));
    assert.ok(score.reasons.includes("village"));
});
// 5. Conflicts: one matching name may never win on its own.
test("a conflicting city is rejected even when everything else matches", () => {
    const address = { province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong", postcode: "43125" };
    const candidate = { id: "wrong-city", name: "Bojong, Karang Tengah, Kota Bandung, Jawa Barat 43125", type: "level_4", postalCode: "43125", province: "Jawa Barat", city: "Kota Bandung", district: "Karang Tengah", village: "Bojong" };
    const score = scoreAreaCandidate(candidate, address);
    assert.equal(score.disqualified, true);
    assert.ok(score.conflicts.includes("city"));
    assert.equal(pickBestAreaMatch([candidate], address), null);
});

test("a conflicting postcode never wins on a single matching name", () => {
    const address = { province: "Jawa Barat", city: "Cianjur", district: "Karang Tengah", village: "Bojong", postcode: "43125" };
    // A single coincidentally matching name (a same-named kecamatan) is never enough.
    const singleName = { id: "single", name: "Bojong, Jawa Barat 43126", type: "level_3", postalCode: "43126", province: "Jawa Barat", district: "Bojong" };
    assert.equal(scoreAreaCandidate(singleName, address).disqualified, true);
    assert.equal(pickBestAreaMatch([singleName], address), null);
    // Village + city + province agree but the kecamatan does not: the district conflict
    // cancels the postcode toleration, so the candidate stays far below the threshold.
    const rival = { id: "rival", name: "Bojong, Cianjur, Jawa Barat 43126", type: "level_4", postalCode: "43126", province: "Jawa Barat", city: "Cianjur", village: "Bojong" };
    const score = scoreAreaCandidate(rival, address);
    assert.ok(score.conflicts.includes("postcode"));
    assert.ok(score.total < AREA_MATCH_THRESHOLD);
    assert.equal(pickBestAreaMatch([rival], address), null);
});

test("the exact-postcode candidate always outranks a near-postcode candidate", () => {
    const best = pickBestAreaMatch([DECOY_OTHER_POSTCODE, BITESHIP_JAKARTA_AREA], JAKARTA_ADDRESS);
    assert.equal(best?.id, BITESHIP_JAKARTA_AREA.id);
    // Ranking is global, independent of the order Biteship returned the candidates in.
    const ranked = rankAreaCandidates([DECOY_OTHER_POSTCODE, BITESHIP_JAKARTA_AREA], JAKARTA_ADDRESS);
    assert.equal(ranked[0]?.area.id, BITESHIP_JAKARTA_AREA.id);
    assert.ok(ranked[0].score.total > ranked[1].score.total);
});

test("Kota X vs Kabupaten X wording is never a strict city match", () => {
    assert.equal(cityTier("Kota Tangerang"), "kota");
    assert.equal(cityTier("Kabupaten Tangerang"), "kabupaten");
    assert.equal(cityTier("Tangerang"), "");
    const address = { province: "Banten", city: "Kota Tangerang", district: "Cipondoh", village: "Poris Plawad", postcode: "15141" };
    const candidate = { id: "kab", name: "Poris Plawad, Cipondoh, Kabupaten Tangerang, Banten 15141", type: "level_4", postalCode: "15141", province: "Banten", city: "Kabupaten Tangerang", district: "Cipondoh", village: "Poris Plawad" };
    const score = scoreAreaCandidate(candidate, address);
    assert.ok(score.notes.includes("city-tier"));
    assert.ok(!score.reasons.includes("city"));
    // The tier clash is a soft downgrade, so it must never be reported as a strict city
    // match even though the name itself is identical.
    const sameTier = { ...candidate, city: "Kota Tangerang" };
    assert.ok(scoreAreaCandidate(sameTier, address).total > score.total);
});

test("a true no-match still returns null so the manual fallback is shown", () => {
    const unrelated = { id: "surabaya", name: "Genteng, Kota Surabaya, Jawa Timur 60275", type: "level_3", postalCode: "60275", province: "Jawa Timur", city: "Kota Surabaya", district: "Genteng" };
    assert.equal(pickBestAreaMatch([unrelated], JAKARTA_ADDRESS), null);
    assert.deepEqual(rankAreaCandidates([unrelated], JAKARTA_ADDRESS), []);
});
// 11. Query strategy: fewer, better, bounded, de-duplicated lookups.
test("area queries are specific-first, bounded and include the high-recall single tokens", () => {
    const queries = buildAreaSearchQueries(JAKARTA_ADDRESS);
    assert.equal(queries[0], "Karang Anyar Sawah Besar Jakarta Pusat 10740");
    assert.ok(queries.includes("Sawah Besar Jakarta Pusat 10740"));
    assert.ok(queries.includes("Karang Anyar Jakarta Pusat 10740"));
    assert.ok(queries.includes("10740"));
    assert.ok(queries.includes("Karang Anyar"));
    assert.ok(queries.length <= MAX_AREA_SEARCH_QUERIES);
    // No query repeats another one once normalized.
    const normalized = queries.map((q) => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    assert.equal(new Set(normalized).size, normalized.length);
});

test("duplicate normalized area queries are removed", () => {
    // "Kota Cilegon" and "Cilegon" are the same lookup; the city is only asked once.
    const queries = buildAreaSearchQueries({ village: "Kalitimbang", district: "Cibeber", city: "Kota Cilegon", postcode: "42426" });
    const keys = queries.map((q) => q.toLowerCase().replace(/\b(kota|kabupaten|kecamatan|kelurahan|desa)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim()).map((k) => k.split(" ").sort().join(" "));
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(queries.filter((q) => /cilegon/i.test(q)).length, 3);
});

test("broad province-only queries are avoided when specific fields exist", () => {
    // Nothing but a city that merely repeats the province: no useful lookup exists, so
    // the checkout must not spend a request on a nationwide term.
    assert.deepEqual(buildAreaSearchQueries({ province: "DKI Jakarta", city: "Jakarta" }), []);
    assert.deepEqual(buildAreaSearchQueries({ province: "Daerah Khusus Ibukota Jakarta" }), []);
    // With a specific pin the province is never part of a query.
    const queries = buildAreaSearchQueries(JAKARTA_ADDRESS);
    assert.ok(queries.every((q) => !/daerah khusus/i.test(q)));
    assert.ok(queries.every((q) => !/^dki$/i.test(q.trim())));
    // A lone postcode is still specific enough to be worth exactly one lookup.
    assert.deepEqual(buildAreaSearchQueries({ postcode: "10740" }), ["10740"]);
    // A lone city is only searched when nothing more specific is known at all.
    assert.deepEqual(buildAreaSearchQueries({ city: "Cianjur" }), ["Cianjur"]);
});

test("the checkout only issues the bounded auto-match queries and stops early", () => {
    assert.match(checkoutPage, /const queries = buildAreaSearchQueries\(address\)/);
    assert.match(checkoutPage, /for \(const q of queries\)/);
    assert.match(checkoutPage, /if \(best && isHighConfidenceAreaMatch\(best, address\)\) break;/);
    assert.match(checkoutPage, /buildAreaSearchQueries/);
    // Every auto-match lookup is a single request for one query — no loops inside loops.
    assert.match(checkoutPage, /api\/shipping\/areas\?input=\$\{encodeURIComponent\(q\)\}/);
});
// 15. Candidates: official, de-duplicated, ranked globally — never areas[0].
test("duplicate candidate ids from several queries are removed", () => {
    const target = [];
    const seen = new Set();
    const added = addAreaCandidates(target, seen, [BITESHIP_JAKARTA_AREA, { ...BITESHIP_JAKARTA_AREA }, DECOY_OTHER_CITY]);
    assert.equal(added, 2);
    assert.equal(target.length, 2);
    assert.equal(addAreaCandidates(target, seen, [DECOY_OTHER_CITY]), 0);
    // Candidates without an official id are ignored entirely.
    assert.equal(addAreaCandidates(target, seen, [{ id: "", name: "no id" }, null]), 0);
    assert.equal(target.length, 2);
});

test("the winner is chosen globally across every query's candidates", () => {
    const fromQueryOne = [{ id: "weak", name: "Karang Anyar, Kecamatan Lain, Kota Lain, Jawa Barat 10799", type: "level_4", postalCode: "10799", province: "Jawa Barat", city: "Kota Lain", district: "Kecamatan Lain", village: "Karang Anyar" }];
    const fromQueryTwo = [DECOY_OTHER_CITY, BITESHIP_JAKARTA_AREA];
    const merged = [...fromQueryOne, ...fromQueryTwo];
    assert.equal(pickBestAreaMatch(merged, JAKARTA_ADDRESS)?.id, BITESHIP_JAKARTA_AREA.id);
    assert.equal(pickBestAreaMatch([...merged].reverse(), JAKARTA_ADDRESS)?.id, BITESHIP_JAKARTA_AREA.id);
    // Never a blind areas[0] pick: the first candidate of the merged list loses.
    assert.notEqual(merged[0].id, BITESHIP_JAKARTA_AREA.id);
});

test("no areas[0] auto-select anywhere in the matcher or the checkout", () => {
    assert.doesNotMatch(areaMatchCode, /areas\[0\]/);
    assert.doesNotMatch(checkoutPage, /setDestinationArea\(areas\[0\]\)/);
    assert.match(areaMatchCode, /pickBestAreaMatch/);
    assert.match(checkoutPage, /setDestinationArea\(best\)/);
});

// 19. Automatic success UX: the fallback disappears on its own and rates are quoted.
test("a resolved area hides the manual fallback and quotes rates automatically", () => {
    assert.match(checkoutPage, /\{areaState === "matched" && destinationArea &&/);
    assert.match(checkoutPage, /\{areaState === "not_found" && \(/);
    // Rates are re-quoted whenever the authoritative Biteship area changes.
    assert.match(checkoutPage, /\}, \[destinationArea, destinationSignature, session\?\.items, rateReload\]\);/);
    assert.match(checkoutPage, /destinationAreaId: destinationArea\.id/);
});

test("manual fallback picks invalidate the previous quote and re-quote the chosen area", () => {
    assert.match(checkoutPage, /Area pengiriman belum ditemukan otomatis\./);
    assert.match(checkoutPage, /Cari kelurahan atau kecamatan\./);
    const chooseArea = checkoutPage.match(/const chooseArea = \(a: Area\) => \{[\s\S]*?\n    \};/)?.[0] ?? "";
    assert.ok(chooseArea, "chooseArea must exist");
    assert.match(chooseArea, /setDestinationArea\(a\)/);
    assert.match(chooseArea, /setAreaState\("matched"\)/);
    assert.match(chooseArea, /setQuoteSignature\(""\)/);
    assert.match(chooseArea, /setRates\(\[\]\)/);
});
// 20. Race protection: a stale area response can never replace a newer pin.
test("stale area lookups are aborted and can never overwrite a newer pin", () => {
    assert.match(checkoutPage, /const areaAbortRef = useRef<AbortController \| null>\(null\)/);
    assert.match(checkoutPage, /areaAbortRef\.current\?\.abort\(\);/);
    assert.match(checkoutPage, /const controller = new AbortController\(\);/);
    assert.match(checkoutPage, /signal: controller\.signal/);
    assert.match(checkoutPage, /if \(controller\.signal\.aborted \|\| isStaleResponse\(areaMatchRef\.current, requestId\)\) return;/);
    // A superseded response is discarded before it can touch the destination.
    const beforeSet = checkoutPage.slice(checkoutPage.indexOf("const matchArea = async"), checkoutPage.indexOf("setDestinationArea(best)"));
    assert.match(beforeSet, /isStaleResponse\(areaMatchRef\.current, requestId\)/);
    // The picker's own reverse-geocode request keeps its latest-request-wins guard.
    assert.match(checkoutPage, /isStaleResponse\(reverseRef\.current, requestId\) \|\| isStalePin\(requestedPin, confirmedPinRef\.current\)/);
    // Unmounting aborts any in-flight lookup.
    assert.match(checkoutPage, /if \(settleTimerRef\.current\) clearTimeout\(settleTimerRef\.current\);\s*\n\s*areaAbortRef\.current\?\.abort\(\);/);
});

// 6. Diagnostics: enough to debug, never sensitive, never in production.
test("area diagnostics are development-only and carry no customer data", () => {
    assert.match(checkoutPage, /if \(process\.env\.NODE_ENV === "production"\) return;/);
    assert.match(checkoutPage, /process\.env\.NODE_ENV !== "production" && areaDiagnostics/);
    const snapshotType = checkoutPage.match(/type AreaDiagnostics = \{[\s\S]*?\n\};/)?.[0] ?? "";
    assert.ok(snapshotType, "AreaDiagnostics type must exist");
    for (const field of ["input", "queries", "completed", "candidates", "score", "reasons", "conflicts", "resolved"]) {
        assert.match(snapshotType, new RegExp(field));
    }
    for (const sensitive of ["phone", "recipientName", "senderName", "apiKey", "cookie", "email"]) {
        assert.doesNotMatch(snapshotType, new RegExp(sensitive, "i"));
    }
    // The server-side diagnostic is a development log of the searched label + count only.
    assert.match(areasRoute, /if \(process\.env\.NODE_ENV !== "production"\) \{/);
    assert.match(areasRoute, /console\.info\("shipping_areas_query", \{ input, type, count: areas\.length \}\);/);
    assert.doesNotMatch(areasRoute, /BITESHIP_API_KEY/);
});

// 9. Request-storm protection: repeated identical lookups never reach Biteship twice.
test("official area lookups are cached with a bounded, short-lived server cache", () => {
    assert.match(biteshipLib, /const areasCache = new Map<string, \{ areas: BiteshipArea\[\]; at: number \}>\(\);/);
    assert.match(biteshipLib, /const AREAS_CACHE_TTL_MS = 5 \* 60_000;/);
    assert.match(biteshipLib, /const AREAS_CACHE_MAX_ENTRIES = 200;/);
    assert.match(biteshipLib, /if \(cached && Date\.now\(\) - cached\.at < AREAS_CACHE_TTL_MS\) return cached\.areas;/);
    assert.match(biteshipLib, /areasCache\.set\(cacheKey, \{ areas: result, at: Date\.now\(\) \}\);/);
    assert.match(biteshipLib, /if \(areasCache\.size > AREAS_CACHE_MAX_ENTRIES\) \{/);
    // The lookup still targets the official endpoint with the country filter.
    assert.match(biteshipLib, /countries: "ID"/);
    assert.match(biteshipLib, /\/v1\/maps\/areas\?/);
});
