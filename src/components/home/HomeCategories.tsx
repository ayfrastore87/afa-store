"use client";

import { ImageIcon } from "lucide-react";
import ProductImage from "@/components/product-image";
import type { Product } from "@/lib/products";

export default function HomeCategories({ groups, loading, onSelect }: { groups: { name: string; imageUrl: string | null; items: Product[] }[]; loading: boolean; onSelect: (category: string) => void }) {
  if (!loading && !groups.length) return null;
  return <section className="category-cluster mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:px-12"><div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#A7833A]">Jelajahi koleksi</p><h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Pilih Kebutuhan Anda</h2></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{loading ? Array.from({ length: 5 }, (_, index) => <div key={index} className="h-56 animate-pulse rounded-3xl bg-[var(--card)]" />) : groups.map((group) => <button key={group.name} type="button" onClick={() => onSelect(group.name)} className="group overflow-hidden rounded-3xl border border-[#C9A45B]/20 bg-[var(--card)] text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A45B]"><span className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-[#FBF4E8] text-[#A7833A]"><ProductImage src={group.imageUrl} alt={group.name} sizes="(min-width: 1280px) 220px, (min-width: 640px) 30vw, 45vw" imgClassName="object-cover" /></span><span className="block px-3 py-4 text-sm font-bold leading-tight text-[var(--dark-text)] sm:text-base">{group.name}</span></button>)}</div></section>;
}