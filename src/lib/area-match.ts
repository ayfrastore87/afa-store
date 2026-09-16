/*
 * Pure, dependency-free Biteship area auto-match helpers.
 * Importable by both the checkout client and the node:test suite.
 *
 * The reverse-geocoded address NEVER fabricates a destinationAreaId — these helpers
 * only build search queries and rank OFFICIAL Biteship area results that the server
 * already returned from /v1/maps/areas.
 *
 * Why this module exists (the production failure it fixes):
 *  1. Indonesian administrative names are formatted differently by the reverse
 *     geocoder (Nominatim/OSM) and by Biteship: a plain city name, a "Kota
 *     Administrasi ..." style name, a province abbreviation vs its full status name
 *     ("Daerah Khusus Ibukota ..."), and "Karang Tengah" vs "Karangtengah" all have to
 *     compare as the same place. Names are therefore normalized in TWO tiers before
 *     comparison — never by lowering a similarity threshold.
 *  2. The postal code is the strongest single piece of evidence, followed by the
 *     kelurahan/desa (village), kecamatan (district), city and province.
 *  3. A conflicting CITY disqualifies a candidate outright, and a conflicting postal
 *     code is only tolerated when every other administrative level still agrees: a
 *     single coincidentally matching name may never win on its own.
 *  4. `areas[0]` is NEVER used. Candidates from every query are scored globally and
 *     only a strong winner becomes the destination.
 *  5. NO destination is hardcoded — the rules below are generic for all of Indonesia.
 */

export type AreaAddressInput = {
    province?: string | null;
    city?: string | null;
    district?: string | null;
    village?: string | null;
    postcode?: string | null;
};

export type AreaCandidate = {
    id: string;
    name: string;
    type?: string;
    postalCode?: string;
    province?: string;
    city?: string;
    district?: string;
    village?: string;
};

/* ==========================================================================
 * Normalization (comparison only — display strings are never mutated)
 * ========================================================================== */

function clean(value: string | null | undefined): string {
    return (value ?? "").trim();
}

function cleanPostcode(value: string | null | undefined): string {
    return clean(value).replace(/\s+/g, "");
}

function tokenize(value: string | null | undefined): string[] {
    return clean(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean);
}
/** Administrative labels that only ever lead an Indonesian name. */
const LEADING_ADMIN_PREFIXES = new Set([
    "provinsi",
    "propinsi",
    "province",
    "kabupaten",
    "kab",
    "kota",
    "kecamatan",
    "kec",
    "kelurahan",
    "kel",
    "desa",
]);

/**
 * Generic administrative/status words that carry NO location identity. They are
 * removed anywhere in the name so equivalent wordings collapse onto the same key:
 *   "Kota Administrasi <city>"          -> "<city>"
 *   "Daerah Khusus Ibukota <province>"  -> "<province>"
 *   "Kabupaten Administrasi <regency>"  -> "<regency>"
 * This is generic (level labels + status descriptors), never a per-destination hack.
 */
const ADMIN_NOISE_TOKENS = new Set([
    "provinsi",
    "propinsi",
    "province",
    "kabupaten",
    "kab",
    "kota",
    "kecamatan",
    "kec",
    "kelurahan",
    "kel",
    "desa",
    "municipality",
    "municipal",
    "regency",
    "city",
    "district",
    "county",
    "administrasi",
    "administratif",
    "administrative",
    "daerah",
    "khusus",
    "ibukota",
    "istimewa",
    "negara",
]);

/** Status ABBREVIATIONS that only ever lead a name ("DI Yogyakarta", "DKI Jakarta"). */
const LEADING_STATUS_ABBREVIATIONS = new Set(["di", "dki"]);

/**
 * Tier 1 normalization: lowercase, strip punctuation, collapse whitespace and remove
 * LEADING administrative prefixes ("Kabupaten Cianjur" -> "cianjur"). The original
 * name shown to the customer is never mutated by this helper.
 */
export function normalizeAreaName(value: string | null | undefined): string {
    const kept: string[] = [];
    for (const token of tokenize(value)) {
        // Only drop leading administrative prefixes (once a real word is kept, keep
        // everything that follows to preserve proper nouns).
        if (LEADING_ADMIN_PREFIXES.has(token) && kept.length === 0) continue;
        kept.push(token);
    }
    return kept.join(" ");
}

/**
 * Tier 2 normalization: tier 1 plus removal of every generic administrative/status
 * token, so naming differences between the geocoder and Biteship compare as equal.
 */
