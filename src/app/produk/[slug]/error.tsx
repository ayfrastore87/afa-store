"use client";

import Link from "next/link";

export default function ProductDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <main className="grid min-h-[70vh] place-items-center bg-[#F8F5EE] px-4 py-12 text-center text-[#123524]"><section role="alert" className="max-w-lg"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#C9A45B]">AFA STORE</p><h1 className="mt-3 font-display text-4xl font-bold">Produk belum dapat dimuat</h1><p className="mt-3 text-[#8B6B3F]">Silakan coba kembali beberapa saat lagi atau lanjutkan menjelajahi produk AFA.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={reset} className="min-h-11 rounded-full bg-[#123524] px-6 py-3 font-bold text-white">Coba Lagi</button><Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#C9A45B]/35 px-6 py-3 font-bold">Kembali ke Beranda</Link></div></section></main>;
}