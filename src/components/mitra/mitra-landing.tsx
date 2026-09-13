"use client";

import Link from "next/link";
import { useState } from "react";
import {
    ArrowRight,
    BadgeCheck,
    Boxes,
    Building2,
    ChartNoAxesCombined,
    FileChartColumn,
    Handshake,
    MapPin,
    Menu,
    Package,
    PackageCheck,
    ReceiptText,
    ShoppingBag,
    ShoppingCart,
    Sparkles,
    Store,
    Tag,
    Tags,
    TrendingUp,
    UserPlus,
    UserRound,
    Workflow,
    X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// AFA MITRA — landing page bisnis (redesign).
// Menjelaskan konsep bisnis AFA MITRA (reseller/warung/toko/agen) dan mengarahkan
// calon mitra untuk mendaftar. Murni marketing/presentasi — tidak menyentuh
// auth, routing, atau business logic (semua tetap di resolveMitra()/API).
// ---------------------------------------------------------------------------

const NAV_LINKS = [
    { href: "#beranda", label: "Beranda" },
    { href: "#keuntungan", label: "Keuntungan" },
    { href: "#cara-kerja", label: "Cara Kerja" },
    { href: "#fitur", label: "Fitur" },
    { href: "#untuk-siapa", label: "Untuk Siapa" },
];

const BTN_PRIMARY =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#184D47] px-6 text-sm font-bold text-white shadow-[0_10px_24px_rgba(24,77,71,0.28)] transition hover:brightness-110 active:scale-[0.98]";
const BTN_GOLD =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#D4AF37] px-6 text-sm font-bold text-[#184D47] shadow-[0_10px_24px_rgba(212,175,55,0.30)] transition hover:brightness-105 active:scale-[0.98]";
const BTN_OUTLINE_LIGHT =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/40 px-6 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.98]";
const BTN_NAV =
    "rounded-full px-3.5 py-2 text-sm font-semibold text-[#184D47]/70 transition hover:bg-[#184D47]/5 hover:text-[#184D47]";
const BTN_NAV_SOLID =
    "rounded-full px-4 py-2 text-sm font-bold text-[#184D47] transition hover:bg-[#184D47]/10";
const ICON_BOX =
    "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#184D47]/10 text-[#C9A45B]";
const CARD =
    "rounded-3xl border border-[#184D47]/10 bg-white p-6 shadow-[0_4px_16px_rgba(18,53,36,0.06)]";

const BENEFITS = [
    {
        icon: Tags,
        title: "Harga Khusus Mitra",
        text: "Dapatkan harga produk khusus sesuai ketentuan mitra sehingga Anda memiliki dasar harga yang jelas untuk menjalankan usaha.",
    },
    {
        icon: PackageCheck,
        title: "Stok Lebih Terkontrol",
        text: "Pantau stok masuk, stok keluar, dan ketersediaan produk langsung dari dashboard Mitra.",
    },
    {
        icon: ShoppingCart,
        title: "Kasir Digital",
        text: "Catat transaksi penjualan langsung dari HP tanpa perlu pencatatan manual terpisah.",
    },
    {
        icon: ChartNoAxesCombined,
        title: "Laporan Usaha",
        text: "Pantau omzet, penjualan, dan laba kotor berdasarkan transaksi yang tercatat di sistem.",
    },
];

const STEPS = [
    {
        icon: UserPlus,
        no: "01",
        title: "Daftar",
        text: "Buat akun AFA MITRA dan lengkapi informasi usaha Anda.",
    },
    {
        icon: BadgeCheck,
        no: "02",
        title: "Verifikasi",
        text: "Tim AFA STORE meninjau pengajuan untuk memastikan data mitra sesuai.",
    },
    {
        icon: Store,
        no: "03",
        title: "Mulai Kelola",
        text: "Setelah disetujui, akses produk, harga mitra, stok, kasir, dan fitur operasional lainnya.",
    },
    {
        icon: ChartNoAxesCombined,
        no: "04",
        title: "Pantau Usaha",
        text: "Catat penjualan dan gunakan laporan untuk membantu mengevaluasi perkembangan usaha.",
    },
];

const FEATURES = [
    { icon: Tag, label: "Harga Mitra" },
    { icon: Package, label: "Produk" },
    { icon: Boxes, label: "Stok" },
    { icon: ShoppingCart, label: "Kasir" },
    { icon: ReceiptText, label: "Penjualan" },
    { icon: ChartNoAxesCombined, label: "Laporan" },
    { icon: MapPin, label: "Lokasi Operasional" },
    { icon: Store, label: "Profil Usaha" },
];