export function coreAreaName(value: string | null | undefined): string {
    const kept: string[] = [];
    for (const token of tokenize(value)) {
        if (kept.length === 0 && LEADING_STATUS_ABBREVIATIONS.has(token)) continue;
        if (ADMIN_NOISE_TOKENS.has(token)) continue;
        kept.push(token);
    }
    return kept.join(" ");
}

/**
 * Administrative tier of a city/regency label: "kota" vs "kabupaten" ("" when the
 * label carries no tier). Used so "Kota Tangerang" is never silently identical to
 * "Kabupaten Tangerang".
 */
export function cityTier(value: string | null | undefined): "kota" | "kabupaten" | "" {
    const raw = clean(value).toLowerCase();
    if (/\bkabupaten\b/.test(raw) || /\bkab\b\.?/.test(raw)) return "kabupaten";
    if (/\bkota\b/.test(raw)) return "kota";
    return "";
}

function tight(value: string): string {
    return value.replace(/\s+/g, "");
}

type FieldMatch = "strict" | "loose" | "conflict" | "absent";

/**
 * Compare two administrative names. "strict" = the same name after tier 1/tier 2
 * normalization; "loose" = the same name once whitespace is ignored
 * ("Karangtengah" vs "Karang Tengah"); "conflict" = a different place.
 */
function compareNames(actual: string | null | undefined, candidate: string | null | undefined): FieldMatch {
    const left = clean(actual);
    const right = clean(candidate);
    if (!left || !right) return "absent";

    const a = normalizeAreaName(left);
    const b = normalizeAreaName(right);
    if (a && a === b) return "strict";

    const ca = coreAreaName(left);
    const cb = coreAreaName(right);
    if (ca && ca === cb) return "strict";

    if (a && b && tight(a) === tight(b)) return "loose";
    if (ca && cb && tight(ca) === tight(cb)) return "loose";

    return "conflict";
}

function comparePostcode(actual: string | null | undefined, candidate: string | null | undefined): FieldMatch {
    const left = cleanPostcode(actual);
    const right = cleanPostcode(candidate);
    if (!left || !right) return "absent";
    return left === right ? "strict" : "conflict";
}
/* ==========================================================================
 * Official candidate scoring
 * ========================================================================== */

export const AREA_MATCH_WEIGHTS = { postcode: 45, city: 40, district: 30, village: 25, province: 15 } as const;
export const AREA_MATCH_PENALTIES = { postcode: 35, city: 60, district: 40, village: 20, province: 20 } as const;
/** Partial credit for a same-name / different-spacing match. */
export const AREA_MATCH_LOOSE_FACTOR = 0.75;
/** Soft deduction applied to a Kota X / Kabupaten X wording clash. */
export const AREA_MATCH_TIER_PENALTY = 10;
/** Minimum score an official candidate needs before it may become the destination. */
export const AREA_MATCH_THRESHOLD = 60;
/** Score at which further area queries cannot change the outcome (early stop). */
export const AREA_MATCH_HIGH_CONFIDENCE = 110;

export type AreaMatchScore = {
    total: number;
    /** Administrative levels that agreed (a "~" suffix marks a loose match). */
    reasons: string[];
    /** Administrative levels that disagreed. */
    conflicts: string[];
    /** Soft observations that are not conflicts (e.g. "city-tier"). */
    notes: string[];
    /** True when the candidate may never be used, whatever its raw score is. */
    disqualified: boolean;
};

type RawArea = {
    postcode: string;
    province: string;
    city: string;
    district: string;
    village: string;
};

type ParsedName = RawArea;

const EMPTY_PARSED: ParsedName = { postcode: "", province: "", city: "", district: "", village: "" };

/**
 * Conservatively parse a Biteship area `name` label (e.g.
 * "Bojong, Karangtengah, Kabupaten Cianjur, Jawa Barat 43125") into admin parts.
 * Only used to fill structured fields the server did not provide, and each level is
 * only assigned when the label really has that many parts (a level is never copied
 * into a wrong level).
 */
function parseAreaName(name: string | null | undefined): ParsedName {
    const s = clean(name);
    if (!s) return EMPTY_PARSED;

    const postcodeMatch = s.match(/(\d{5})\s*$/);
    const postcode = postcodeMatch ? postcodeMatch[1] : "";
    const withoutPostcode = s.replace(/\d{5}\s*$/, "").replace(/,\s*$/, "").trim();
    const parts = withoutPostcode.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return { ...EMPTY_PARSED, postcode };

    return {
        postcode,
        province: parts[parts.length - 1] ?? "",
        city: parts.length >= 2 ? parts[parts.length - 2] ?? "" : "",
        district: parts.length >= 3 ? parts[parts.length - 3] ?? "" : "",
        village: parts.length >= 4 ? parts[0] : "",
    };
}

