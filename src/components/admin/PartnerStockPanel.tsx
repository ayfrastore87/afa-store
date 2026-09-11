"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Loader2, PackageSearch } from "lucide-react";

import {
    formatDate,
    formatRupiah,
    getPartnerStockStatus,
    movementTypeLabel,
    PARTNER_STOCK_STATUS_LABELS,
    referenceLabel,
    type StockMovement,
    type StockRow,
} from "@/components/partner/partner-shared";
import { partnerStatusLabels } from "@/lib/partner";

type StocksResponse = {
    partner: { id: string; partnerCode: string; name: string; status: string };
    stocks: StockRow[];
    movements: StockMovement[];
};

type Props = {
    partnerId: string;
    partnerName: string;
    partnerCode: string;
    partnerStatus: string;
};

const stockStatusTone: Record<string, string> = {
    HABIS: "bg-[#f7e9e6] text-[#8c2e25]",
    MENIPIS: "bg-[#fff2d6] text-[#8b5e00]",
    TERSEDIA: "bg-[#e8f3e3] text-[#29621a]",
};

export function PartnerStockPanel({ partnerId, partnerName, partnerCode, partnerStatus }: Props) {
    const [data, setData] = useState<StocksResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/partners/${partnerId}/stocks`, { headers: { Accept: "application/json" } });
            const payload = (await response.json().catch(() => null)) as (StocksResponse & { message?: string }) | null;
            if (!response.ok) throw new Error(payload?.message || "Stok mitra gagal dimuat.");
            setData(payload as StocksResponse);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Stok mitra gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [partnerId]);

    useEffect(() => {
        void load();
    }, [load]);

    const totalUnits = useMemo(() => (data?.stocks ?? []).reduce((sum, stock) => sum + stock.quantity, 0), [data]);
    const outOfStockCount = useMemo(() => (data?.stocks ?? []).filter((stock) => stock.quantity <= 0).length, [data]);

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/mitra" className="text-sm font-bold text-[#184C3A]">← Kembali ke Mitra</Link>
                <header className="mt-4 mb-6 flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                        <Boxes size={24} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-black text-[#123d2d]">{partnerName}</h1>
                        <p className="text-sm text-[#69736d]">
                            {partnerCode} · <span className="font-bold">{partnerStatusLabels[partnerStatus] || partnerStatus}</span>
                        </p>
                    </div>
                </header>

                {loading ? (
                    <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat stok mitra..." />
                ) : error ? (
                    <State icon={<PackageSearch size={28} />} text={error} />
                ) : (
                    <div className="space-y-6">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Card label="Total Unit Stok" value={`${totalUnits} unit`} />
                            <Card label="Jumlah Produk" value={`${data?.stocks.length ?? 0} produk`} />
                            <Card label="Produk Habis" value={`${outOfStockCount} produk`} />
                        </div>

                        <section>
                            <h2 className="mb-2 text-lg font-black text-[#123d2d]">Stok Produk</h2>
                            {!data || data.stocks.length === 0 ? (
                                <State icon={<PackageSearch size={28} />} text="Belum ada stok untuk mitra ini." />
                            ) : (
                                <ul className="grid gap-2">
                                    {data.stocks.map((stock) => (
                                        <li key={stock.productId} className="flex items-center justify-between gap-3 rounded-2xl border border-[#ded9cc] bg-white p-3 shadow-sm">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-[#123d2d]">{stock.name}</p>
                                                <p className="text-xs text-[#858a86]">Modal {formatRupiah(stock.unitCost)} · diperbarui {formatDate(stock.updatedAt)}</p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${stockStatusTone[getPartnerStockStatus(stock.quantity)]}`}>
                                                {stock.quantity} unit · {PARTNER_STOCK_STATUS_LABELS[getPartnerStockStatus(stock.quantity)]}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section>
                            <h2 className="mb-2 text-lg font-black text-[#123d2d]">Riwayat Mutasi</h2>
                            {!data || data.movements.length === 0 ? (
                                <State icon={<PackageSearch size={28} />} text="Belum ada mutasi stok." />
                            ) : (
                                <ul className="grid gap-2">
                                    {data.movements.map((movement) => (
                                        <li key={movement.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#ded9cc] bg-white p-3 shadow-sm">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-[#123d2d]">{movement.productName}</p>
                                                <p className="text-xs text-[#858a86]">
                                                    {movementTypeLabel(movement.type)} · {referenceLabel(movement.referenceType)} · {formatDate(movement.createdAt)}
                                                    {movement.unitPrice != null ? ` · ${formatRupiah(movement.unitPrice)}/unit` : ""}
                                                    {movement.note ? ` · ${movement.note}` : ""}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 text-sm font-black ${movement.type === "IN" ? "text-[#29621a]" : "text-[#8c2e25]"}`}>
                                                {movement.type === "IN" ? "+" : "-"}{movement.quantity}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </main>
    );
}


function Card({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
            <p className="mt-2 text-xl font-black text-[#123d2d]">{value}</p>
        </div>
    );
}

function State({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 px-4 py-12 text-center">
            <span className="text-[#D4AF37]">{icon}</span>
            <p className="text-sm font-semibold text-[#69736d]">{text}</p>
        </div>
    );
}