const AUDIENCES = [
    {
        icon: UserRound,
        title: "Reseller",
        text: "Untuk Anda yang ingin mulai menjual produk AFA STORE dengan skala fleksibel.",
    },
    {
        icon: Store,
        title: "Warung",
        text: "Tambahkan pilihan produk AFA STORE ke usaha yang sudah berjalan.",
    },
    {
        icon: ShoppingBag,
        title: "Toko",
        text: "Kelola produk dan transaksi dengan pencatatan yang lebih terstruktur.",
    },
    {
        icon: Building2,
        title: "Agen",
        text: "Untuk mitra yang ingin mengembangkan penjualan dengan jangkauan yang lebih luas sesuai ketentuan AFA STORE.",
    },
];

const METRICS = [
    { icon: ReceiptText, label: "Penjualan", value: "Tercatat otomatis" },
    { icon: Boxes, label: "Stok", value: "Terpantau" },
    { icon: TrendingUp, label: "Laba Kotor", value: "Terhitung" },
    { icon: FileChartColumn, label: "Laporan", value: "Siap dilihat" },
];

const SUPPORTS = [
    {
        icon: Handshake,
        title: "Produk & Harga Mitra",
        text: "Satu sumber informasi produk dan harga khusus mitra.",
    },
    {
        icon: Workflow,
        title: "Sistem Operasional",
        text: "Stok, kasir, penjualan, dan laporan saling terhubung.",
    },
    {
        icon: Sparkles,
        title: "Pengembangan Berkelanjutan",
        text: "Platform dapat terus dikembangkan mengikuti kebutuhan operasional AFA STORE dan mitra.",
    },
];

