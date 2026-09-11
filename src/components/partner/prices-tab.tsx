"use client";

import { useEffect, useState } from "react";
import { Loader2, PackageSearch, Tags } from "lucide-react";

import { formatDate, formatRupiah } from "@/components/partner/partner-shared";

type PartnerPrice = {
    productId: string;
    name: string;
    price: number;
    costPrice: number;
    hasCustomPrice: boolean;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    size: string | null;
    flavor: string | null;
};

type PriceHistory = {
    id: string;
    productId: string;
    productName: string;
    price: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: string;
};

type PricesResponse = { prices: PartnerPrice[]; history: PriceHistory[] };

const statusTone: Record<string, string> = {
    Aktif: "bg-[#e8f3e3] text-[#29621a]",
    "Akan Datang": "bg-[#fff2d6] text-[#8b5e00]",
    Berakhir: "bg-[#f5ebd8] text-[#76551d]",
};

export function PartnerPricesTab() {
    const [prices, setPrices] = useState<PartnerPrice[]>([]);
    const [history, setHistory] = useState<PriceHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        fetch("/api/partner/prices", { headers: { Accept: "application/json" } })
            .then(async (response) => {
                const data = (await response.json().catch(() => null)) as PricesResponse | null;
                if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Harga modal gagal dimuat.");
                if (!cancelled) {
                    setPrices(data?.prices ?? []);
                    setHistory(data?.history ?? []);
                }
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Harga modal gagal dimuat.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat harga modal…" />;
    }
    if (error) {
        return <State icon={<PackageSearch size={28} />} text={error} />;
    }

    const customCount = prices.filter((p) => p.hasCustomPrice).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-[#184D47]">Harga Modal Mitra</h2>
                    <p className="text-xs text-[#184D47]/60">{customCount} produk dengan harga modal khusus.</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37]/20 px-3 py-2 text-xs font-bold text-[#8b6d1a]">
                    <Tags size={15} /> Harga ditentukan AFA STORE
                </span>
            </div>

            {prices.length === 0 ? (
                <State icon={<PackageSearch size={28} />} text="Belum ada data produk." />
            ) : (
                <ul className="grid gap-2">
                    {prices.map((p) => (
                        <li key={p.productId} className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[#184D47]">{p.name}</p>
                                <p className="text-xs text-[#184D47]/50">
                                    Harga katalog {formatRupiah(p.price)}
                                    {p.hasCustomPrice && p.effectiveFrom ? ` · berlaku ${formatDate(p.effectiveFrom)}` : ""}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-[#184D47]">{formatRupiah(p.costPrice)}</p>
                                <p className="text-xs text-[#184D47]/50">{p.hasCustomPrice ? "Harga khusus" : "Harga katalog"}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <div>
                <h3 className="mb-2 text-base font-black text-[#184D47]">Riwayat Harga</h3>
                {history.length === 0 ? (
                    <State icon={<PackageSearch size={28} />} text="Belum ada riwayat harga." />
                ) : (
                    <ul className="grid gap-2">
                        {history.map((h) => (
                            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-[#184D47]">{h.productName}</p>
                                    <p className="text-xs text-[#184D47]/50">{formatDate(h.effectiveFrom)} → {h.effectiveTo ? formatDate(h.effectiveTo) : "sekarang"}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-[#184D47]">{formatRupiah(h.price)}</span>
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTone[h.status] || "bg-gray-100 text-gray-600"}`}>{h.status}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
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
