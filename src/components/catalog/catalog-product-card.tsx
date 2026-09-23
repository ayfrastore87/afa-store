"use client";

import Link from "next/link";
import { Check, Heart, ShoppingCart, Star } from "lucide-react";
import ProductImage from "@/components/product-image";
import type { Product } from "@/lib/products";
import { formatRupiah } from "@/lib/products";

interface CatalogProductCardProps {
    item: Product;
    onAdd: () => void;
    onBuy: () => void;
    onWish: () => void;
    wish: boolean;
    addState?: "adding" | "added";
}

/**
 * Compact, marketplace-style product card for the /produk catalog grid.
 *
 * Dominant image (aspect-square, object-contain, no crop), then name
 * (line-clamp-2), size, real rating, and bold dark-green price. Actions stay
 * compact: an icon "+ Keranjang" button plus a small "Beli Sekarang" — the
 * existing buy-now logic is preserved, just visually smaller than on the
 * detail page. Image and name link to /produk/[slug] using the real DB slug;
 * interactive buttons never nest inside the link so there is no invalid markup
 * or double navigation.
 */
export function CatalogProductCard({ item, onAdd, onBuy, onWish, wish, addState }: CatalogProductCardProps) {
    const outOfStock = item.stock <= 0;

    return (
        <article className="catalog-card group flex h-full min-w-0 flex-col overflow-hidden rounded-[16px] border border-[#123524]/[0.08] bg-white shadow-[0_5px_18px_rgba(18,53,36,0.055)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C9A45B]/40 hover:shadow-[0_12px_28px_rgba(18,53,36,0.11)]">
            <div className="catalog-card-image night-image-stage relative w-full overflow-hidden bg-gradient-to-br from-[#FDF8F3] via-white to-[#FBF4E8]">
                <button
                    type="button"
                    onClick={onWish}
                    aria-pressed={wish}
                    aria-label={wish ? `Hapus ${item.name} dari wishlist` : `Tambah ${item.name} ke wishlist`}
                    className="night-wishlist absolute right-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-[0_3px_10px_rgba(18,53,36,0.12)] backdrop-blur transition-transform hover:scale-105 active:scale-95"
                >
                    <Heart size={16} fill={wish ? "#D14343" : "none"} className={wish ? "text-[#D14343]" : "text-[#C9A45B]"} />
                </button>

                {item.badge && (
                    <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-[#C9A45B] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                        {item.badge}
                    </span>
                )}

                {outOfStock && (
                    <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-[#5C625B]/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white shadow-sm">
                        Stok Habis
                    </span>
                )}

                <Link
                    href={`/produk/${item.slug}`}
                    aria-label={`Lihat detail ${item.name}`}
                    className="relative flex aspect-square w-full items-center justify-center p-1 sm:p-2"
                >
                    <ProductImage
                        src={item.image}
                        alt={item.name}
                        sizes="(min-width: 1536px) 16vw, (min-width: 1280px) 20vw, (min-width: 768px) 30vw, 45vw"
                        imgClassName="p-0 sm:p-1"
                    />
                </Link>
            </div>

            <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3.5 pt-3">
                <h3 className="min-h-[2.5rem] text-[13px] font-semibold leading-snug text-[#123524] sm:text-[14px]">
                    <Link
                        href={`/produk/${item.slug}`}
                        aria-label={`Lihat detail ${item.name}`}
                        className="line-clamp-2 transition-colors hover:text-[#A7833A]"
                    >
                        {item.name}
                    </Link>
                </h3>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {item.size && <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8B6B3F]">{item.size}</span>}
                    {item.rating > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8B6B3F]">
                            <Star size={11} className="text-[#C9A45B]" fill="#C9A45B" />
                            {item.rating.toFixed(1)}
                        </span>
                    )}
                </div>

                <p className="mt-auto whitespace-nowrap pt-1 text-[16px] font-bold text-[#123524] sm:text-[17px]">{formatRupiah(item.price)}</p>

                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onAdd}
                        disabled={outOfStock || addState === "adding" || addState === "added"}
                        aria-busy={addState === "adding"}
                        aria-label={outOfStock ? `${item.name} stok habis` : `Tambah ${item.name} ke keranjang`}
                        className="night-secondary-button grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#C9A45B]/40 bg-white text-[#8B6B3F] transition-all hover:border-[#C9A45B] hover:bg-[#F8F5EE] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        {addState === "adding" ? (
                            <svg className="h-4 w-4 animate-spin text-[#C9A45B]" viewBox="0 0 24 24" aria-hidden="true">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : addState === "added" ? (
                            <Check size={16} className="text-[#315d45]" />
                        ) : (
                            <ShoppingCart size={16} />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onBuy}
                        disabled={outOfStock}
                        className="flex min-w-0 flex-1 items-center justify-center rounded-xl bg-[#123524] px-3 py-2.5 text-[11px] font-bold text-white transition-all hover:bg-[#1c5138] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300 sm:text-xs"
                    >
                        Beli Sekarang
                    </button>
                </div>
            </div>
        </article>
    );
}

export default CatalogProductCard;