export function MitraLanding({ isActive = false }: { isActive?: boolean }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#F8F5EE] text-[#184D47]">
            {/* Header — navigasi portal Mitra, bukan navbar customer AFA STORE. */}
            <header className="sticky top-0 z-40 border-b border-[#C9A45B]/20 bg-[#F8F5EE]/90 backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
                    <Link href="/mitra" className="flex items-center gap-3" onClick={() => setOpen(false)}>
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#184D47] text-[#D4AF37]">
                            <Handshake size={20} />
                        </span>
                        <span className="leading-tight">
                            <span className="block text-base font-black tracking-tight">AFA MITRA</span>
                            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C9A45B]">
                                Partner Bisnis AFA STORE
                            </span>
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigasi utama">
                        {NAV_LINKS.map((n) => (
                            <a key={n.href} href={n.href} className={BTN_NAV}>
                                {n.label}
                            </a>
                        ))}
                    </nav>

                    <div className="hidden items-center gap-2 lg:flex">
                        {isActive ? (
                            <>
                                <Link href="/mitra/dashboard" className={BTN_NAV_SOLID}>
                                    Dashboard
                                </Link>
                                <Link href="/mitra/profil" className={`${BTN_GOLD} min-h-11 px-5`}>
                                    Akun
                                </Link>
                            </>
                        ) : (
                            <>
                                <Link href="/mitra/login" className={BTN_NAV_SOLID}>
                                    Masuk
                                </Link>
                                <Link href="/mitra/daftar" className={`${BTN_GOLD} min-h-11 px-5`}>
                                    Daftar
                                </Link>
                            </>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-label={open ? "Tutup menu" : "Buka menu"}
                        aria-expanded={open}
                        className="grid h-11 w-11 place-items-center rounded-xl text-[#184D47] transition hover:bg-[#184D47]/5 lg:hidden"
                    >
                        {open ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>

                {open ? (
                    <div className="border-t border-[#C9A45B]/20 bg-[#F8F5EE] px-4 pb-5 pt-3 lg:hidden">
                        <nav className="grid gap-1" aria-label="Navigasi mobile">
                            {NAV_LINKS.map((n) => (
                                <a
                                    key={n.href}
                                    href={n.href}
                                    onClick={() => setOpen(false)}
                                    className="rounded-xl px-4 py-3 text-sm font-semibold text-[#184D47] transition hover:bg-[#184D47]/5"
                                >
                                    {n.label}
                                </a>
                            ))}
                        </nav>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {isActive ? (
                                <>
                                    <Link
                                        href="/mitra/dashboard"
                                        onClick={() => setOpen(false)}
                                        className={`${BTN_NAV_SOLID} justify-center bg-[#184D47]/5 text-center`}
                                    >
                                        Dashboard
                                    </Link>
                                    <Link href="/mitra/profil" onClick={() => setOpen(false)} className={`${BTN_GOLD} justify-center text-center`}>
                                        Akun
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link
                                        href="/mitra/login"
                                        onClick={() => setOpen(false)}
                                        className={`${BTN_NAV_SOLID} justify-center bg-[#184D47]/5 text-center`}
                                    >
                                        Masuk
                                    </Link>
                                    <Link href="/mitra/daftar" onClick={() => setOpen(false)} className={`${BTN_GOLD} justify-center text-center`}>
                                        Daftar
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                ) : null}
            </header>

            <main>
                <section id="beranda" className="scroll-mt-24">
                    <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24 md:px-6">
                        <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#C9A45B]/30 bg-[#D4AF37]/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#8b6d1a]">
                            <Store size={14} /> Reseller • Warung • Toko • Agen
                        </p>
                        <h1 className="mx-auto mt-6 max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-4xl md:text-5xl">
                            Mulai Usaha, Kami Siapkan <span className="text-[#C9A45B]">Sistemnya</span>.
                        </h1>
                        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#184D47]/75 sm:text-lg">
                            Bergabung bersama AFA MITRA untuk mendapatkan akses harga khusus mitra,
                            pengelolaan stok, kasir penjualan, laporan usaha, dan sistem operasional
                            dalam satu platform.
                        </p>
                        <p className="mx-auto mt-4 max-w-xl text-sm text-[#184D47]/60">
                            Cocok untuk Anda yang ingin menjual produk AFA STORE secara lebih
                            terstruktur dan profesional.
                        </p>

                        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                            <Link href="/mitra/daftar" className={BTN_PRIMARY}>
                                Daftar AFA MITRA <ArrowRight size={18} />
                            </Link>
                        </div>

                        <a
                            href="#cara-kerja"
                            className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-[#184D47]/70 transition hover:text-[#184D47]"
                        >
                            Pelajari Cara Kerjanya <ArrowRight size={16} />
                        </a>
                    </div>
                </section>

                {/* KENAPA AFA MITRA */}
                <section id="keuntungan" className="scroll-mt-24 border-t border-[#184D47]/5 bg-white/50">
                    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 sm:py-20">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#C9A45B]">
                                Kenapa AFA MITRA?
                            </p>
                            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                                Lebih dari Sekadar Menjual Produk
                            </h2>
                            <p className="mt-4 text-base text-[#184D47]/70">
                                AFA MITRA menggabungkan akses produk dan sistem operasional agar
                                mitra dapat menjalankan usaha dengan lebih tertata.
                            </p>
                        </div>

                        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {BENEFITS.map((b) => (
                                <div key={b.title} className={CARD}>
                                    <span className={ICON_BOX}>
                                        <b.icon size={22} />
                                    </span>
                                    <h3 className="mt-4 font-black">{b.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-[#184D47]/65">{b.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CARA KERJA */}
                <section id="cara-kerja" className="scroll-mt-24">
                    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 sm:py-20">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#C9A45B]">
                                Cara Kerja
                            </p>
                            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                                Mulai dalam 4 Langkah
                            </h2>
                        </div>

                        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {STEPS.map((s) => (
                                <li key={s.no} className="relative rounded-3xl border border-[#184D47]/10 bg-white p-6 shadow-[0_4px_16px_rgba(18,53,36,0.06)]">
                                    <span className="text-xs font-black tracking-widest text-[#C9A45B]">{s.no}</span>
                                    <span className={`${ICON_BOX} mt-3`}>
                                        <s.icon size={22} />
                                    </span>
                                    <h3 className="mt-4 font-black">{s.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-[#184D47]/65">{s.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* SATU DASHBOARD */}
                <section id="fitur" className="scroll-mt-24 border-t border-[#184D47]/5 bg-white/50">
                    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 sm:py-20">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#C9A45B]">
                                Fitur
                            </p>
                            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                                Semua Kebutuhan Mitra dalam Satu Dashboard
                            </h2>
                            <p className="mt-4 text-base text-[#184D47]/70">
                                Tidak perlu mencatat usaha di banyak tempat. AFA MITRA membantu
                                menyatukan aktivitas operasional dalam satu sistem yang dapat diakses
                                melalui HP maupun desktop.
                            </p>
                        </div>

                        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {FEATURES.map((f) => (
                                <div
                                    key={f.label}
                                    className="flex items-center gap-3 rounded-2xl border border-[#184D47]/10 bg-white px-4 py-3.5 shadow-[0_2px_10px_rgba(18,53,36,0.04)]"
                                >
                                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#184D47]/10 text-[#C9A45B]">
                                        <f.icon size={20} />
                                    </span>
                                    <span className="text-sm font-bold leading-tight">{f.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* UNTUK SIAPA */}
                <section id="untuk-siapa" className="scroll-mt-24">
                    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 sm:py-20">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#C9A45B]">
                                Untuk Siapa
                            </p>
                            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                                AFA MITRA Cocok untuk Siapa?
                            </h2>
                        </div>

                        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {AUDIENCES.map((a) => (
                                <div key={a.title} className={CARD}>
                                    <span className={ICON_BOX}>
                                        <a.icon size={22} />
                                    </span>
                                    <h3 className="mt-4 font-black">{a.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-[#184D47]/65">{a.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* TRANSPARANSI USAHA */}
                <section className="scroll-mt-24 bg-[#184D47] py-16 text-white sm:py-20">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#D4AF37]">
                                Transparansi Usaha
                            </p>
                            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                                Keputusan Usaha Lebih Baik Dimulai dari Data
                            </h2>
                            <p className="mt-4 text-base leading-relaxed text-white/75">
                                Setiap transaksi yang dicatat membantu membentuk laporan penjualan
                                dan laba kotor. Dengan data yang lebih rapi, mitra dapat melihat
                                perkembangan usaha dan mengambil keputusan dengan lebih terukur.
                            </p>
                        </div>

                        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {METRICS.map((m) => (
                                <div key={m.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#D4AF37]/15 text-[#D4AF37]">
                                        <m.icon size={20} />
                                    </span>
                                    <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
                                        {m.label}
                                    </p>
                                    <p className="mt-1 text-base font-black text-[#F8F5EE]">{m.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* DUKUNGAN AFA STORE */}
                <section className="border-t border-[#184D47]/5 bg-white/50">
                    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 sm:py-20">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#C9A45B]">
                                Dukungan AFA STORE
                            </p>
                            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                                Tumbuh Bersama AFA STORE
                            </h2>
                            <p className="mt-4 text-base text-[#184D47]/70">
                                Kami membangun AFA MITRA agar hubungan dengan mitra tidak berhenti
                                pada pembelian produk. Sistem ini dirancang untuk membantu proses
                                operasional menjadi lebih mudah, transparan, dan terukur.
                            </p>
                        </div>

                        <div className="mt-10 grid gap-4 md:grid-cols-3">
                            {SUPPORTS.map((s) => (
                                <div key={s.title} className={CARD}>
                                    <span className={ICON_BOX}>
                                        <s.icon size={22} />
                                    </span>
                                    <h3 className="mt-4 font-black">{s.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-[#184D47]/65">{s.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* FINAL CTA */}
                <section className="bg-[#123524] py-16 text-white sm:py-20">
                    <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
                        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#C9A45B]/15 text-[#C9A45B]">
                            <Handshake size={24} />
                        </span>
                        <h2 className="mt-6 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                            Siap Menjadi Bagian dari AFA MITRA?
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-base text-white/75">
                            Mulai pendaftaran dan bangun usaha yang lebih tertata bersama ekosistem
                            AFA STORE.
                        </p>

                        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                            <Link href="/mitra/daftar" className={BTN_GOLD}>
                                Daftar AFA MITRA <ArrowRight size={18} />
                            </Link>
                            <Link href="/mitra/login" className={BTN_OUTLINE_LIGHT}>
                                Masuk Mitra
                            </Link>
                        </div>

                        <p className="mt-6 text-xs text-white/50">
                            Pendaftaran akan melalui proses verifikasi.
                        </p>
                    </div>
                </section>
            </main>

            {/* Footer (kompak) */}
            <footer className="bg-[#0f2b1d] text-white">
                <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
                    <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
                        <div>
                            <p className="flex items-center justify-center gap-2 text-base font-black sm:justify-start">
                                <Handshake size={18} className="text-[#C9A45B]" /> AFA MITRA
                            </p>
                            <p className="mt-1 text-xs text-white/55">Partner Bisnis AFA STORE</p>
                        </div>
                        <nav
                            aria-label="Footer Mitra"
                            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70"
                        >
                            <a href="#beranda" className="transition hover:text-white">Beranda</a>
                            <a href="#cara-kerja" className="transition hover:text-white">Cara Kerja</a>
                            <Link href="/mitra/daftar" className="transition hover:text-white">Daftar Mitra</Link>
                            <Link href="/mitra/login" className="transition hover:text-white">Masuk Mitra</Link>
                        </nav>
                    </div>
                    <p className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-white/45">
                        © 2026 AFA STORE
                    </p>
                </div>
            </footer>
        </div>
    );
}