function normalizeAddress(address: AreaAddressInput): RawArea {
    return {
        postcode: cleanPostcode(address.postcode),
        province: clean(address.province),
        city: clean(address.city),
        district: clean(address.district),
        village: clean(address.village),
    };
}

function effectiveArea(area: AreaCandidate): RawArea {
    const parsed = parseAreaName(area.name);
    const pick = (structured: string | undefined, label: string) => clean(structured) || clean(label);
    return {
        postcode: cleanPostcode(area.postalCode) || cleanPostcode(parsed.postcode),
        province: pick(area.province, parsed.province),
        city: pick(area.city, parsed.city),
        district: pick(area.district, parsed.district),
        village: pick(area.village, parsed.village),
    };
}
function matchPoints(match: FieldMatch, weight: number, penalty: number): number {
    if (match === "strict") return weight;
    if (match === "loose") return weight * AREA_MATCH_LOOSE_FACTOR;
    if (match === "conflict") return -penalty;
    return 0;
}

/**
 * Score one official Biteship candidate against the reverse-geocoded address.
 * Every available administrative level contributes evidence, weighted by how
 * reliable it is (postal code > city > district > village > province). Candidates
 * with a conflicting CITY are disqualified, and a conflicting postal code is only
 * tolerated when the village AND at least two other levels still agree — a single
 * coincidentally matching name can never make an official area the destination.
 */
export function scoreAreaCandidate(area: AreaCandidate, address: AreaAddressInput): AreaMatchScore {
    const a = normalizeAddress(address);
    const b = effectiveArea(area);

    const postcode = comparePostcode(a.postcode, b.postcode);
    const district = compareNames(a.district, b.district);
    const village = compareNames(a.village, b.village);
    const province = compareNames(a.province, b.province);

    let city = compareNames(a.city, b.city);
    const tierA = cityTier(a.city);
    const tierB = cityTier(b.city);
    const cityTierClash = city === "strict" && Boolean(tierA) && Boolean(tierB) && tierA !== tierB;
    if (cityTierClash) city = "loose";

    const reasons: string[] = [];
    const conflicts: string[] = [];
    const notes: string[] = [];

    const record = (field: string, match: FieldMatch, weight: number, penalty: number): number => {
        const points = matchPoints(match, weight, penalty);
        if (match === "strict") reasons.push(field);
        else if (match === "loose") reasons.push(`${field}~`);
        else if (match === "conflict") conflicts.push(field);
        return points;
    };

    let total = 0;
    total += record("postcode", postcode, AREA_MATCH_WEIGHTS.postcode, AREA_MATCH_PENALTIES.postcode);
    total += record("city", city, AREA_MATCH_WEIGHTS.city, AREA_MATCH_PENALTIES.city);
    total += record("district", district, AREA_MATCH_WEIGHTS.district, AREA_MATCH_PENALTIES.district);
    total += record("village", village, AREA_MATCH_WEIGHTS.village, AREA_MATCH_PENALTIES.village);
    total += record("province", province, AREA_MATCH_WEIGHTS.province, AREA_MATCH_PENALTIES.province);

    if (cityTierClash) {
        total -= AREA_MATCH_TIER_PENALTY;
        notes.push("city-tier");
    }

    // A differing postal code is tolerated only when the kelurahan/desa name matches
    // strictly AND at least two other levels still agree (postal-code noise at
    // administrative boundaries must not block an otherwise obvious official area).
    const otherLevelsAgreeing = [district, city, province].filter((m) => m === "strict" || m === "loose").length;
    const postcodeTolerated = village === "strict" && otherLevelsAgreeing >= 2;
    const disqualified = city === "conflict" || (postcode === "conflict" && !postcodeTolerated);

    return { total: Math.round(total * 100) / 100, reasons, conflicts, notes, disqualified };
}

export type RankedAreaCandidate = { area: AreaCandidate; score: AreaMatchScore };

/**
 * Rank every official candidate globally (never `areas[0]`): disqualified candidates
 * are dropped, the rest are ordered by score, highest confidence first.
 */
export function rankAreaCandidates(areas: AreaCandidate[], address: AreaAddressInput): RankedAreaCandidate[] {
    const ranked: RankedAreaCandidate[] = [];
    for (const area of areas) {
        if (!area?.id && !area?.name) continue;
        const score = scoreAreaCandidate(area, address);
        if (score.disqualified) continue;
        ranked.push({ area, score });
    }
    return ranked.sort((left, right) => right.score.total - left.score.total);
}

