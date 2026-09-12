"use client";

import Link from "next/link";
import { Store, Tags, Boxes, ShoppingCart, TrendingUp, MapPin, Handshake, ArrowRight } from "lucide-react";

import { MITRA_BG, MITRA_GOLD_BTN, MITRA_PRIMARY_BTN } from "@/components/mitra/mitra-theme";

// ---------------------------------------------------------------------------
// AFA MITRA — landing page (Tahap 2). Mobile-first, uncluttered, brand-led.
// ---------------------------------------------------------------------------

const BENEFITS = [
    { icon: Tags, title: "Harga Khusus Mitra", text: "Nikmati harga modal khusus untuk setiap produk." },
    { icon: Boxes, title: "Kelola Stok", text: "Pantau stok masuk, keluar, dan produk menipis." },
    { icon: ShoppingCart, title: "Kasir Mitra", text: "Catat penjualan harian langsung dari HP." },
    { icon: TrendingUp, title: "Laporan Penjualan", text: "Omzet hingga laba kotor, tersaji jelas." },
    { icon: MapPin, title: "Live Location Operasional", text: "Bagikan lokasi toko saat diperlukan saja." },
];

export function MitraLanding() {
    return (
        <div className={`min-h-screen ${MITRA_BG} text-[#184D47]`}>
            <header className="sticky top-0 z-30 border-b border-[#C9A45B]/20 bg-[#F8F5EE]/90 backdrop-blur-xl">
                <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#184D47] text-[#D4AF37]">
                        <Handshake size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#C9A45B]">Partner Bisnis</p>
                        <p className="text-base font-black leading-tight">AFA MITRA</p>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-10 text-center">
                <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-[#D4AF37]/20 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-[#8b6d1a]">
                    <Store size={14} /> Partner / Reseller / Agen AFA STORE
                </p>
                <h1 className="mt-6 text-3xl font-black leading-tight sm:text-5xl">
                    Partner Bisnis <span className="text-[#C9A45B]">AFA STORE</span>
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-base text-[#184D47]/70">
                    Dapatkan harga khusus, kelola stok, catat penjualan, dan kembangkan usaha bersama AFA STORE.
                </p>

                <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                    <Link href="/mitra/login" className={MITRA_PRIMARY_BTN}>
                        Masuk Mitra <ArrowRight size={18} />
                    </Link>
                    <Link href="/mitra/daftar" className={MITRA_GOLD_BTN}>
                        Daftar Jadi Mitra
                    </Link>
                </div>

                <div className="mt-12 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
                    {BENEFITS.map((b) => (
                        <div key={b.title} className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
                            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#184D47]/8 text-[#C9A45B]">
                                <b.icon size={20} />
                            </span>
                            <h2 className="mt-3 font-black">{b.title}</h2>
                            <p className="mt-1 text-sm text-[#184D47]/60">{b.text}</p>
                        </div>
                    ))}
                    <div className="rounded-2xl border border-dashed border-[#C9A45B]/40 bg-white/40 p-5">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#D4AF37]/20 text-[#8b6d1a]">
                            <TrendingUp size={20} />
                        </span>
                        <h2 className="mt-3 font-black">Pantau Keuntungan</h2>
                        <p className="mt-1 text-sm text-[#184D47]/60">Laba kotor dihitung dari harga modal khusus Anda.</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
