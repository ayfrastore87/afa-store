"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, FileText, Flame, Loader2, Plus, Receipt, ShoppingCart, TrendingUp, Wallet } from "lucide-react";

import { formatDate, formatRupiah, type DashboardSummary } from "@/components/partner/partner-shared";
import { PartnerLiveLocationCard } from "@/components/partner/live-location-card";
import { MitraQuickLinks } from "@/components/mitra/mitra-shell";
import { MITRA_CARD } from "@/components/mitra/mitra-theme";

type Props = { name: string; code: string };

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
            <div className="rounded-3xl bg-[#184D47] p-5 text-white shadow-lg">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#D4AF37]">Halo, {name}</p>
                <p className="mt-1 text-2xl font-black">Selamat berdagang 👋</p>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-[#F4D995]">Kode: {code}</p>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
                <Link href="/mitra/kasir" className="flex shrink-0 items-center gap-2 rounded-2xl bg-[#184D47] px-4 py-3 text-sm font-black text-white transition hover:brightness-110 active:scale-95">
                    <ShoppingCart size={18} /> Kasir
                </Link>
                <Link href="/mitra/stok" className="flex shrink-0 items-center gap-2 rounded-2xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-[#184D47] transition hover:brightness-105 active:scale-95">
                    <Plus size={18} /> Tambah Stok
                </Link>
                <Link href="/mitra/produk" className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/80 px-4 py-3 text-sm font-black text-[#184D47] transition hover:bg-white active:scale-95">
                    <Boxes size={18} /> Harga Mitra
                </Link>
                <Link href="/mitra/laporan" className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/80 px-4 py-3 text-sm font-black text-[#184D47] transition hover:bg-white active:scale-95">
                    <FileText size={18} /> Laporan
                </Link>
            </div>

            {loading ? (
                <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat ringkasan…" />
            ) : error ? (
                <State icon={<Receipt size={28} />} text={error} />
            ) : !summary ? (
                <State icon={<Receipt size={28} />} text="Belum ada data." />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <Metric icon={Receipt} label="Penjualan Hari Ini" value={`${summary.today.count}`} sub="transaksi hari ini" />
                        <Metric icon={Wallet} label="Omzet Hari Ini" value={formatRupiah(summary.today.revenue)} sub={`${summary.today.count} transaksi`} />
                        <Metric icon={TrendingUp} label="Laba Kotor" value={formatRupiah(summary.month.grossProfit)} sub="estimasi · bulan berjalan" />
                        <Metric icon={Boxes} label="Total Stok" value={`${summary.stock.totalUnits}`} sub={`${summary.stock.inStock} tersedia · ${summary.stock.lowStock} menipis`} />
                    </div>

                    <section className="space-y-2">
                        <h2 className="text-base font-black">Menu Lainnya</h2>
                        <MitraQuickLinks />
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
