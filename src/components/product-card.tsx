import { motion } from "framer-motion";
import Link from "next/link";

import { CalendarDays, Check, Heart, ShoppingCart, Star, Zap } from "lucide-react";
import ProductImage from "./product-image";
import type { Product } from "@/lib/products";
import { formatRupiah } from "@/lib/products";

interface ProductCardProps {
  item: Product;
  onAdd: () => void;
  onBuy: () => void;
  onPreOrder: () => void;
  onWish?: () => void;
  wish?: boolean;
  addState?: "adding" | "added";
}

export function ProductCard({ item, onAdd, onBuy, onPreOrder, onWish, wish, addState }: ProductCardProps) {
  const outOfStock = item.stock <= 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      className="luxury-card product-card flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-gray-100 bg-white shadow-sm transition-all hover:shadow-xl"
    >
      {/* IMAGE AREA */}
      <div className="night-image-stage relative aspect-square w-full overflow-hidden bg-gradient-to-br from-[#FDF8F3] via-white to-[#FFF8F0]">
        {/* Wishlist Button - Top Right */}
        <motion.button
          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          onClick={(e) => { e.preventDefault(); onWish?.(); }}
          aria-label={wish ? `Hapus ${item.name} dari wishlist` : `Tambah ${item.name} ke wishlist`}
          className="night-wishlist absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white p-2 shadow-md backdrop-blur-sm transition-all"
        >
          <Heart 
            fill={wish ? "#ef4444" : "none"} 
            className={`h-4.5 w-4.5 ${wish ? "text-red-500" : "text-[#C9A45B]"}`} 
          />
        </motion.button>
        
        {/* Badges - Top Left */}
        {item.badge && (
          <span className="pointer-events-none absolute left-3 top-3 z-10 hidden rounded-lg bg-[#D4AF37] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm sm:inline-block md:text-[10px]">
            {item.badge}
          </span>
        )}
        
        {/* Product Image with Link */}
        <Link href={`/produk/${item.slug}`} aria-label={`Lihat detail ${item.name}`} className="group relative flex h-full w-full items-center justify-center p-3 sm:p-4 md:p-5">
          <ProductImage 
            src={item.image} 
            alt={item.name} 
            sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 45vw" 
          />
        </Link>
      </div>

      {/* PRODUCT INFO AREA */}
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-3">
        {/* Product Name */}
        <h3 className="font-display text-[11px] font-semibold leading-tight sm:text-xs md:text-sm lg:text-base xl:text-base">
          <Link 
            href={`/produk/${item.slug}`} 
            aria-label={`Lihat detail ${item.name}`}
            className="inline cursor-pointer rounded truncate transition-colors duration-200 hover:text-[#C9A45B] hover:underline line-clamp-2 min-h-[2.8rem]"
          >
            {item.name}
          </Link>
        </h3>

        {/* Variant/Size Badge */}
        {item.size && (
          <span className="night-size-badge mt-0.5 inline-flex w-fit items-center rounded-full bg-[#F8F5EE] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#8B6B3F] sm:text-[10px] md:text-xs">
            {item.size}
          </span>
        )}

        {/* Rating with Star Icon */}
        {item.rating > 0 && (
          <div className="flex items-center gap-1">
            <Star size={12} className="shrink-0 text-[#C9A45B]" fill="#C9A45B" />
            <span className="text-[10px] font-medium text-[#8B6B3F] sm:text-xs">{item.rating.toFixed(1)}</span>
          </div>
        )}

        {/* Price - Clear and Bold */}
        <p className="mt-auto whitespace-nowrap text-[13px] font-bold text-[#123524] sm:text-sm md:text-base lg:text-lg xl:text-base">
          {formatRupiah(item.price)}
        </p>
      </div>

      {/* ACTION AREA — Icon-only buttons: [ShoppingCart] [Zap] [CalendarDays] */}
      <div className="night-card-actions border-t border-gray-100 px-4 py-3">
        <div
          className="flex items-center justify-center gap-2.5"
          role="group"
          aria-label={`Aksi untuk ${item.name}`}
        >
          {/* Add to Cart — icon only */}
          <span className="group/tip relative inline-flex">
            <button
              type="button"
              onClick={onAdd}
              disabled={outOfStock || addState === "adding" || addState === "added"}
              aria-busy={addState === "adding"}
              aria-label={outOfStock ? `${item.name} stok habis` : `Tambah ${item.name} ke Keranjang`}
              className="night-secondary-button grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#C9A45B]/50 bg-[#FFFDF7] text-[#123524] shadow-[0_1px_3px_rgba(18,53,36,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C9A45B] hover:bg-[#F8F5EE] hover:shadow-[0_3px_8px_rgba(18,53,36,0.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A45B] active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-[#C9A45B]/50 disabled:hover:bg-[#FFFDF7] disabled:hover:shadow-[0_1px_3px_rgba(18,53,36,0.06)] sm:h-11 sm:w-11"
            >
              {addState === "adding" ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-[#C9A45B]" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="sr-only">Menambahkan...</span>
                </>
              ) : addState === "added" ? (
                <>
                  <Check size={17} className="text-[#315d45]" aria-hidden="true" />
                  <span className="sr-only">Ditambahkan</span>
                </>
              ) : (
                <ShoppingCart size={17} aria-hidden="true" />
              )}
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-[#0E2A1C] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-all duration-150 md:block md:group-hover/tip:translate-y-0 md:group-hover/tip:opacity-100 md:group-focus-within/tip:translate-y-0 md:group-focus-within/tip:opacity-100"
            >
              Keranjang
            </span>
          </span>

          {/* Buy Now — primary, icon only, slightly larger */}
          <span className="group/tip relative inline-flex">
            <button
              type="button"
              disabled={outOfStock}
              onClick={onBuy}
              aria-label="Beli Sekarang"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#123524] text-[#D4AF37] shadow-[0_6px_14px_rgba(18,53,36,0.22)] ring-1 ring-[#D4AF37]/35 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#184D47] hover:shadow-[0_8px_18px_rgba(18,53,36,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white disabled:shadow-none disabled:ring-0 disabled:hover:translate-y-0 sm:h-12 sm:w-12"
            >
              <Zap size={19} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-[#0E2A1C] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-all duration-150 md:block md:group-hover/tip:translate-y-0 md:group-hover/tip:opacity-100 md:group-focus-within/tip:translate-y-0 md:group-focus-within/tip:opacity-100"
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
              className="night-secondary-button grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#C9A45B]/50 bg-[#FFFDF7] text-[#A7833A] shadow-[0_1px_3px_rgba(18,53,36,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C9A45B] hover:bg-[#F8EBCB] hover:shadow-[0_3px_8px_rgba(18,53,36,0.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A45B] active:translate-y-0 active:scale-95 sm:h-11 sm:w-11"
            >
              <CalendarDays size={18} aria-hidden="true" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-[#0E2A1C] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-all duration-150 md:block md:group-hover/tip:translate-y-0 md:group-hover/tip:opacity-100 md:group-focus-within/tip:translate-y-0 md:group-focus-within/tip:opacity-100"
            >
              Pre-Order
            </span>
          </span>
        </div>
      </div>
    </motion.article>
  );
}
