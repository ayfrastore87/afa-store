"use client";

import { ArrowRight, ImageIcon } from "lucide-react";
import ProductImage from "@/components/product-image";
import type { Product } from "@/lib/products";

export default function HomeCategories({ groups, loading, onSelect }: { groups: { name: string; imageUrl: string | null; items: Product[] }[]; loading: boolean; onSelect: (category: string) => void }) {
  if (!loading && !groups.length) return null;
  return <section className="category-cluster mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:px-12"><div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#A7833A]">Jelajahi koleksi</p><h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Pilih Kebutuhan Anda</h2></div><div className="scrollbar-none flex snap-x gap-4 overflow-x-auto pb-3">{loading ? Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 w-32 shrink-0 animate-pulse rounded-3xl bg-[var(--card)]" />) : groups.map((group) => <button key={group.name} type="button" onClick={() => onSelect(group.name)} className="group flex w-32 shrink-0 snap-start flex-col items-center gap-3 rounded-3xl p-2 text-center transition hover:-translate-y-1"><span className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full border border-[#C9A45B]/25 bg-[#FBF4E8] text-[#A7833A] shadow-sm">{group.imageUrl ? <ProductImage src={group.imageUrl} alt={group.name} sizes="96px" imgClassName="p-2 object-cover" /> : <ImageIcon size={30} aria-hidden="true" />}</span><span className="text-xs font-bold leading-tight text-[var(--dark-text)]">{group.name}</span><span className="text-[#A7833A]"><ArrowRight size={14} /></span></button>)}</div></section>;
}