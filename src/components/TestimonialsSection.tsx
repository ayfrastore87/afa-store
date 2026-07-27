"use client";

import useEmblaCarousel from "embla-carousel-react";
import type { EmblaCarouselType } from "embla-carousel";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Testimonial } from "@/lib/testimonials";

const AUTOPLAY_DELAY = 5000;

function formatDate(value?: string | null) {
    if (!value) return "Baru saja";
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function Stars({ rating }: { rating: number }) {
    return <div className="flex items-center gap-0.5 text-[#C89B3C]" aria-label={`${rating} dari 5 bintang`}>{Array.from({ length: 5 }).map((_, index) => <Star key={index} size={16} className={index < rating ? "fill-current" : "text-stone-200"} />)}</div>;
}

function SkeletonCard() {
    return <div className="min-w-0 flex-[0_0_100%] px-3 sm:flex-[0_0_50%] lg:flex-[0_0_33.333%]"><div className="h-[260px] animate-pulse rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center gap-4"><div className="h-14 w-14 rounded-full bg-stone-200" /><div className="flex-1 space-y-2"><div className="h-4 w-28 rounded bg-stone-200" /><div className="h-3 w-20 rounded bg-stone-100" /></div></div><div className="mt-8 space-y-3"><div className="h-3 rounded bg-stone-100" /><div className="h-3 rounded bg-stone-100" /><div className="h-3 w-2/3 rounded bg-stone-100" /></div><div className="mt-8 h-8 w-40 rounded-full bg-stone-100" /></div></div>;
}

function TestimonialCard({ item, index }: { item: Testimonial; index: number }) {
    return <motion.article initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -8, scale: 1.015 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.45, delay: index * 0.06 }} className="relative h-[260px] overflow-hidden rounded-2xl border border-[#C89B3C]/15 bg-white p-6 shadow-2xl shadow-stone-900/10"><Quote className="absolute -right-1 top-2 h-24 w-24 text-[#C89B3C]/10" /><div className="relative flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#14532d] text-xl font-black text-[#C89B3C] ring-4 ring-[#C89B3C]/15">{item.avatar ? <Image src={item.avatar} alt={item.name} width={56} height={56} className="h-full w-full object-cover" unoptimized /> : item.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-base font-black text-[#123524]">{item.name}</h3><p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{item.city}</p></div><span className="shrink-0 text-xs font-bold text-stone-400">{formatDate(item.createdAt)}</span></div><div className="mt-2"><Stars rating={item.rating} /></div></div></div><p className="relative mt-5 line-clamp-4 text-sm font-semibold leading-7 text-stone-600">“{item.message}”</p><div className="absolute bottom-5 left-6 inline-flex items-center rounded-full bg-[#C89B3C]/10 px-3 py-1.5 text-xs font-black text-[#8A651B]">Pembeli Terverifikasi</div></motion.article>;
}

export default function TestimonialsSection() {
    const [items, setItems] = useState<Testimonial[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
    const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: true, skipSnaps: false });
    const paused = useRef(false);

    useEffect(() => {
        let alive = true;
        fetch("/api/testimonials?limit=8")
            .then((response) => response.ok ? response.json() : Promise.reject())
            .then((data) => { if (alive) setItems(((data.testimonials ?? []) as Testimonial[]).filter((item) => item.isActive)); })
            .catch(() => { if (alive) setItems([]); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const onSelect = useCallback((api: EmblaCarouselType) => setSelectedIndex(api.selectedScrollSnap()), []);

    useEffect(() => {
        if (!emblaApi) return;
        setScrollSnaps(emblaApi.scrollSnapList());
        onSelect(emblaApi);
        emblaApi.on("select", onSelect);
        emblaApi.on("reInit", onSelect);
        return () => { emblaApi.off("select", onSelect); emblaApi.off("reInit", onSelect); };
    }, [emblaApi, onSelect]);

    useEffect(() => {
        if (!emblaApi || !items.length) return;
        const timer = window.setInterval(() => { if (!paused.current) emblaApi.scrollNext(); }, AUTOPLAY_DELAY);
        return () => window.clearInterval(timer);
    }, [emblaApi, items.length]);

    const skeletons = useMemo(() => Array.from({ length: 3 }), []);

    return <motion.section id="testimoni" initial={{ opacity: 0, y: 36 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.7, ease: "easeOut" }} className="relative overflow-hidden bg-white px-4 py-12 text-[#123524] md:py-16"><div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-[#C89B3C]/10 blur-3xl" /><div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#14532d]/5 blur-3xl" /><div className="relative mx-auto max-w-6xl"><div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-black uppercase tracking-[.32em] text-[#C89B3C]">Testimoni Pelanggan</p><h2 className="mt-3 max-w-2xl font-serif text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-5xl">Cerita pelanggan yang memilih rasa AFA Store</h2></div><div className="flex items-center gap-3 md:justify-end"><Link href="/testimonials/create" className="inline-flex h-12 items-center rounded-full bg-[#123524] px-5 text-sm font-black text-white shadow-xl shadow-[#123524]/15">Tulis Testimoni</Link><Link href="/testimonials" className="inline-flex h-12 items-center rounded-full border border-[#C89B3C]/40 px-5 text-sm font-black text-[#8A651B] hover:bg-[#C89B3C]/10">Lihat Semua</Link></div></div><div onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }} className="relative -mt-1 md:-mt-3"><div className="overflow-hidden" ref={emblaRef}><div className="-mx-3 flex touch-pan-y">{loading ? skeletons.map((_, index) => <SkeletonCard key={index} />) : items.length ? items.map((item, index) => <div key={item.id} className="min-w-0 flex-[0_0_100%] px-3 sm:flex-[0_0_50%] lg:flex-[0_0_33.333%]"><TestimonialCard item={item} index={index} /></div>) : <div className="min-w-0 flex-[0_0_100%] px-3"><div className="rounded-2xl border border-[#C89B3C]/20 bg-white p-8 text-center font-bold text-stone-500 shadow-xl">Testimoni aktif akan tampil di sini.</div></div>}</div></div>{items.length > 1 && <><button type="button" onClick={() => emblaApi?.scrollPrev()} className="absolute -left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[#123524] shadow-2xl ring-1 ring-[#C89B3C]/20 transition hover:bg-[#C89B3C] hover:text-white md:grid" aria-label="Testimoni sebelumnya"><ChevronLeft size={22} /></button><button type="button" onClick={() => emblaApi?.scrollNext()} className="absolute -right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[#123524] shadow-2xl ring-1 ring-[#C89B3C]/20 transition hover:bg-[#C89B3C] hover:text-white md:grid" aria-label="Testimoni berikutnya"><ChevronRight size={22} /></button><div className="mt-7 flex justify-center gap-2">{scrollSnaps.map((_, index) => <button key={index} type="button" onClick={() => emblaApi?.scrollTo(index)} className={`h-2.5 rounded-full transition-all ${selectedIndex === index ? "w-9 bg-[#C89B3C]" : "w-2.5 bg-stone-300 hover:bg-[#C89B3C]/50"}`} aria-label={`Buka slide testimoni ${index + 1}`} />)}</div></>}</div></div></motion.section>;
}