"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    ArrowRight,
    Boxes,
    ChartNoAxesCombined,
    Flame,
    Handshake,
    Loader2,
    MapPin,
    Package,
    Plus,
    Receipt,
    ReceiptText,
    ShoppingCart,
    Tags,
    TrendingUp,
    WalletCards,
} from "lucide-react";

import { formatDate, formatRupiah, type DashboardSummary } from "@/components/partner/partner-shared";
import { PartnerLiveLocationCard } from "@/components/partner/live-location-card";
import { MITRA_CARD } from "@/components/mitra/mitra-theme";

type Props = { name: string; code: string };

// Operasional shortcuts — every feature of the business system, wired to the
// existing /mitra/* operational routes (no new pages/APIs).
const BUSINESS_SYSTEMS = [
    { href: "/mitra/produk", icon: Tags, title: "Produk & Harga Mitra", text: "Lihat produk dan harga khusus yang tersedia untuk akun Mitra Anda." },
    { href: "/mitra/stok", icon: Boxes, title: "Kelola Stok", text: "Pantau stok masuk, keluar, dan ketersediaan produk." },
    { href: "/mitra/kasir", icon: ShoppingCart, title: "Kasir Mitra", text: "Catat transaksi penjualan langsung dari perangkat Anda." },
    { href: "/mitra/penjualan", icon: ReceiptText, title: "Riwayat Penjualan", text: "Lihat transaksi yang telah tercatat." },
    { href: "/mitra/laporan", icon: ChartNoAxesCombined, title: "Laporan Usaha", text: "Pantau omzet dan laba kotor berdasarkan transaksi." },
    { href: "/mitra/lokasi", icon: MapPin, title: "Lokasi Usaha", text: "Kelola lokasi operasional Mitra." },
];

// Alur bisnis — desktop horizontal, mobile vertical.
const FLOW = [
    { icon: Package, title: "Pilih Produk", text: "Gunakan katalog dan harga khusus Mitra sebagai dasar penjualan." },
    { icon: Boxes, title: "Kelola Stok", text: "Pastikan ketersediaan produk tercatat." },
    { icon: ShoppingCart, title: "Catat Penjualan", text: "Gunakan Kasir Mitra setiap kali terjadi transaksi." },
    { icon: ChartNoAxesCombined, title: "Pantau Hasil", text: "Penjualan yang tercatat membentuk laporan usaha." },
];