/**
 * The single best OFFICIAL Biteship candidate for an address, or null when nothing
 * crosses the strong-match threshold. Never falls back to the first result.
 */
export function pickBestAreaMatch(areas: AreaCandidate[], address: AreaAddressInput): AreaCandidate | null {
    const best = rankAreaCandidates(areas, address)[0];
    if (!best || best.score.total < AREA_MATCH_THRESHOLD) return null;
    return best.area;
}

/**
 * True when the match is strong enough (and conflict free) that asking Biteship for
 * MORE candidate queries cannot change the outcome, so the caller may stop early.
 */
export function isHighConfidenceAreaMatch(area: AreaCandidate | null | undefined, address: AreaAddressInput): boolean {
    if (!area) return false;
    const score = scoreAreaCandidate(area, address);
    return !score.disqualified && score.conflicts.length === 0 && score.total >= AREA_MATCH_HIGH_CONFIDENCE;
}

/**
 * Append OFFICIAL Biteship candidates to `target`, de-duplicated by area id so the
 * same official area returned by several queries is only scored once. Returns how
 * many candidates were added.
 */
export function addAreaCandidates(target: AreaCandidate[], seen: Set<string>, incoming: AreaCandidate[]): number {
    let added = 0;
    for (const area of incoming) {
        if (!area?.id || seen.has(area.id)) continue;
        seen.add(area.id);
        target.push(area);
        added += 1;
    }
    return added;
}
/* ==========================================================================
 * Biteship area search queries (fewer, better, de-duplicated)
 * ========================================================================== */
/** Hard bound on automatic Biteship area lookups per confirmed pin. */
export const MAX_AREA_SEARCH_QUERIES = 5;

/** Collapse whitespace of a component used inside a search query. */
function queryLabel(value: string | null | undefined): string {
    return clean(value).replace(/\s+/g, " ");
}

/**
 * Order-insensitive identity of a query: normalized tokens with every generic
 * administrative/status word removed, so "Kota Cilegon" and "Cilegon" are the same
 * lookup and are only ever sent to Biteship once.
 */
function queryKey(text: string): string {
    const tokens = new Set<string>();
    for (const token of tokenize(text)) {
        if (ADMIN_NOISE_TOKENS.has(token) || LEADING_STATUS_ABBREVIATIONS.has(token)) continue;
        tokens.add(token);
    }
    return [...tokens].sort().join(" ");
}

/**
 * Filter (broad/province-only suppression), de-duplicate and bound a query ladder.
 * A query whose normalized token set only repeats the province is dropped: with a
 * precise pin in hand a nationwide lookup such as "Jakarta" is never useful.
 */
function selectQueries(ladder: string[][], province: string): string[] {
    const provinceKey = queryKey(province);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const parts of ladder) {
        const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const key = queryKey(text);
        if (!key) continue;
        if (provinceKey && key === provinceKey) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(text);
        if (out.length >= MAX_AREA_SEARCH_QUERIES) break;
    }
    return out;
}

/**
 * Build an ordered, bounded, de-duplicated list of Biteship area search queries from
 * a reverse-geocoded address.
 *
 * Priority (most specific first):
 *   1. village + district + city + postcode
 *   2. district + city + postcode
 *   3. village + city + postcode
 *   4. postcode alone, 5. village alone — an official Biteship area label always
 *      contains both verbatim, so these single-token lookups have the highest recall
 *      when Biteship cannot match a multi-part string.
 *   6+ district + city, village + city, postcode + city, district alone,
 *      village + district and — only when nothing more specific exists — city alone.
 *
 * The PROVINCE is never part of a query, the total is capped by
 * MAX_AREA_SEARCH_QUERIES, and identical lookups (after normalization) are removed.
 */
export function buildAreaSearchQueries(address: AreaAddressInput): string[] {
    const village = queryLabel(address.village);
    const district = queryLabel(address.district);
    const city = queryLabel(address.city);
    const postcode = cleanPostcode(address.postcode);
    const province = queryLabel(address.province);

    const ladder: string[][] = [];
    if (village && district && city && postcode) ladder.push([village, district, city, postcode]);
    if (district && city && postcode) ladder.push([district, city, postcode]);
    if (village && city && postcode) ladder.push([village, city, postcode]);
    if (postcode) ladder.push([postcode]);
    if (village) ladder.push([village]);
    if (district && city) ladder.push([district, city]);
    if (village && city) ladder.push([village, city]);
    if (postcode && city) ladder.push([postcode, city]);
    if (district) ladder.push([district]);
    if (village && district) ladder.push([village, district]);
    if (!village && !district && !postcode && city) ladder.push([city]);

    return selectQueries(ladder, province);
}
