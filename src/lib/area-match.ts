/*
 * Pure, dependency-free Biteship area auto-match helpers.
 * Importable by both the checkout client and the node:test suite.
 *
 * The reverse-geocoded address NEVER fabricates a destinationAreaId — these
 * helpers only build search queries and rank OFFICIAL Biteship area results that
 * the server already returned from /v1/maps/areas.
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

function clean(value: string | null | undefined): string {
    return (value ?? "").trim();
}

const ADMIN_PREFIXES = new Set([
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
 * Normalize an administrative name for COMPARISON ONLY. It lowercases, trims,
 * collapses whitespace, strips light punctuation, and removes leading Indonesian
 * administrative prefixes ("Kabupaten Cianjur" -> "cianjur"). The original name
 * shown to the customer is never mutated by this helper.
 */
export function normalizeAreaName(value: string | null | undefined): string {
    const collapsed = (value ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    const tokens = collapsed.split(" ").filter(Boolean);
    const kept: string[] = [];
    for (const token of tokens) {
        // Only drop leading administrative prefixes (once a real word is kept,
        // keep everything that follows to preserve proper nouns).
        if (ADMIN_PREFIXES.has(token) && kept.length === 0) continue;
        kept.push(token);
    }
    return kept.join(" ");
}

/** Collapse whitespace for a secondary, conservative equality check. */
function tight(value: string): string {
    return value.replace(/\s+/g, "");
}

/** True when two normalized admin names refer to the same place. */
function equal(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    return tight(a) === tight(b);
}

function cleanPostcode(value: string | null | undefined): string {
    return (value ?? "").replace(/\s+/g, "").trim();
}

type ParsedName = {
    postcode: string;
    province: string;
    city: string;
    district: string;
    village: string;
};

const EMPTY_PARSED: ParsedName = { postcode: "", province: "", city: "", district: "", village: "" };

/**
 * Conservatively parse a Biteship area `name` label (e.g.
 * "Bojong, Karangtengah, Kabupaten Cianjur, Jawa Barat 43125") into admin parts.
 * Used only to fill structured fields the server did not provide.
 */
function parseAreaName(name: string | null | undefined): ParsedName {
    const s = clean(name);
    if (!s) return EMPTY_PARSED;

    const postcodeMatch = s.match(/(\d{5})\s*$/);
    const postcode = postcodeMatch ? postcodeMatch[1] : "";
    const withoutPostcode = s.replace(/\d{5}\s*$/, "").replace(/,\s*$/, "").trim();

    const parts = withoutPostcode.split(",").map((p) => p.trim()).filter(Boolean);

    return {
        postcode,
        province: parts[parts.length - 1] ?? "",
        city: parts[parts.length - 2] ?? "",
        district: parts[parts.length - 3] ?? "",
        village: parts.length >= 4 ? parts[0] : "",
    };
}

/**
 * Build an ordered list of Biteship area search queries from a reverse-geocoded
 * address, from most specific to least specific. Province is intentionally not
 * appended to every query (it makes Biteship search too narrow). Queries are
 * deduplicated on their normalized form.
 */
export function buildAreaSearchQueries(address: AreaAddressInput): string[] {
    const village = clean(address.village);
    const district = clean(address.district);
    const city = clean(address.city);
    const postcode = clean(address.postcode);

    const raw = [
        [village, district, city, postcode],
        [village, district, city],
        [district, city, postcode],
        [district, city],
        [village, city, postcode],
        [village, city],
        [city, postcode],
        [city],
    ]
        .map((parts) => parts.filter(Boolean).join(" "))
        .filter(Boolean);

    const seen = new Set<string>();
    const out: string[] = [];
    for (const q of raw) {
        const key = normalizeAreaName(q);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(q);
    }
    return out;
}

type NormalizedAddress = {
    postcode: string;
    province: string;
    city: string;
    district: string;
    village: string;
};

function normalizeAddress(address: AreaAddressInput): NormalizedAddress {
    return {
        postcode: cleanPostcode(address.postcode),
        province: normalizeAreaName(address.province),
        city: normalizeAreaName(address.city),
        district: normalizeAreaName(address.district),
        village: normalizeAreaName(address.village),
    };
}

function effectiveArea(area: AreaCandidate): NormalizedAddress {
    const parsed = parseAreaName(area.name);
    return {
        postcode: cleanPostcode(area.postalCode) || cleanPostcode(parsed.postcode),
        province: normalizeAreaName(area.province) || normalizeAreaName(parsed.province),
        city: normalizeAreaName(area.city) || normalizeAreaName(parsed.city),
        district: normalizeAreaName(area.district) || normalizeAreaName(parsed.district),
        village: normalizeAreaName(area.village) || normalizeAreaName(parsed.village),
    };
}

export type AreaMatchScore = {
    total: number;
    reasons: string[];
    conflicts: string[];
};

/**
 * Score one official Biteship candidate against the reverse-geocoded address.
 * Positive points are awarded for exact administrative matches (postal code >
 * city > district > village > province). Candidates with conflicting
 * administrative components (different city/district/postcode) are heavily
 * penalized, so a mere HTTP 200 from Biteship is never treated as a match.
 */
export function scoreAreaCandidate(area: AreaCandidate, address: AreaAddressInput): AreaMatchScore {
    const a = normalizeAddress(address);
    const b = effectiveArea(area);
    const score: AreaMatchScore = { total: 0, reasons: [], conflicts: [] };

    const add = (points: number, field: string) => { score.total += points; score.reasons.push(field); };
    const sub = (points: number, field: string) => { score.total -= points; score.conflicts.push(field); };

    if (a.postcode && b.postcode) {
        if (a.postcode === b.postcode) add(45, "postcode");
        else sub(35, "postcode");
    }
    if (a.city && b.city) {
        if (equal(a.city, b.city)) add(40, "city");
        else sub(60, "city");
    }
    if (a.district && b.district) {
        if (equal(a.district, b.district)) add(30, "district");
        else sub(40, "district");
    }
    if (a.village && b.village) {
        if (equal(a.village, b.village)) add(25, "village");
        else sub(20, "village");
    }
    if (a.province && b.province) {
        if (equal(a.province, b.province)) add(15, "province");
        else sub(20, "province");
    }

    return score;
}

const STRONG_MATCH_THRESHOLD = 60;

/**
 * Rank official Biteship area candidates and return the single best match, or
 * null when no candidate crosses the strong-match threshold. Never falls back to
 * the first result (areas[0]).
 */
export function pickBestAreaMatch(areas: AreaCandidate[], address: AreaAddressInput): AreaCandidate | null {
    let best: AreaCandidate | null = null;
    let bestScore = -Infinity;

    for (const area of areas) {
        if (!area?.id && !area?.name) continue;
        const { total } = scoreAreaCandidate(area, address);
        if (total > bestScore) {
            bestScore = total;
            best = area;
        }
    }

    return bestScore >= STRONG_MATCH_THRESHOLD ? best : null;
}
