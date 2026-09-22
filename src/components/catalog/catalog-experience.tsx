"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, ChevronLeft, ChevronRight, Heart, LayoutGrid, Search, ShoppingCart, SlidersHorizontal, Star, User, X } from "lucide-react";
import { CatalogProductCard } from "@/components/catalog/catalog-product-card";
import ProductImage from "@/components/product-image";
import { useCart } from "@/context/cart-context";
import { useWishlist } from "@/context/wishlist-context";
import { hasAuthenticatedUser, loginPath, whatsappUrl } from "@/lib/client-auth";
import type { Product } from "@/lib/products";
import {
    CATALOG_SORT_LABELS,
    buildCatalogHref,
    hasActiveCatalogFilters,
    type CatalogQuery,
    type CatalogSort,
} from "@/lib/catalog";

export type CatalogCategory = { id: string; name: string; slug: string; count: number; image: string | null };

type Props = {
    products: Product[];
    categories: CatalogCategory[];
    totalActive: number;
    query: CatalogQuery;
    total: number;
    totalPages: number;
    currentPage: number;
};

const RATING_OPTIONS = [4, 3] as const;

export default function CatalogExperience({ products, categories, totalActive, query, total, totalPages, currentPage }: Props) {
    const router = useRouter();
    const { totalItems, addToCart, toast: cartToast, dismissToast } = useCart();
    const { toast: wishToast, toggleWishlist, isWishlisted } = useWishlist();

    const [addState, setAddState] = useState<Record<string, "adding" | "added">>({});
    const [searchInput, setSearchInput] = useState(query.search);
    const [minPriceInput, setMinPriceInput] = useState(query.minPrice != null ? String(query.minPrice) : "");
    const [maxPriceInput, setMaxPriceInput] = useState(query.maxPrice != null ? String(query.maxPrice) : "");
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Keep local inputs in sync when the URL changes from outside this island
    // (browser back/forward, refresh, category tile clicks, clear filter).
    useEffect(() => setSearchInput(query.search), [query.search]);
    useEffect(() => setMinPriceInput(query.minPrice != null ? String(query.minPrice) : ""), [query.minPrice]);
    useEffect(() => setMaxPriceInput(query.maxPrice != null ? String(query.maxPrice) : ""), [query.maxPrice]);

    const activeCategoryName = useMemo(
        () => categories.find((category) => category.slug === query.category)?.name ?? null,
        [categories, query.category],
    );

    const navigate = useCallback(
        (overrides: Partial<CatalogQuery>) => {
            router.push(buildCatalogHref(query, overrides), { scroll: false });
        },
        [query, router],
    );

    const submitSearch = useCallback(
        (event: React.FormEvent) => {
            event.preventDefault();
            navigate({ search: searchInput.trim(), page: 1 });
        },
        [navigate, searchInput],
    );

    const applyPrice = useCallback(() => {
        const min = minPriceInput.trim() === "" ? null : Math.max(0, Number.parseInt(minPriceInput, 10) || 0);
        const max = maxPriceInput.trim() === "" ? null : Math.max(0, Number.parseInt(maxPriceInput, 10) || 0);
        navigate({ minPrice: min, maxPrice: max, page: 1 });
    }, [navigate, minPriceInput, maxPriceInput]);

    const clearFilters = useCallback(() => router.push("/produk", { scroll: false }), [router]);

    const requireAuth = useCallback(
        async (next: string) => {
            if (!(await hasAuthenticatedUser())) {
                router.push(loginPath(next));
                return false;
            }
            return true;
        },
        [router],
    );

    const addCart = useCallback(
        async (item: Product) => {
            if (addState[item.id]) return;
            if (!(await requireAuth("/produk"))) return;
            setAddState((current) => ({ ...current, [item.id]: "adding" }));
            const added = await addToCart(item);
            if (added) {
                setAddState((current) => ({ ...current, [item.id]: "added" }));
                window.setTimeout(() => {
                    setAddState((current) => {
                        const next = { ...current };
                        delete next[item.id];
                        return next;
                    });
                }, 1000);
            } else {
                setAddState((current) => {
                    const next = { ...current };
                    delete next[item.id];
                    return next;
                });
            }
        },
        [addState, addToCart, requireAuth],
    );

    const buyNow = useCallback(
        async (item: Product) => {
            if (!(await requireAuth("/checkout"))) return;
            try {
                const response = await fetch("/api/cart/buy-now", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: item.id, qty: 1 }),
                });
                const data = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
                if (!response.ok) return;
                router.push(data?.redirectTo || "/checkout");
            } catch {
                router.push("/login");
            }
        },
        [requireAuth, router],
    );

    const onWish = useCallback(
        (item: Product) => toggleWishlist({ id: item.id, name: item.name, price: item.price, image: item.image }),
        [toggleWishlist],
    );

    const showClear = hasActiveCatalogFilters(query);

    const sortButtons: CatalogSort[] = ["recommended", "newest", "rating"];

    const categoryList = (
        <nav aria-label="Semua kategori" className="flex flex-col gap-1.5">
            <CategoryLink label="Semua Produk" count={totalActive} active={!query.category} href={buildCatalogHref(query, { category: "", page: 1 })} />
            {categories.map((category) => (
                <CategoryLink
                    key={category.id}
                    label={category.name}
                    count={category.count}
                    active={query.category === category.slug}
                    href={buildCatalogHref(query, { category: category.slug, page: 1 })}
                />
            ))}
        </nav>
    );

    const filterBlock = (
        <div className="space-y-5">
            <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8B6B3F]">Harga</p>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={minPriceInput}
                        onChange={(event) => setMinPriceInput(event.target.value)}
                        placeholder="Minimum"
                        aria-label="Harga minimum"
                        className="w-full rounded-lg border border-[#C9A45B]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[#C9A45B]"
                    />
                    <span className="text-[#8B6B3F]">—</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={maxPriceInput}
                        onChange={(event) => setMaxPriceInput(event.target.value)}
                        placeholder="Maksimum"
                        aria-label="Harga maksimum"
                        className="w-full rounded-lg border border-[#C9A45B]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[#C9A45B]"
                    />
                </div>
                <button
                    type="button"
                    onClick={applyPrice}
                    className="mt-2 w-full rounded-lg border border-[#123524]/20 bg-[#123524] py-2 text-xs font-bold text-white transition hover:bg-[#1c5138]"
                >
                    Terapkan Harga
                </button>
            </div>

            <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8B6B3F]">Stok</p>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#123524]">
                    <input
                        type="checkbox"
                        checked={query.inStock}
                        onChange={(event) => navigate({ inStock: event.target.checked, page: 1 })}
                        className="h-4 w-4 rounded border-[#C9A45B]/50 accent-[#123524]"
                    />
                    Stok tersedia
                </label>
            </div>

            <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8B6B3F]">Rating</p>
                <div className="flex flex-col gap-1.5">
                    {RATING_OPTIONS.map((value) => {
                        const active = query.minRating === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => navigate({ minRating: active ? null : value, page: 1 })}
                                aria-pressed={active}
                                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${active ? "border-[#C9A45B] bg-[#F8F5EE] font-semibold text-[#123524]" : "border-transparent text-[#8B6B3F] hover:border-[#C9A45B]/20 hover:bg-[#F8F5EE]"}`}
                            >
                                <span className="flex items-center gap-0.5">
                                    {Array.from({ length: 5 }).map((_, index) => (
                                        <Star key={index} size={13} className={index < value ? "fill-[#C9A45B] text-[#C9A45B]" : "text-[#C9A45B]/30"} />
                                    ))}
                                </span>
                                ke atas
                            </button>
                        );
                    })}
                </div>
            </div>

            {showClear && (
                <button type="button" onClick={clearFilters} className="w-full rounded-lg border border-[#C9A45B]/40 py-2 text-xs font-bold text-[#A7833A] transition hover:bg-[#F8F5EE]">
                    Hapus Filter
                </button>
            )}
        </div>
    );

    return (
        <main className="min-h-screen bg-[#F8F5EE] text-[#123524]">
            <WishlistToast message={wishToast} />
            <CartToast toast={cartToast} onDismiss={dismissToast} />

            <header className="sticky top-0 z-40 border-b border-[#C9A45B]/15 bg-[#F8F5EE]/90 shadow-[0_6px_24px_rgba(18,53,36,0.06)] backdrop-blur-xl">
                <div className="mx-auto flex min-h-[68px] w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6">
                    <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-xl font-bold">
                        <Image src="/AFA LOGO.svg" alt="AFA STORE" width={80} height={120} className="h-12 w-9 object-contain" priority sizes="36px" />
                        <span className="hidden sm:inline">AFA STORE</span>
                    </Link>
                    <Link href="/produk" aria-current="page" className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#C9A45B] bg-[#C9A45B]/10 px-3 text-sm font-bold text-[#123524] shadow-sm sm:px-4">Belanja</Link>
                    <form onSubmit={submitSearch} className="flex flex-1 items-center rounded-full border border-[#C9A45B]/25 bg-white px-4 py-2 shadow-sm">
                        <input
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            placeholder="Cari produk AFA STORE..."
                            aria-label="Cari produk"
                            className="w-full bg-transparent text-sm outline-none placeholder:text-[#8B6B3F]/70"
                        />
                        <button type="submit" aria-label="Cari" className="grid h-8 w-8 place-items-center text-[#C9A45B]">
                            <Search size={18} />
                        </button>
                    </form>
                    <Link href="/wishlist" aria-label="Wishlist" className="grid h-10 w-10 place-items-center text-[#123524] transition hover:text-[#C9A45B]">
                        <Heart size={20} />
                    </Link>
                    <Link href="/account" aria-label="Akun" className="grid h-10 w-10 place-items-center text-[#123524] transition hover:text-[#C9A45B]">
                        <User size={20} />
                    </Link>
                </div>
            </header>

            <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-5">
                <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm text-[#8B6B3F]">
                    <Link href="/" className="font-semibold hover:text-[#123524]">Beranda</Link>
                    <ChevronRight size={15} aria-hidden="true" />
                    <span aria-current="page" className="text-[#123524]">Katalog{activeCategoryName ? ` · ${activeCategoryName}` : ""}</span>
                </nav>

                {categories.length > 0 && (
                    <CategoryTiles categories={categories} activeSlug={query.category} query={query} />
                )}

                {/* Mobile toolbar: Filter + Urutkan open a bottom sheet. */}
                <div className="mt-6 flex items-center gap-3 lg:hidden">
                    <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#C9A45B]/30 bg-white py-2.5 text-sm font-bold text-[#123524] shadow-sm"
                    >
                        <SlidersHorizontal size={16} /> Filter
                    </button>
                    <div className="flex-1">
                        <label htmlFor="mobile-sort" className="sr-only">Urutkan</label>
                        <select
                            id="mobile-sort"
                            value={query.sort}
                            onChange={(event) => navigate({ sort: event.target.value as CatalogSort, page: 1 })}
                            className="w-full rounded-full border border-[#C9A45B]/30 bg-white py-2.5 pl-4 pr-8 text-sm font-bold text-[#123524] shadow-sm"
                        >
                            {(Object.keys(CATALOG_SORT_LABELS) as CatalogSort[]).map((value) => (
                                <option key={value} value={value}>{CATALOG_SORT_LABELS[value]}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[216px_minmax(0,1fr)] xl:gap-5">
                    {/* Desktop sidebar */}
                    <aside className="hidden lg:block">
                        <div className="sticky top-24 space-y-6">
                            <div className="rounded-2xl border border-[#C9A45B]/15 bg-white p-4 shadow-sm">
                                <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[#123524]">
                                    <LayoutGrid size={16} className="text-[#C9A45B]" /> Semua Kategori
                                </p>
                                {categoryList}
                            </div>
                            <div className="rounded-2xl border border-[#C9A45B]/15 bg-white p-4 shadow-sm">
                                <p className="mb-3 text-sm font-bold text-[#123524]">Filter</p>
                                {filterBlock}
                            </div>
                        </div>
                    </aside>
                    {/* Catalog main column */}
                    <section aria-label="Daftar produk" className="min-w-0">
                        <div className="catalog-toolbar mb-4 flex min-h-[52px] flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#123524]/[0.08] bg-white px-4 py-2.5 shadow-[0_5px_18px_rgba(18,53,36,0.045)]">
                            <div className="hidden items-center gap-2 sm:flex">
                                <span className="text-sm font-semibold text-[#8B6B3F]">Urutkan</span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {sortButtons.map((value) => (
                                        <SortButton key={value} active={query.sort === value} label={CATALOG_SORT_LABELS[value]} href={buildCatalogHref(query, { sort: value, page: 1 })} />
                                    ))}
                                    <PriceSortToggle query={query} navigate={navigate} />
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-[#123524]" aria-live="polite">{currentPage} / {totalPages}</span>
                                {totalPages > 1 && (
                                    <div className="flex items-center gap-1">
                                        <PageArrow direction="prev" disabled={currentPage <= 1} href={buildCatalogHref(query, { page: currentPage - 1 })} />
                                        <PageArrow direction="next" disabled={currentPage >= totalPages} href={buildCatalogHref(query, { page: currentPage + 1 })} />
                                    </div>
                                )}
                            </div>
                        </div>

                        <p className="mb-3 px-1 text-xs font-medium text-[#8B6B3F] sm:text-sm">
                            <span className="font-semibold text-[#123524]">{total}</span> produk ditemukan
                        </p>

                        {products.length === 0 ? (
                            <div className="rounded-2xl border border-[#C9A45B]/20 bg-white p-10 text-center shadow-sm">
                                <Search size={40} className="mx-auto text-[#C9A45B]/50" aria-hidden="true" />
                                <h2 className="mt-4 font-display text-2xl font-bold text-[#123524]">Produk tidak ditemukan</h2>
                                <p className="mx-auto mt-2 max-w-md text-[#8B6B3F]">Coba ubah kata pencarian atau filter Anda.</p>
                                <button type="button" onClick={clearFilters} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#123524] px-6 py-2.5 font-bold text-white transition hover:bg-[#1c5138]">
                                    Hapus Filter
                                </button>
                            </div>
                        ) : (
                            <div className="catalog-grid grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 xl:gap-4">
                                {products.map((product) => (
                                    <CatalogProductCard
                                        key={product.id}
                                        item={product}
                                        wish={isWishlisted(product.id)}
                                        addState={addState[product.id]}
                                        onAdd={() => void addCart(product)}
                                        onBuy={() => void buyNow(product)}
                                        onWish={() => onWish(product)}
                                    />
                                ))}
                            </div>
                        )}

                        {totalPages > 1 && (
                            <div className="mt-8 flex items-center justify-center gap-2">
                                <PageArrow direction="prev" disabled={currentPage <= 1} href={buildCatalogHref(query, { page: currentPage - 1 })} large />
                                <span className="px-3 text-sm font-bold text-[#123524]">Halaman {currentPage} / {totalPages}</span>
                                <PageArrow direction="next" disabled={currentPage >= totalPages} href={buildCatalogHref(query, { page: currentPage + 1 })} large />
                            </div>
                        )}
                    </section>
                </div>
            </div>
            {/* Mobile filter drawer / bottom sheet */}
            <AnimatePresence>
                {drawerOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setDrawerOpen(false)}
                            className="fixed inset-0 z-50 bg-black/40 lg:hidden"
                        />
                        <motion.aside
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "tween", duration: 0.25 }}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Filter produk"
                            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-auto rounded-t-3xl bg-[#F8F5EE] p-5 shadow-2xl lg:hidden"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="font-display text-lg font-bold text-[#123524]">Filter &amp; Kategori</h2>
                                <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Tutup filter" className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="rounded-2xl border border-[#C9A45B]/15 bg-white p-4">
                                <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[#123524]"><LayoutGrid size={16} className="text-[#C9A45B]" /> Semua Kategori</p>
                                {categoryList}
                            </div>
                            <div className="mt-4 rounded-2xl border border-[#C9A45B]/15 bg-white p-4">
                                <p className="mb-3 text-sm font-bold text-[#123524]">Filter</p>
                                {filterBlock}
                            </div>
                            <button type="button" onClick={() => setDrawerOpen(false)} className="mt-4 w-full rounded-full bg-[#123524] py-3 font-bold text-white">
                                Lihat Produk
                            </button>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Floating helpers: cart, WhatsApp, back-to-top. */}
            <Link href="/cart" aria-label={totalItems > 0 ? `Keranjang, ${totalItems} item` : "Keranjang"} className="fixed bottom-[156px] right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-white/90 text-[#123524] shadow-[0_5px_16px_rgba(18,53,36,0.12)] transition hover:scale-105 active:scale-95">
                <span className="relative grid h-10 w-10 place-items-center">
                    <ShoppingCart size={28} strokeWidth={2.2} className="drop-shadow-[0_3px_4px_rgba(18,53,36,0.35)]" />
                    {totalItems > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#C9A45B] px-1.5 text-[10px] font-bold text-white">{totalItems > 99 ? "99+" : totalItems}</span>}
                </span>
            </Link>
            {whatsappUrl("Halo AFA STORE, saya ingin bertanya tentang produk Anda.") && (
                <a
                    href={whatsappUrl("Halo AFA STORE, saya ingin bertanya tentang produk Anda.")!}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Chat WhatsApp"
                    className="fixed bottom-[96px] right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-white/90 text-[#25D366] shadow-[0_5px_16px_rgba(18,53,36,0.12)] transition hover:scale-105 active:scale-95"
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-7 w-7 drop-shadow-[0_3px_4px_rgba(37,211,102,0.40)]">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z" />
                    </svg>
                </a>
            )}
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Kembali ke atas" className="fixed bottom-5 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-white/90 text-[#C9A45B] shadow-[0_5px_16px_rgba(18,53,36,0.12)] transition hover:scale-105 active:scale-95">
                <ArrowUp size={28} strokeWidth={2.4} className="drop-shadow-[0_3px_4px_rgba(201,164,91,0.45)]" />
            </button>
        </main>
    );
}

function CategoryLink({ label, count, active, href }: { label: string; count: number; active: boolean; href: string }) {
    return (
        <Link
            href={href}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition ${active ? "bg-[#F8F5EE] font-semibold text-[#123524]" : "text-[#5c5346] hover:bg-[#F8F5EE]"}`}
        >
            <span className="flex items-center gap-2 truncate">
                {active && <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full bg-[#C9A45B]" />}
                <span className="truncate">{label}</span>
            </span>
            <span className="shrink-0 text-xs text-[#8B6B3F]">{count}</span>
        </Link>
    );
}

function SortButton({ active, label, href }: { active: boolean; label: string; href: string }) {
    return (
        <Link
            href={href}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${active ? "bg-[#123524] text-white" : "text-[#5c5346] hover:bg-[#F8F5EE]"}`}
        >
            {label}
        </Link>
    );
}

function PriceSortToggle({ query, navigate }: { query: CatalogQuery; navigate: (overrides: Partial<CatalogQuery>) => void }) {
    const active = query.sort === "price_asc" || query.sort === "price_desc";
    const next: CatalogSort = query.sort === "price_asc" ? "price_desc" : "price_asc";
    const label = query.sort === "price_asc" ? "Harga ↑" : query.sort === "price_desc" ? "Harga ↓" : "Harga";
    return (
        <button
            type="button"
            onClick={() => navigate({ sort: next, page: 1 })}
            aria-pressed={active}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${active ? "bg-[#123524] text-white" : "text-[#5c5346] hover:bg-[#F8F5EE]"}`}
        >
            {label}
        </button>
    );
}

