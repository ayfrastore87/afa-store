"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Receipt } from "lucide-react";

import { formatDate, formatRupiah, type SaleRow } from "@/components/partner/partner-shared";

export function PartnerHistoryTab({ refreshSignal }: { refreshSignal: number }) {
    const [sales, setSales] = useState<SaleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [openId, setOpenId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        fetch("/api/partner/sales", { headers: { Accept: "application/json" } })
            .then(async (response) => {
                const data = await response.json().catch(() => null);
                if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Riwayat gagal dimuat.");
                if (!cancelled) setSales((data as { sales: SaleRow[] }).sales ?? []);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Riwayat gagal dimuat.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [refreshSignal]);

    if (loading) {
        return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat riwayat..." />;
    }
    if (error) {
        return <State icon={<Receipt size={28} />} text={error} />;
    }
    if (sales.length === 0) {
        return <State icon={<Receipt size={28} />} text="Belum ada penjualan." />;
    }

    return (
        <ul className="grid gap-2">
            {sales.map((sale) => {
                const open = openId === sale.id;
                return (
                    <li key={sale.id} className="overflow-hidden rounded-2xl border border-white/70 bg-white/80 shadow-sm backdrop-blur">
                        <button
                            type="button"
                            onClick={() => setOpenId(open ? null : sale.id)}
                            className="flex w-full items-center justify-between gap-3 p-3 text-left"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[#184D47]">{sale.saleNumber}</p>
                                <p className="text-xs text-[#184D47]/50">{formatDate(sale.soldAt)} · {sale.itemCount} item</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                                <div className="text-right">
                                    <p className="text-sm font-black text-[#184D47]">{formatRupiah(sale.total)}</p>
                                    <p className="text-xs text-[#1f7a4d]">Laba {formatRupiah(sale.grossProfit)}</p>
                                </div>
                                {open ? <ChevronUp size={18} className="text-[#184D47]/40" /> : <ChevronDown size={18} className="text-[#184D47]/40" />}
                            </div>
                        </button>
                        {open && (
                            <div className="border-t border-[#184D47]/10 bg-white/50 p-3">
                                {sale.note && <p className="mb-2 text-xs text-[#184D47]/60">Catatan: {sale.note}</p>}
                                <ul className="space-y-1">
                                    {sale.items.map((item, index) => (
                                        <li key={index} className="flex items-center justify-between gap-2 text-sm">
                                            <span className="min-w-0 flex-1 truncate text-[#184D47]">{item.name} × {item.quantity}</span>
                                            <span className="shrink-0 font-bold text-[#184D47]">{formatRupiah(item.subtotalRevenue)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function State({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#184D47]/15 bg-white/50 px-4 py-10 text-center">
            <span className="text-[#C9A45B]">{icon}</span>
            <p className="text-sm font-semibold text-[#184D47]/60">{text}</p>
        </div>
    );
}
