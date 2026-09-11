"use client";

import { useEffect, useState } from "react";
import { Loader2, PackageSearch, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { formatDate, formatRupiah, type DashboardSummary } from "@/components/partner/partner-shared";

type Props = {
    refreshSignal: number;
    onGoToSales: () => void;
};

export function PartnerSummaryTab({ refreshSignal, onGoToSales }: Props) {
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
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
    }, [refreshSignal]);

    if (loading) {
        return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat ringkasan..." />;
    }
    if (error) {
        return <State icon={<PackageSearch size={28} />} text={error} />;
    }
    if (!summary) {
        return <State icon={<PackageSearch size={28} />} text="Belum ada data." />;
    }

    const cards = [
        { label: "Penjualan Hari Ini", value: formatRupiah(summary.today.revenue), sub: `${summary.today.count} transaksi`, icon: Receipt },
        { label: "Penjualan Bulan Ini", value: formatRupiah(summary.month.revenue), sub: `${summary.month.count} transaksi`, icon: Wallet },
        { label: "Laba Bulan Ini", value: formatRupiah(summary.month.grossProfit), sub: "Estimasi laba kotor", icon: TrendingUp },
        { label: "Total Stok", value: `${summary.stock.totalUnits} unit`, sub: `${summary.stock.inStock} tersedia · ${summary.stock.lowStock} menipis · ${summary.stock.outOfStock} habis`, icon: TrendingDown },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map(({ label, value, sub, icon: Icon }) => (
                    <div key={label} className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                        <div className="flex items-center gap-2 text-[#184D47]/50">
                            <Icon size={16} />
                            <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
                        </div>
                        <p className="mt-2 text-xl font-black text-[#184D47]">{value}</p>
                        <p className="mt-1 text-xs text-[#184D47]/50">{sub}</p>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-black text-[#184D47]">Penjualan Terakhir</h2>
                <button
                    type="button"
                    onClick={onGoToSales}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#184D47] transition hover:brightness-105 active:scale-95"
                >
                    <Receipt size={16} />
                    Catat Penjualan
                </button>
            </div>

            {summary.recentSales.length === 0 ? (
                <State icon={<Receipt size={28} />} text="Belum ada penjualan. Catat penjualan pertama Anda." />
            ) : (
                <ul className="grid gap-2">
                    {summary.recentSales.map((sale) => (
                        <li key={sale.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[#184D47]">{sale.saleNumber}</p>
                                <p className="text-xs text-[#184D47]/50">{formatDate(sale.soldAt)} · {sale.itemCount} item</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-[#184D47]">{formatRupiah(sale.total)}</p>
                                <p className="text-xs text-[#1f7a4d]">Laba {formatRupiah(sale.grossProfit)}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
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
