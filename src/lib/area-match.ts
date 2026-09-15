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
};

function clean(value: string | null | undefined): string {
    return (value ?? "").trim();
}

/**
 * Build an ordered list of Biteship area search queries from a reverse-geocoded
 * address, from most specific to least specific. The caller tries each query in
 * order against the official area search and stops at the first that yields a
 * result — this is the primary matching mechanism.
 */
export function buildAreaSearchQueries(address: AreaAddressInput): string[] {
    const village = clean(address.village);
    const district = clean(address.district);
    const city = clean(address.city);
    const postcode = clean(address.postcode);

    const queries: string[] = [];
    const push = (q: string) => {
        if (q && !queries.includes(q)) queries.push(q);
    };

    push([village, district, city, postcode].filter(Boolean).join(" "));
    push([district, city, postcode].filter(Boolean).join(" "));
    push([district, city].filter(Boolean).join(" "));
    push([village, city].filter(Boolean).join(" "));
    push(city);
    push(district);
    push(village);

    return queries;
}

/**
 * Rank official Biteship area candidates against the reverse-geocoded address and
 * return the single best match (or null when nothing is strong enough). Prefers
 * the most specific administrative level (kelurahan/desa over kecamatan).
 */
export function pickBestAreaMatch(areas: AreaCandidate[], address: AreaAddressInput): AreaCandidate | null {
    const village = clean(address.village).toLowerCase();
    const district = clean(address.district).toLowerCase();
    const city = clean(address.city).toLowerCase();

    let best: AreaCandidate | null = null;
    let bestScore = -1;

    for (const area of areas) {
        const name = clean(area.name).toLowerCase();
        const areaDistrict = clean(area.district).toLowerCase();
        const areaCity = clean(area.city).toLowerCase();
        if (!name) continue;

        let score = 0;
        if (village && name === village) score += 40;
        if (district && name === district) score += 25;
        if (city && name === city) score += 10;
        if (village && district && name.includes(village) && areaDistrict.includes(district)) score += 15;
        if (district && areaDistrict === district) score += 12;
        if (village && district && name === village && areaDistrict === district) score += 30;
        if (city && areaCity === city) score += 6;

        // Prefer the most specific administrative level when scores are close.
        if (area.type === "level_4") score += 5;
        else if (area.type === "level_3") score += 3;

        if (score > bestScore) {
            bestScore = score;
            best = area;
        }
    }

    return bestScore >= 10 ? best : null;
}
