"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { fetchTestimonials, Testimonial } from "@/lib/testimonials";

export default function TestimonialsPage() {
    const [items, setItems] = useState<Testimonial[]>([]);
    const [search, setSearch] = useState("");
    const [rating, setRating] = useState(0);

    useEffect(() => { fetchTestimonials({ search, rating: rating || undefined }).then(setItems).catch(() => setItems([])); }, [search, rating]);

    return <main className="min-h-screen bg-[#F8F5EE] px-4 py-10 text-[#123524]"><section className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-black uppercase tracking-[.3em] text-[#C9A45B]">Cerita Pelanggan</p><h1 className="mt-3 font-display text-5xl font-black uppercase">Semua Testimoni</h1></div><Link href="/testimonials/create" className="rounded-full bg-[#123524] px-6 py-3 text-center font-black text-white">Tulis Testimoni</Link></div><div className="mt-8 grid gap-3 md:grid-cols-[1fr_220px]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, kota, atau pesan" className="rounded-2xl border border-[#C9A45B]/25 px-5 py-4" /><select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="rounded-2xl border border-[#C9A45B]/25 px-5 py-4"><option value={0}>Semua rating</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} bintang</option>)}</select></div><div className="mt-8 grid gap-5 md:grid-cols-3">{items.map((t) => <article key={t.id} className="rounded-[28px] border border-[#C9A45B]/25 bg-white p-6 shadow-[0_20px_60px_rgba(18,53,36,.09)]"><div className="flex items-center gap-4"><div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-[#123524] font-black text-white">{t.avatar ? <Image src={t.avatar} alt={t.name} width={56} height={56} className="h-full w-full object-cover" unoptimized /> : t.name.slice(0, 1)}</div><div><h2 className="font-black">{t.name}</h2><p className="text-sm text-[#6B5A3B]">{t.city}</p></div></div><p className="mt-4 text-[#C9A45B]">{"*".repeat(t.rating)}</p><p className="mt-3 leading-relaxed text-[#4E4437]">{t.message}</p></article>)}</div>{!items.length && <p className="mt-10 rounded-3xl bg-white p-8 text-center font-bold text-[#6B5A3B]">Belum ada testimoni sesuai filter.</p>}</section></main>;
}