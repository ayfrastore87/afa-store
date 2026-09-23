"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Heart, Leaf, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/products";
import { formatRupiah, isValidImageSource } from "@/lib/products";

const AUTOPLAY_MS = 5000;
const slideEase = [0.22, 1, 0.36, 1] as const;

export default function HomeHero({ products, onProducts }: { products: Product[]; onProducts: () => void }) {
  const reduceMotion = useReducedMotion();
  const slides = useMemo(() => {
    const seen = new Set<string>();
    return products.filter((product) => {
      if (!product.isActive || !product.name.trim() || !isValidImageSource(product.image) || seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    }).slice(0, 8);
  }, [products]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  useEffect(() => setIndex((current) => slides.length ? current % slides.length : 0), [slides.length]);
  useEffect(() => {
    if (reduceMotion || slides.length < 2 || paused || typeof document === "undefined" || document.hidden) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % slides.length), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [cycle, index, paused, reduceMotion, slides.length]);
  useEffect(() => {
    const handleVisibility = () => { if (!document.hidden) setCycle((current) => current + 1); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const product = slides[index];
  const selectSlide = (next: number) => { setIndex((next + slides.length) % slides.length); setCycle((current) => current + 1); };
  const move = (direction: 1 | -1) => { if (slides.length > 1) selectSlide(index + direction); };
  const description = product?.size ? `${product.size} • Pilihan terbaik untuk keluarga.` : product?.category ? `${product.category} • Pilihan terbaik untuk keluarga.` : "Pilihan terbaik untuk keluarga.";
  const transition = reduceMotion ? { duration: 0.12 } : { duration: 0.65, ease: slideEase };

  return <section id="beranda" className="relative overflow-hidden bg-[var(--cream)] text-[var(--dark-text)]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)} onTouchEnd={(event) => { if (touchStart === null) return; const distance = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart; if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1); setTouchStart(null); }}>
    <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 py-8 sm:px-6 md:grid-cols-[46%_54%] md:py-12 lg:px-8 lg:py-14">
      <AnimatePresence mode="wait" initial={false} custom={index}>
        <motion.div key={product?.id ?? "empty"} initial={{ opacity: 0, x: reduceMotion ? 0 : 26 }} animate={{ opacity: 1, x: 0, transition }} exit={{ opacity: 0, x: reduceMotion ? 0 : -26, transition: { duration: reduceMotion ? 0.1 : 0.45, ease: slideEase } }} className="relative z-10 max-w-xl">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...transition, delay: 0.03 } }} className="text-xs font-bold uppercase tracking-[0.24em] text-[#A7833A]">AFA STORE</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { ...transition, delay: 0.1 } }} className="mt-3 font-display text-4xl font-bold leading-[.95] tracking-tight sm:text-5xl lg:text-6xl">Pilihan Terbaik<br />Untuk Keluarga</motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { ...transition, delay: 0.17 } }} className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--muted)] sm:text-base">Pilihan produk AFA STORE untuk keluarga, dipilih dari data produk yang dikelola Admin.</motion.p>
          {product && <div className="mt-3 flex items-center gap-3 md:hidden"><Link href={`/produk/${product.slug}`} aria-label={`Lihat detail ${product.name}`} className="relative flex h-[165px] flex-1 items-center justify-center"><Image src={product.image} alt={product.name} width={420} height={300} priority={index === 0} className="max-h-[165px] w-full object-contain" sizes="75vw" /></Link><div className="min-w-0"><p className="truncate text-sm font-bold">{product.name}</p><p className="mt-1 text-sm font-bold text-[#A7833A]">{formatRupiah(product.price)}</p></div></div>}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...transition, delay: 0.24 } }} className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4"><MiniBenefit icon={<Leaf size={18} />} label="Produk Berkualitas" /><MiniBenefit icon={<Sparkles size={18} />} label="Rasa Istimewa" /><MiniBenefit icon={<ShieldCheck size={18} />} label="Aman & Higienis" /><MiniBenefit icon={<Heart size={18} />} label="Untuk Keluarga" /></motion.div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...transition, delay: 0.3 } }}><Link href={product?.slug ? `/produk/${product.slug}` : "/produk"} className="group mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#123524] px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#184D47]">Lihat Produk <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /></Link></motion.div>
        </motion.div>
      </AnimatePresence>
      <div className="relative hidden min-h-[220px] items-center justify-center md:flex md:min-h-[320px]">
        {product && <AnimatePresence mode="wait" initial={false}><motion.div key={product.id} initial={{ opacity: 0, x: reduceMotion ? 0 : 26, scale: reduceMotion ? 1 : 0.94 }} animate={{ opacity: 1, x: 0, scale: 1, transition: { ...transition, duration: reduceMotion ? 0.12 : 0.7 } }} exit={{ opacity: 0, x: reduceMotion ? 0 : -26, transition: { duration: reduceMotion ? 0.1 : 0.45 } }} className="absolute inset-0 flex items-center justify-center"><motion.div aria-hidden="true" animate={reduceMotion ? undefined : { scale: [1, 1.04, 1] }} transition={reduceMotion ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut" }} className="absolute h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.12),transparent_65%)] sm:h-72 sm:w-72" /><motion.div animate={reduceMotion ? undefined : { y: [0, -6, 0], rotate: [0, 0.35, 0, -0.35, 0] }} transition={reduceMotion ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }} className="relative z-10 flex h-full w-full items-center justify-center"><motion.div aria-hidden="true" animate={reduceMotion ? undefined : { scale: [1, 0.94, 1], opacity: [0.22, 0.14, 0.22] }} transition={reduceMotion ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-3 h-5 w-1/2 rounded-[50%] bg-[#123524]/20 blur-md" /><motion.div whileHover={reduceMotion ? undefined : { scale: 1.02 }} transition={{ duration: 0.3, ease: slideEase }} className="relative flex max-h-[330px] w-full items-center justify-center"><Image src={product.image} alt={product.name} width={760} height={620} priority={index === 0} className="max-h-[330px] w-full object-contain" sizes="(min-width: 768px) 58vw, 100vw" /></motion.div></motion.div></motion.div></AnimatePresence>}
        {slides.length > 1 && <><button type="button" onClick={() => move(-1)} aria-label="Produk hero sebelumnya" className="absolute left-0 z-20 hidden h-11 w-11 place-items-center rounded-full border border-[#C9A45B]/30 bg-[var(--cream)]/80 text-[var(--dark-text)] shadow-md backdrop-blur transition hover:scale-105 hover:border-[#C9A45B] md:grid"><ArrowLeft size={18} /></button><button type="button" onClick={() => move(1)} aria-label="Produk hero berikutnya" className="absolute right-0 z-20 hidden h-11 w-11 place-items-center rounded-full border border-[#C9A45B]/30 bg-[var(--cream)]/80 text-[var(--dark-text)] shadow-md backdrop-blur transition hover:scale-105 hover:border-[#C9A45B] md:grid"><ArrowRight size={18} /></button></>}
      </div>
    </div>
    {slides.length > 1 && <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5" role="tablist" aria-label="Pilihan produk hero">{slides.map((item, itemIndex) => <button key={item.id} type="button" role="tab" aria-label={`Pilih slide ${itemIndex + 1}`} aria-selected={itemIndex === index} onClick={() => selectSlide(itemIndex)} className="h-1.5 overflow-hidden rounded-full bg-[#C9A45B]/30"><motion.span key={`${item.id}-${cycle}-${itemIndex === index}`} initial={{ width: 0 }} animate={{ width: itemIndex === index ? "1.5rem" : 0 }} transition={{ duration: itemIndex === index && !reduceMotion ? AUTOPLAY_MS / 1000 : 0, ease: "linear" }} className="block h-full rounded-full bg-[#C9A45B]" /></button>)}</div>}
  </section>;
}

function MiniBenefit({ icon, label }: { icon: React.ReactNode; label: string }) { return <div className="flex items-center gap-2 text-[var(--dark-text)]"><span className="text-[#A7833A]">{icon}</span><span className="text-xs font-semibold leading-tight">{label}</span></div>; }