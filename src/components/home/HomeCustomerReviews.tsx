"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { fetchTestimonials, type Testimonial } from "@/lib/testimonials";

function displayName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : `${name.slice(0, 3)}***`;
}

function Stars({ rating }: { rating: number }) {
  return <span className="flex gap-0.5 text-[#D4AF37]" aria-label={`${rating} dari 5 bintang`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={15} fill={star <= rating ? "currentColor" : "none"} strokeWidth={1.8} />)}</span>;
}

export default function HomeCustomerReviews() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loaded, setLoaded] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const pauseRef = useRef(false);

  useEffect(() => { fetchTestimonials({ limit: 12 }).then(setItems).catch(() => setItems([])).finally(() => setLoaded(true)); }, []);
  const move = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-review-card]");
    track.scrollBy({ left: direction * ((card?.offsetWidth ?? track.clientWidth * .86) + 16), behavior: "smooth" });
  }, []);
  useEffect(() => {
    if (items.length <= 3 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => { if (!pauseRef.current) move(1); }, 6500);
    return () => window.clearInterval(timer);
  }, [items.length, move]);

  return <section aria-labelledby="customer-reviews-title" className="mx-auto max-w-[1400px] px-5 py-9 sm:px-8 lg:px-12 lg:py-11">
    <div className="mb-5 flex items-end justify-between gap-4">
      <div><p className="text-[11px] font-black uppercase tracking-[.24em] text-[#A7833A] dark:text-[#D4AF37]">Cerita Pelanggan</p><h2 id="customer-reviews-title" className="mt-1 font-display text-2xl font-bold text-[#123524] dark:text-[#F2EDE3] sm:text-3xl">Apa Kata Mereka</h2><p className="mt-1 text-sm text-[#6D6558] dark:text-[#AAA394]">Pengalaman pelanggan bersama AFA STORE.</p></div>
      {items.length > 3 && <div className="hidden gap-2 sm:flex"><button type="button" onClick={() => move(-1)} aria-label="Review sebelumnya" className="grid h-9 w-9 place-items-center rounded-full border border-[#C9A45B]/45 text-[#123524] transition hover:bg-[#C9A45B]/10 dark:text-[#F2EDE3]"><ChevronLeft size={18} /></button><button type="button" onClick={() => move(1)} aria-label="Review berikutnya" className="grid h-9 w-9 place-items-center rounded-full border border-[#C9A45B]/45 text-[#123524] transition hover:bg-[#C9A45B]/10 dark:text-[#F2EDE3]"><ChevronRight size={18} /></button></div>}
    </div>
    {!loaded ? <div className="h-[188px] animate-pulse rounded-2xl border border-[#C9A45B]/20 bg-[#EFE6D5]/50 dark:bg-[#0E2118]" /> : !items.length ? <div className="flex min-h-[132px] items-center rounded-2xl border border-[#C9A45B]/25 bg-[#FFFDF8]/55 px-6 dark:bg-[#0E2118]"><div><p className="font-display text-lg font-bold text-[#123524] dark:text-[#F2EDE3]">☆ Belum ada ulasan pelanggan</p><p className="mt-1 text-sm text-[#6D6558] dark:text-[#AAA394]">Ulasan pembeli akan tampil di sini setelah diverifikasi.</p></div></div> : <>
      <div ref={trackRef} onMouseEnter={() => { pauseRef.current = true; }} onMouseLeave={() => { pauseRef.current = false; }} onFocus={() => { pauseRef.current = true; }} onBlur={() => { pauseRef.current = false; }} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scrollbar-none" tabIndex={0} aria-label="Carousel review pelanggan">
        {items.map((item) => <article key={item.id} data-review-card className="customer-review-card flex min-h-[160px] w-[calc(100%-24px)] shrink-0 snap-start flex-col rounded-2xl border border-[rgba(212,175,55,.20)] bg-[#FFFDF8] p-5 shadow-[0_6px_18px_rgba(18,53,36,.04)] sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]"><Stars rating={item.rating} /><p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[#536052]">“{item.message}”</p><div className="mt-auto pt-3"><p className="text-sm font-bold uppercase tracking-wide text-[#123524]">{displayName(item.name)}</p>{item.isVerified && <p className="mt-1 flex items-center gap-1 text-xs text-[#6D6558]"><BadgeCheck size={14} className="text-[#C9A45B]" /> Pembeli Terverifikasi</p>}</div></article>)}
      </div><div className="mt-3 flex justify-center gap-1.5 sm:hidden"><span className="h-1.5 w-8 rounded-full bg-[#D4AF37]" /><span className="h-1.5 w-1.5 rounded-full bg-[#C9A45B]/40" /><span className="h-1.5 w-1.5 rounded-full bg-[#C9A45B]/40" /></div>
    </>}
  </section>;
}