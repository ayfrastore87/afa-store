"use client";

import Link from "next/link";
import { CalendarDays, Check, Heart, ShoppingCart, Star, Zap } from "lucide-react";
import ProductImage from "@/components/product-image";
import type { Product } from "@/lib/products";
import { formatRupiah } from "@/lib/products";

interface CatalogProductCardProps {
    item: Product;
    onAdd: () => void;
    onBuy: () => void;
    onPreOrder: () => void;
    onWish: () => void;
    wish: boolean;
    addState?: "adding" | "added";
}

/**
 * Compact, marketplace-style product card for the /produk catalog grid.
 *
 * Dominant image (aspect-square, object-contain, no crop), then name
 * (line-clamp-2), size, real rating, and bold dark-green price. Action area is
 * icon-only: ShoppingCart (add), Zap (buy-now, primary), CalendarDays
 * (pre-order). Each button exposes an accessible tooltip (hover + focus) with
 * aria-label + title fallback for mobile/assistive tech. All existing
 * handlers, loading states, and routing are preserved — only the UI changed.
 * Image and name link to /produk/[slug] using the real DB slug; interactive
 * buttons never nest inside the link so there is no invalid markup or double
 * navigation.
 */
export function CatalogProductCard({ item, onAdd, onBuy, onPreOrder, onWish, wish, addState }: CatalogProductCardProps) {
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

                <div className="mt-2 flex items-center justify-start gap-2 sm:gap-2.5">
                    {/* Add to Cart — icon only */}
                    <span className="group/tip relative inline-flex">
                        <button
                            type="button"
                            onClick={onAdd}
                            disabled={outOfStock || addState === "adding" || addState === "added"}
                            aria-busy={addState === "adding"}
                            aria-label={outOfStock ? `${item.name} stok habis` : `Tambah ${item.name} ke Keranjang`}
                            title="Tambah ke Keranjang"
                            className="night-secondary-button grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#C9A45B]/50 bg-[#FFFDF7] text-[#123524] shadow-[0_1px_3px_rgba(18,53,36,0.06)] transition-all hover:border-[#C9A45B] hover:bg-[#F8F5EE] hover:shadow-[0_3px_8px_rgba(18,53,36,0.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A45B] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            {addState === "adding" ? (
                                <svg className="h-4 w-4 animate-spin text-[#C9A45B]" viewBox="0 0 24 24" aria-hidden="true">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : addState === "added" ? (
                                <Check size={17} className="text-[#315d45]" aria-hidden="true" />
                            ) : (
                                <ShoppingCart size={17} aria-hidden="true" />
                            )}
                        </button>
                        <span
                            role="tooltip"
                            className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-[#0E2A1C] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-all duration-150 group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100"
                        >
                            Tambah ke Keranjang
                        </span>
                    </span>

                    {/* Buy Now — primary action, icon only */}
                    <span className="group/tip relative inline-flex">
                        <button
                            type="button"
                            onClick={onBuy}
                            disabled={outOfStock}
                            aria-label="Beli Sekarang"
                            title="Beli Sekarang"
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#123524] text-[#D4AF37] shadow-[0_6px_14px_rgba(18,53,36,0.22)] ring-1 ring-[#D4AF37]/35 transition-all hover:bg-[#1c5138] hover:shadow-[0_8px_18px_rgba(18,53,36,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white disabled:shadow-none disabled:ring-0"
                        >
                            <Zap size={18} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                        <span
                            role="tooltip"
                            className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-[#0E2A1C] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-all duration-150 group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100"
                        >
                            Beli Sekarang
                        </span>
                    </span>

                    {/* Pre-Order — icon only */}
                    <span className="group/tip relative inline-flex">
                        <button
                            type="button"
                            onClick={onPreOrder}
                            aria-label="Pre-Order"
                            title="Pre-Order"
                            className="night-secondary-button grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#C9A45B]/50 bg-[#FFFDF7] text-[#A7833A] shadow-[0_1px_3px_rgba(18,53,36,0.06)] transition-all hover:border-[#C9A45B] hover:bg-[#F8EBCB] hover:shadow-[0_3px_8px_rgba(18,53,36,0.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A45B] active:scale-95"
                        >
                            <CalendarDays size={17} aria-hidden="true" />
                        </button>
                        <span
                            role="tooltip"
                            className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-[#0E2A1C] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-all duration-150 group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100"
                        >
                            Pre-Order
                        </span>
                    </span>
                </div>
            </div>
        </article>
    );
}

export default CatalogProductCard;
