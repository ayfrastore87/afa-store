"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, PlusCircle, Store, Package, TrendingUp, Wallet, ReceiptText } from "lucide-react";

import { formatDate, formatRupiah } from "./sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type Summary = {
    salesName: string;
    activeStores: number;
    consignedStock: number;
    soldToday: number;
    settlementToday: number;
    receivable: number;
    todayVisits: {
        id: string;
        visitedAt: string;
        storeName: string;
        totalSold: number;
        totalSupplied: number;
        salesAmount: number;
    }[];
};

export function SalesDashboard() {
    const [data, setData] = useState<Summary | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let disposed = false;
        fetch("/api/sales/summary", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Ringkasan gagal dimuat.");
                if (!disposed) setData(payload as Summary);
            })
            .catch((err) => { if (!disposed) setError(getUserFacingMessage(err, "Ringkasan gagal dimuat.")); });
        return () => { disposed = true; };
    }, []);

    if (error) return <p className="sales-card rounded-2xl bg-white p-5 text-sm font-semibold text-red-700">{error}</p>;
    if (!data) return <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin text-[#184D47]" /></div>;

    const cards = [
        { label: "Toko Aktif", value: String(data.activeStores), icon: Store },
        { label: "Barang Dititipkan", value: `${data.consignedStock} pcs`, icon: Package },
        { label: "Terjual Hari Ini", value: `${data.soldToday} pcs`, icon: TrendingUp },
        { label: "Setoran Hari Ini", value: formatRupiah(data.settlementToday), icon: Wallet },
        { label: "Piutang Toko", value: formatRupiah(data.receivable), icon: ReceiptText },
    ];

    return (
        <div className="space-y-5">
            <h1 className="text-xl font-black">Halo, {data.salesName}</h1>

            <div className="grid grid-cols-2 gap-3">
                {cards.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="sales-card rounded-2xl bg-white p-4 shadow-sm shadow-[#123524]/5">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#184D47]/10 text-[#184D47]"><Icon size={18} /></span>
                        <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-[#123524]/55">{label}</p>
                        <p className="text-lg font-black">{value}</p>
                    </div>
                ))}
            </div>

            <Link
                href="/sales/kunjungan"
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#184D47] text-base font-black text-[#F8F5EE] shadow-lg shadow-[#184D47]/25 transition active:scale-[0.98]"
            >
                <PlusCircle size={22} /> CATAT KUNJUNGAN
            </Link>

            <section>
                <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-[#123524]/60">Kunjungan Hari Ini</h2>
                {data.todayVisits.length === 0 ? (
                    <p className="sales-card rounded-2xl bg-white p-5 text-sm text-[#123524]/55">Belum ada kunjungan hari ini.</p>
                ) : (
                    <ul className="space-y-3">
                        {data.todayVisits.map((visit) => (
                            <li key={visit.id} className="sales-card rounded-2xl bg-white p-4 shadow-sm shadow-[#123524]/5">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="font-black">{visit.storeName}</p>
                                    <p className="text-xs font-semibold text-[#123524]/50">{formatDate(visit.visitedAt)}</p>
                                </div>
                                <p className="mt-1 text-sm text-[#123524]/70">
                                    Terjual {visit.totalSold} pcs · Supply {visit.totalSupplied} pcs · {formatRupiah(visit.salesAmount)}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}