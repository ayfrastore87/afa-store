// ---------------------------------------------------------------------------
// Shared, framework-agnostic helpers for the /produk marketplace catalog.
//
// This module is pure (no "use client" / no "server-only") so BOTH the server
// catalog page and the client filter/sort/pagination islands can import the
// same whitelist, parser, and URL builder. Every sort/filter here maps to a
// REAL Prisma field on the Product model (price, rating, stock, createdAt,
// name, flavor, description, category.slug). No fabricated metrics.
// ---------------------------------------------------------------------------

/** Products per catalog page. Chosen to fill 2/3/4/5-column responsive grids. */
export const CATALOG_PAGE_SIZE = 24;

/** Whitelisted sort keys. Never trust a raw query value for Prisma orderBy. */
export const CATALOG_SORTS = ["recommended", "newest", "rating", "price_asc", "price_desc"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
    recommended: "Rekomendasi",
    newest: "Terbaru",
    rating: "Rating",
    price_asc: "Harga Terendah",
    price_desc: "Harga Tertinggi",
};

/** Toolbar order (Harga is presented as a single toggle group in the UI). */
export const CATALOG_SORT_ORDER: CatalogSort[] = ["recommended", "newest", "rating", "price_asc", "price_desc"];

export type CatalogQuery = {
    search: string;
    /** Category slug. Empty string means "Semua Produk". */
    category: string;
    sort: CatalogSort;
    page: number;
    minPrice: number | null;
    maxPrice: number | null;
    inStock: boolean;
    /** Minimum product rating (1-5). Rating is a real Product field. */
    minRating: number | null;
};

type RawParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? "";
    return value ?? "";
}

function toNonNegativeInt(value: string, fallback: number | null = null): number | null {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
}

/** Parse & sanitise raw searchParams into a validated, whitelisted query. */
export function parseCatalogQuery(params: RawParams): CatalogQuery {
    const sortRaw = firstValue(params.sort);
    const sort: CatalogSort = (CATALOG_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as CatalogSort) : "recommended";

    const pageParsed = toNonNegativeInt(firstValue(params.page), 1) ?? 1;
    const page = pageParsed < 1 ? 1 : pageParsed;

    const ratingParsed = toNonNegativeInt(firstValue(params.minRating));
    const minRating = ratingParsed && ratingParsed >= 1 && ratingParsed <= 5 ? ratingParsed : null;

    return {
        search: firstValue(params.search).trim().slice(0, 100),
        category: firstValue(params.category).trim().slice(0, 120),
        sort,
        page,
        minPrice: toNonNegativeInt(firstValue(params.minPrice)),
        maxPrice: toNonNegativeInt(firstValue(params.maxPrice)),
        inStock: firstValue(params.inStock) === "1",
        minRating,
    };
}

/**
 * Build a `/produk` href from a base query plus overrides. Anything that
 * changes the result set (category/sort/filter/search) should pass
 * `{ page: 1 }` so pagination resets — the UI does exactly that.
 */
export function buildCatalogHref(base: Partial<CatalogQuery>, overrides: Partial<CatalogQuery> = {}): string {
    const merged = { ...base, ...overrides };
    const sp = new URLSearchParams();

    if (merged.search) sp.set("search", merged.search);
    if (merged.category) sp.set("category", merged.category);
    if (merged.sort && merged.sort !== "recommended") sp.set("sort", merged.sort);
    if (merged.minPrice != null) sp.set("minPrice", String(merged.minPrice));
    if (merged.maxPrice != null) sp.set("maxPrice", String(merged.maxPrice));
    if (merged.inStock) sp.set("inStock", "1");
    if (merged.minRating != null) sp.set("minRating", String(merged.minRating));
    if (merged.page && merged.page > 1) sp.set("page", String(merged.page));

    const qs = sp.toString();
    return qs ? `/produk?${qs}` : "/produk";
}

/** True when any narrowing filter/search/category is active. */
export function hasActiveCatalogFilters(query: CatalogQuery): boolean {
    return Boolean(
        query.search ||
        query.category ||
        query.minPrice != null ||
        query.maxPrice != null ||
        query.inStock ||
        query.minRating != null,
    );
}