function PageArrow({ direction, disabled, href, large }: { direction: "prev" | "next"; disabled: boolean; href: string; large?: boolean }) {
    const size = large ? "h-10 w-10" : "h-8 w-8";
    const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
    const label = direction === "prev" ? "Halaman sebelumnya" : "Halaman berikutnya";
    if (disabled) {
        return (
            <span aria-disabled="true" aria-label={label} className={`grid ${size} cursor-not-allowed place-items-center rounded-full border border-[#C9A45B]/20 bg-[#F0EAE0] text-[#C9A45B]/40`}>
                <Icon size={18} />
            </span>
        );
    }
    return (
        <Link href={href} scroll={false} aria-label={label} className={`grid ${size} place-items-center rounded-full border border-[#C9A45B]/30 bg-white text-[#123524] transition hover:border-[#C9A45B] hover:bg-[#F8F5EE]`}>
            <Icon size={18} />
        </Link>
    );
}
function CategoryTiles({ categories, activeSlug, query }: { categories: CatalogCategory[]; activeSlug: string; query: CatalogQuery }) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const [overflowing, setOverflowing] = useState(false);

    useEffect(() => {
        const element = scrollerRef.current;
        if (!element) return;
        const check = () => setOverflowing(element.scrollWidth > element.clientWidth + 4);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, [categories.length]);

    const scrollBy = (amount: number) => scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });

    return (
        <section aria-labelledby="kategori-pilihan" className="catalog-category-section scroll-mt-[76px] overflow-visible rounded-2xl border border-[#C9A45B]/15 bg-white p-4 shadow-[0_8px_24px_rgba(18,53,36,0.04)] sm:p-5">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#A7833A]">Kategori Pilihan</p>
                    <div className="flex items-end justify-between gap-3">
                        <h2 id="kategori-pilihan" className="mt-1 font-display text-xl font-bold text-[#123524] sm:text-2xl">Belanja per Kategori</h2>
                        <Link href="/produk" scroll={false} className="shrink-0 pb-0.5 text-xs font-bold text-[#A7833A] transition hover:text-[#123524] sm:text-sm">Lihat Semua</Link>
                    </div>
                </div>
                {overflowing && (
                    <div className="hidden items-center gap-1.5 sm:flex">
                        <button type="button" onClick={() => scrollBy(-320)} aria-label="Kategori sebelumnya" className="grid h-9 w-9 place-items-center rounded-full border border-[#C9A45B]/30 bg-white text-[#123524] transition hover:bg-[#F8F5EE]">
                            <ChevronLeft size={18} />
                        </button>
                        <button type="button" onClick={() => scrollBy(320)} aria-label="Kategori berikutnya" className="grid h-9 w-9 place-items-center rounded-full border border-[#C9A45B]/30 bg-white text-[#123524] transition hover:bg-[#F8F5EE]">
                            <ChevronRight size={18} />
                        </button>
                    </div>
                )}
            </div>
            <div ref={scrollerRef} className="catalog-tiles flex snap-x gap-3 overflow-x-auto pb-1">
                {categories.map((category) => {
                    const active = activeSlug === category.slug;
                    return (
                        <Link
                            key={category.id}
                            href={buildCatalogHref(query, { category: active ? "" : category.slug, page: 1 })}
                            scroll={false}
                            aria-current={active ? "true" : undefined}
                            className={`night-category-card group flex w-[116px] shrink-0 snap-start flex-col items-center gap-2 rounded-xl border p-3 text-center transition sm:w-[132px] ${active ? "border-[#C9A45B] bg-[#F8F5EE] shadow-sm" : "border-[#C9A45B]/15 bg-white hover:border-[#C9A45B]/40"}`}
                        >
                            <span className="night-category-image-stage night-category-media-surface relative grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-[#FBF4E8] sm:h-[72px] sm:w-[72px]">
                                <ProductImage src={category.image} alt={category.name} sizes="72px" imgClassName="p-1.5" />
                            </span>
                            <span className={`line-clamp-2 text-xs font-semibold leading-tight ${active ? "text-[#123524]" : "text-[#5c5346] group-hover:text-[#123524]"}`}>{category.name}</span>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
function WishlistToast({ message }: { message: string }) {
    return (
        <AnimatePresence>
            {message && (
                <motion.div
                    initial={{ opacity: 0, y: -18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -18, scale: 0.96 }}
                    role="status"
                    aria-live="polite"
                    className="fixed left-1/2 top-5 z-[100] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-full border border-[#C9A45B]/30 bg-white px-5 py-3 text-center font-semibold text-[#2E2A26] shadow-[0_18px_45px_rgba(46,42,38,0.16)]"
                >
                    {message}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function CartToast({ toast, onDismiss }: { toast: { title: string; message: string; variant: "success" | "error" } | null; onDismiss: () => void }) {
    return (
        <AnimatePresence>
            {toast && (
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 24, scale: 0.98 }}
                    role="status"
                    aria-live="polite"
                    className="fixed inset-x-0 bottom-5 z-[100] flex justify-center px-4 md:inset-x-auto md:bottom-6 md:right-6 md:justify-end"
                >
                    <div className="w-full max-w-sm rounded-2xl border border-[#C9A45B]/30 bg-white p-4 text-[#2E2A26] shadow-[0_18px_45px_rgba(46,42,38,0.18)] md:w-96">
                        <div className="flex items-start gap-3">
                            <span aria-hidden="true" className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-bold text-white ${toast.variant === "success" ? "bg-[#2e7d32]" : "bg-[#c62828]"}`}>{toast.variant === "success" ? "✓" : "!"}</span>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold leading-tight">{toast.title}</p>
                                <p className="mt-1 break-words text-sm text-[#8B6B3F]">{toast.message}</p>
                                {toast.variant === "success" && (
                                    <Link href="/cart" onClick={onDismiss} className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-[#123524] px-4 py-1.5 text-sm font-bold text-white transition hover:bg-[#1c5138]">Lihat Keranjang</Link>
                                )}
                            </div>
                            <button type="button" onClick={onDismiss} aria-label="Tutup notifikasi" className="text-[#8B6B3F] transition hover:text-[#2E2A26]"><X size={18} /></button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

