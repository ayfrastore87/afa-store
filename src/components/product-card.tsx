import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Heart, Check } from "lucide-react";
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
  const categoryClass = item.category === "Parcel" ? "bg-orange-100 text-orange-700" : item.category === "Bawang Goreng" ? "bg-emerald-100 text-emerald-700" : "bg-[#F8F5EE] text-[#8B6B3F]";
  const outOfStock = item.stock <= 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      className="luxury-card product-card flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] text-[#2E2A26] transition-shadow duration-300 hover:shadow-lg"
    >
      <div className="relative aspect-[4/4.5] w-full overflow-hidden bg-gradient-to-br from-[#FFF8EA] via-white to-[#EFE6D5]">
        <Link href={`/produk/${item.slug}`} aria-label={`Lihat detail ${item.name}`} className="group absolute inset-0 z-10 cursor-pointer p-4 md:p-5">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.25, ease: "easeOut" }} className="flex h-full w-full items-center justify-center">
            <ProductImage src={item.image} alt={item.name} sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 45vw" />
          </motion.div>
        </Link>
        
        {item.badge && (
          <b className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-[#C8A45D] px-3 py-1.5 text-xs font-bold text-white shadow-sm">{item.badge}</b>
        )}
        
        <motion.button
          whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}
          onClick={(e) => { e.preventDefault(); onWish?.(); }}
          aria-label={wish ? `Hapus ${item.name} dari wishlist` : `Tambah ${item.name} ke wishlist`}
          className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-white p-2.5 shadow-md transition-all hover:bg-[#FFF8EA]"
        >
          <Heart fill={wish ? "#ef4444" : "none"} className={`h-5 w-5 ${wish ? "text-red-500" : "text-[#C8A45D]"}`} />
        </motion.button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4 pt-4">
        <h3 className="product-card-title line-clamp-2 font-display text-base font-bold leading-tight md:text-lg lg:text-xl">
          <Link href={`/produk/${item.slug}`} aria-label={`Lihat detail ${item.name}`} className="inline cursor-pointer rounded transition-colors duration-200 hover:text-[#8B6B3F] hover:underline">{item.name}</Link>
        </h3>

        {item.size && (
          <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-[#F8F5EE] px-3 py-1 text-xs font-semibold text-[#8B6B3F]">{item.size}</span>
        )}

        <p className="text-sm text-[#C8A45D]">????? <span className="text-[#8B6B3F]">{item.rating > 0 ? item.rating.toFixed(1) : "Baru"}</span></p>

        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-bold text-[#123524] sm:text-xl">{formatRupiah(item.price)}</p>
          <span className={`rounded-full px-2.5 py-1.5 text-xs font-bold ${categoryClass}`}>{item.category}</span>
        </div>

        <div className="mt-auto flex flex-col gap-2.5 pt-3">
          <button type="button" onClick={onAdd} disabled={outOfStock || addState === "adding" || addState === "added"} aria-busy={addState === "adding"} aria-label={outOfStock ? `${item.name} stok habis` : `Tambah ${item.name} ke keranjang`} className="inline-flex min-h-[42px] w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[#C8A45D]/50 bg-white px-4 py-2.5 font-semibold text-[#8B6B3F] transition-all duration-200 hover:-translate-y-px hover:border-[#C8A45D]/80 hover:bg-[#FFF8EA] hover:shadow-sm active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:border-[#C8A45D]/50 disabled:hover:bg-transparent">
            {addState === "adding" ? "Menambahkan..." : addState === "added" ? <> <Check size={16} aria-hidden="true" /> Ditambahkan</> : outOfStock ? "Stok Habis" : "+ Keranjang"}
          </button>

          <button type="button" disabled={outOfStock} onClick={onBuy} className="min-h-[42px] w-full cursor-pointer rounded-full bg-[#123524] px-4 py-2.5 font-bold text-white transition-all duration-200 hover:-translate-y-px hover:bg-[#315d45] hover:shadow-lg active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#9b9b91] disabled:hover:translate-y-0 disabled:hover:shadow-none">Beli Sekarang</button>
        </div>
      </div>
    </motion.article>
  );
}

