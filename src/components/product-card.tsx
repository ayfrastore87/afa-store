import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Heart, Star, Check } from "lucide-react";
import ProductImage from "./product-image";
import type { Product } from "@/lib/products";
import { formatRupiah } from "@/lib/products";

interface ProductCardProps {
  item: Product;
  onAdd: () => void;
  onBuy: () => void;
  onWish?: () => void;
  wish?: boolean;
  addState?: "adding" | "added";
}

export function ProductCard({ item, onAdd, onBuy, onWish, wish, addState }: ProductCardProps) {
  const outOfStock = item.stock <= 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      className="luxury-card product-card flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] bg-white shadow-sm transition-all hover:shadow-xl border border-gray-100"
    >
      {/* IMAGE AREA */}
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-[#FDF8F3] via-white to-[#FFF8F0]">
        {/* Wishlist Button - Top Right */}
        <motion.button
          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          onClick={(e) => { e.preventDefault(); onWish?.(); }}
          aria-label={wish ? `Hapus ${item.name} dari wishlist` : `Tambah ${item.name} ke wishlist`}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white p-2 shadow-md backdrop-blur-sm transition-all"
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
          <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-[#F8F5EE] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#8B6B3F] sm:text-[10px] md:text-xs">
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

      {/* ACTION AREA */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex flex-col gap-2">
          {/* Add to Cart Button */}
          <button 
            type="button" 
            onClick={onAdd} 
            disabled={outOfStock || addState === "adding" || addState === "added"}
            aria-busy={addState === "adding"}
            aria-label={outOfStock ? `${item.name} stok habis` : `Tambah ${item.name} ke keranjang`}
            className="group flex min-h-[36px] w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[#C9A45B]/30 bg-white px-4 py-2.5 text-[10px] font-semibold text-[#8B6B3F] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C9A45B] hover:bg-[#F8F5EE] hover:shadow-sm active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-[#C9A45B]/30 disabled:hover:bg-transparent sm:min-h-[38px] sm:text-xs md:min-h-[40px] md:text-sm"
          >
            {addState === "adding" ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin text-[#C9A45B]" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Menambahkan...
              </>
            ) : addState === "added" ? (
              <>
                <Check size={14} className="text-green-600" />
                Ditambahkan
              </>
            ) : outOfStock ? (
              <span className="uppercase tracking-wide">Stok Habis</span>
            ) : (
              <>+ Keranjang</>
            )}
          </button>

          {/* Buy Now Button */}
          <button 
            type="button" 
            disabled={outOfStock} 
            onClick={onBuy}
            className="group flex min-h-[36px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#123524] px-4 py-2.5 text-[10px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#184D47] hover:shadow-lg active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:min-h-[38px] sm:text-xs md:min-h-[40px] md:text-sm"
          >
            Beli Sekarang
          </button>
        </div>
      </div>
    </motion.article>
  );
}