export function MitraDashboard({ name, code }: Props) {
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/partner/dashboard", { headers: { Accept: "application/json" } })
            .then(async (response) => {
                const data = await response.json().catch(() => null);
                if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Ringkasan gagal dimuat.");
                if (!cancelled) setSummary(data as DashboardSummary);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Ringkasan gagal dimuat.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="space-y-5">
            {/* Business Hub — "Pusat Bisnis AFA MITRA" (bukan sekadar kasir). */}
            <section className="overflow-hidden rounded-3xl bg-[#184D47] text-white shadow-lg">
                <div className="p-5 sm:p-6">
                    <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">
                        <Handshake size={15} /> Pusat Bisnis AFA MITRA
                    </p>
                    <h1 className="mt-2 text-2xl font-black leading-tight">Selamat datang, {name}</h1>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">
                        Kelola usaha, pantau perkembangan, dan gunakan data penjualan untuk membantu
                        mengambil keputusan bisnis.
                    </p>
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-[#F4D995]">Kode: {code}</p>
                </div>
                <div className="flex gap-2 overflow-x-auto border-t border-white/10 bg-white/5 px-4 py-3 sm:px-6">
                    <Link href="/mitra/kasir" className="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-[#184D47] transition hover:bg-[#F4D995] active:scale-95">
                        <ShoppingCart size={18} /> Kasir
                    </Link>
                    <Link href="/mitra/stok" className="flex shrink-0 items-center gap-2 rounded-2xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-[#184D47] transition hover:brightness-105 active:scale-95">
                        <Plus size={18} /> Tambah Stok
                    </Link>
                    <Link href="/mitra/produk" className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20 active:scale-95">
                        <Tags size={18} /> Harga Mitra
                    </Link>
                    <Link href="/mitra/laporan" className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/20 active:scale-95">
                        <ChartNoAxesCombined size={18} /> Laporan
                    </Link>
                </div>
            </section>

            {loading ? (
                <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat ringkasan…" />
            ) : error ? (
                <State icon={<Receipt size={28} />} text={error} />
            ) : !summary ? (
                <State icon={<Receipt size={28} />} text="Belum ada data." />
            ) : (
                <>
                    {/* Ringkasan Usaha — data REAL dari /api/partner/dashboard (tanpa angka dummy). */}
                    <section className="space-y-3">
                        <div>
                            <h2 className="text-lg font-black">Ringkasan Usaha</h2>
                            <p className="text-sm text-[#184D47]/55">Data penjualan bulan berjalan dari transaksi yang tercatat.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <Metric icon={WalletCards} label="Omzet" value={formatRupiah(summary.month.revenue)} sub="bulan berjalan" />
                            <Metric icon={ReceiptText} label="Penjualan" value={`${summary.month.count}`} sub="transaksi bulan ini" />
                            <Metric icon={TrendingUp} label="Laba Kotor" value={formatRupiah(summary.month.grossProfit)} sub="bulan berjalan" />
                            <Metric icon={Boxes} label="Stok" value={`${summary.stock.totalUnits}`} sub={`${summary.stock.inStock} tersedia · ${summary.stock.lowStock} menipis`} />
                        </div>
                    </section>

                    {/* Sistem Bisnis Anda — shortcut operasional profesional. */}
                    <section className="space-y-3">
                        <div>
                            <h2 className="text-lg font-black">Sistem Bisnis Anda</h2>
                            <p className="text-sm text-[#184D47]/55">
                                Fitur AFA MITRA saling terhubung untuk membantu aktivitas usaha dari produk hingga laporan.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {BUSINESS_SYSTEMS.map((s) => (
                                <Link
                                    key={s.href}
                                    href={s.href}
                                    className={`${MITRA_CARD} flex items-start gap-3 p-4 transition hover:border-[#C9A45B]/40 hover:shadow-md active:scale-[0.99]`}
                                >
                                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#184D47]/10 text-[#C9A45B]">
                                        <s.icon size={22} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-black">{s.title}</p>
                                        <p className="mt-1 text-xs leading-relaxed text-[#184D47]/60">{s.text}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>

                    {/* Alur Bisnis AFA MITRA — desktop horizontal, mobile vertical. */}
                    <section className="space-y-4 rounded-3xl border border-[#184D47]/10 bg-white/60 p-5 sm:p-6">
                        <div>
                            <h2 className="text-lg font-black">Bagaimana Sistem AFA MITRA Membantu Usaha Anda?</h2>
                            <p className="mt-1 text-sm text-[#184D47]/55">Empat langkah operasional yang saling terhubung.</p>
                        </div>
                        <ol className="grid gap-4 md:grid-cols-4">
                            {FLOW.map((f, i) => (
                                <Fragment key={f.title}>
                                    <li className="relative flex flex-col gap-2">
                                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#184D47] text-[#D4AF37]">
                                            <f.icon size={22} />
                                        </span>
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-wide text-[#C9A45B]">Langkah {i + 1}</p>
                                            <p className="mt-0.5 text-sm font-black">{f.title}</p>
                                            <p className="mt-1 text-xs leading-relaxed text-[#184D47]/60">{f.text}</p>
                                        </div>
                                    </li>
                                    {i < FLOW.length - 1 ? (
                                        <ArrowRight className="hidden self-center justify-self-center text-[#C9A45B]/60 md:block" size={22} />
                                    ) : null}
                                </Fragment>
                            ))}
                        </ol>
                    </section>

                    {/* Business Insight — pantau perkembangan usaha. */}
                    <section className={`${MITRA_CARD} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`}>
                        <div className="min-w-0">
                            <h2 className="text-lg font-black">Pantau Perkembangan Usaha</h2>
                            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#184D47]/60">
                                Data transaksi yang tercatat membantu Anda memahami aktivitas penjualan, pergerakan stok,
                                omzet, dan laba kotor secara lebih terstruktur.
                            </p>
                        </div>
                        <Link
                            href="/mitra/laporan"
                            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#184D47] px-5 text-sm font-black text-white transition hover:brightness-110 active:scale-95"
                        >
                            Lihat Laporan <ArrowRight size={18} />
                        </Link>
                    </section>

                    {/* Konsep Kemitraan — premium card menuju halaman konsep bisnis. */}
                    <section className="overflow-hidden rounded-3xl border border-[#C9A45B]/30 bg-gradient-to-br from-[#123524] to-[#1B4E42] p-6 text-white shadow-lg">
                        <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">
                            <Handshake size={15} /> Konsep Kemitraan AFA STORE
                        </p>
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85">
                            AFA MITRA dirancang sebagai ekosistem bisnis yang menghubungkan produk, harga mitra, stok,
                            transaksi, dan laporan dalam satu sistem.
                        </p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl bg-white/5 p-4">
                                <p className="text-sm font-black text-[#F4D995]">Harga Mitra</p>
                                <p className="mt-1 text-xs leading-relaxed text-white/70">Akses produk sesuai ketentuan akun.</p>
                            </div>
                            <div className="rounded-2xl bg-white/5 p-4">
                                <p className="text-sm font-black text-[#F4D995]">Operasional</p>
                                <p className="mt-1 text-xs leading-relaxed text-white/70">Stok dan transaksi tercatat dalam satu platform.</p>
                            </div>
                            <div className="rounded-2xl bg-white/5 p-4">
                                <p className="text-sm font-black text-[#F4D995]">Evaluasi</p>
                                <p className="mt-1 text-xs leading-relaxed text-white/70">Laporan membantu melihat perkembangan usaha berdasarkan data yang tercatat.</p>
                            </div>
                        </div>
                        <Link
                            href="/mitra?view=business"
                            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] px-5 text-sm font-black text-[#123524] transition hover:brightness-105 active:scale-95"
                        >
                            Pelajari Konsep Bisnis <ArrowRight size={18} />
                        </Link>
                    </section>

                    <PartnerLiveLocationCard />

                    <section className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-black">Produk Terlaris</h2>
                            <Link href="/mitra/laporan" className="text-sm font-bold text-[#184D47]/60">Lihat laporan</Link>
                        </div>
                        {summary.bestSellers.length === 0 ? (
                            <div className={`${MITRA_CARD} p-4 text-center text-sm text-[#184D47]/50`}>Belum ada data produk terlaris.</div>
                        ) : (
                            <ul className="grid gap-2">
                                {summary.bestSellers.map((item, index) => (
                                    <li key={item.name} className={`${MITRA_CARD} flex items-center gap-3 p-3`}>
                                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#184D47] text-sm font-black text-[#D4AF37]">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold">{item.name}</p>
                                            <p className="text-xs text-[#184D47]/50">{item.quantity} unit terjual</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black">{formatRupiah(item.revenue)}</p>
                                            <p className="inline-flex items-center gap-1 text-xs text-[#C9A45B]"><Flame size={12} /> {item.quantity}x</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-black">Stok Menipis</h2>
                            <Link href="/mitra/stok" className="text-sm font-bold text-[#184D47]/60">Kelola stok</Link>
                        </div>
                        {summary.stock.lowStockItems.length === 0 ? (
                            <div className={`${MITRA_CARD} p-4 text-center text-sm text-[#184D47]/50`}>Stok aman. Tidak ada produk yang menipis.</div>
                        ) : (
                            <ul className="grid gap-2">
                                {summary.stock.lowStockItems.map((item) => (
                                    <li key={item.productId} className={`${MITRA_CARD} flex items-center gap-3 p-3`}>
                                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#C9A45B]/20 text-[#8c6d1f]">
                                            <AlertTriangle size={18} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold">{item.name}</p>
                                            <p className="text-xs text-[#184D47]/50">Sisa stok menipis</p>
                                        </div>
                                        <span className="rounded-full bg-[#f7e9e6] px-3 py-1 text-xs font-black text-[#8c2e25]">{item.quantity} unit</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-black">Penjualan Terbaru</h2>
                            <Link href="/mitra/penjualan" className="text-sm font-bold text-[#184D47]/60">Lihat semua</Link>
                        </div>
                        {summary.recentSales.length === 0 ? (
                            <div className={`${MITRA_CARD} p-4 text-center text-sm text-[#184D47]/50`}>Belum ada penjualan. Catat penjualan pertama Anda.</div>
                        ) : (
                            <ul className="grid gap-2">
                                {summary.recentSales.map((sale) => (
                                    <li key={sale.id} className={`${MITRA_CARD} flex items-center justify-between gap-3 p-3`}>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold">{sale.saleNumber}</p>
                                            <p className="text-xs text-[#184D47]/50">{formatDate(sale.soldAt)} · {sale.itemCount} item</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black">{formatRupiah(sale.total)}</p>
                                            <p className="text-xs text-[#1f7a4d]">Laba {formatRupiah(sale.grossProfit)}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

function Metric({ icon: Icon, label, value, sub }: { icon: typeof Receipt; label: string; value: string; sub: string }) {
    return (
        <div className={`${MITRA_CARD} p-4`}>
            <div className="flex items-center gap-2 text-[#184D47]/50">
                <Icon size={15} />
                <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
            </div>
            <p className="mt-2 text-xl font-black">{value}</p>
            <p className="mt-1 text-xs text-[#184D47]/50">{sub}</p>
        </div>
    );
}

function State({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#184D47]/15 bg-white/50 px-4 py-12 text-center">
            <span className="text-[#C9A45B]">{icon}</span>
            <p className="text-sm font-semibold text-[#184D47]/60">{text}</p>
        </div>
    );
}
