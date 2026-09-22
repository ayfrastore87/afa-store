"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import ProductImage from "@/components/product-image";
import { useWishlist } from "@/context/wishlist-context";

type GalleryProduct = {
    id: string;
    name: string;
    price: number;
    image: string | null;
    badge?: string | null;
};

/**
 * Premium hero gallery for the product detail page.
 *
 * The AFA STORE Product model currently stores a single `image` field, so the
 * gallery is future-proofed to accept an array while only rendering real data:
 * thumbnails and navigation arrows appear ONLY when more than one distinct
 * image actually exists. No placeholder thumbnails, fake slides, or video are
 * fabricated.
 */
export default function ProductGallery({ product, images, available }: { product: GalleryProduct; images: (string | null)[]; available: boolean }) {
    const { toggleWishlist, isWishlisted } = useWishlist();

    const gallery = useMemo(() => {
        const cleaned = images
            .map((src) => src?.trim() || "")
            .filter((src) => src.length > 0);
        const unique = Array.from(new Set(cleaned));
        return unique.length > 0 ? unique : [product.image?.trim() || null];
    }, [images, product.image]);

    const [active, setActive] = useState(0);
    const hasMultiple = gallery.length > 1;
    const currentIndex = Math.min(active, gallery.length - 1);

    const goTo = (index: number) => {
        const total = gallery.length;
        setActive(((index % total) + total) % total);
    };

    const wished = isWishlisted(product.id);

    return (
        <div className="min-w-0 lg:sticky lg:top-8">
            <div className="group relative aspect-square min-w-0 overflow-hidden rounded-[24px] border border-[#C9A45B]/20 bg-[#F9F3E6] shadow-[0_24px_70px_-30px_rgba(18,53,36,0.35)] sm:rounded-[28px]">
                <div className="absolute inset-6 rounded-full bg-white/70 blur-3xl sm:inset-10" aria-hidden="true" />

                {product.badge && (
                    <span className="absolute left-4 top-4 z-20 inline-flex items-center rounded-full bg-[#C9A45B] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-md sm:left-5 sm:top-5">
                        {product.badge}
                    </span>
                )}

                <button
                    type="button"
                    onClick={() => toggleWishlist({ id: product.id, name: product.name, price: product.price, image: product.image || "/products/parcel.png" })}
                    aria-pressed={wished}
                    aria-label={wished ? "Hapus dari wishlist" : "Simpan ke wishlist"}
                    className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-[#123524] shadow-[0_6px_20px_rgba(18,53,36,0.18)] backdrop-blur transition-transform duration-200 hover:scale-105 active:scale-95 sm:right-5 sm:top-5"
                >
                    <Heart size={20} className={wished ? "text-[#D14343]" : "text-[#123524]"} fill={wished ? "currentColor" : "none"} />
                </button>

                <div className="relative h-full w-full">
                    <ProductImage
                        key={gallery[currentIndex] ?? "single"}
                        src={gallery[currentIndex] ?? product.image}
                        alt={product.name}
                        priority
                        sizes="(max-width: 1023px) 100vw, 55vw"
                        imgClassName="p-6 sm:p-10 duration-500"
                    />
                </div>

                {!available && (
                    <div className="absolute inset-0 z-10 grid place-items-center bg-[#0f1713]/45 backdrop-blur-[1px]">
                        <span className="rounded-full bg-white/95 px-5 py-2 text-sm font-bold uppercase tracking-[0.12em] text-red-700 shadow-lg">Stok Habis</span>
                    </div>
                )}

                {hasMultiple && (
                    <>
                        <button
                            type="button"
                            onClick={() => goTo(currentIndex - 1)}
                            aria-label="Gambar sebelumnya"
                            className="absolute left-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[#123524] shadow-[0_6px_20px_rgba(18,53,36,0.18)] backdrop-blur transition-transform duration-200 hover:scale-105 active:scale-95 sm:left-4"
                        >
                            <ChevronLeft size={22} />
                        </button>
                        <button
                            type="button"
                            onClick={() => goTo(currentIndex + 1)}
                            aria-label="Gambar berikutnya"
                            className="absolute right-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[#123524] shadow-[0_6px_20px_rgba(18,53,36,0.18)] backdrop-blur transition-transform duration-200 hover:scale-105 active:scale-95 sm:right-4"
                        >
                            <ChevronRight size={22} />
                        </button>
                    </>
                )}
            </div>

            {hasMultiple && (
                <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
                    {gallery.map((src, index) => (
                        <button
                            key={`${src}-${index}`}
                            type="button"
                            onClick={() => goTo(index)}
                            aria-label={`Lihat gambar ${index + 1}`}
                            aria-current={index === currentIndex}
                            className={`relative aspect-square h-[70px] w-[70px] shrink-0 snap-start overflow-hidden rounded-[12px] border bg-[#F9F3E6] transition-all duration-200 sm:h-[84px] sm:w-[84px] ${index === currentIndex ? "border-[#C9A45B] ring-2 ring-[#C9A45B]/40" : "border-[#C9A45B]/20 hover:border-[#C9A45B]/60"}`}
                        >
                            <ProductImage src={src} alt={`${product.name} ${index + 1}`} sizes="90px" imgClassName="p-2" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}