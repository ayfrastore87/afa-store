"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, MapPin, Search, Store } from "lucide-react";

import { formatRupiah } from "./sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type StoreItem = {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    hasCoordinates: boolean;
    latitude: number | null;
    longitude: number | null;
    stocks: { productId: string; name: string; currentStock: number }[];
    totalStock: number;
    receivable: number;
    lastVisitAt: string | null;
};

export function SalesStoreList() {
    const [stores, setStores] = useState<StoreItem[] | null>(null);
    const [search, setSearch] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let disposed = false;
        const handle = setTimeout(() => {
            const params = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
            fetch(`/api/sales/stores${params}`, { headers: { Accept: "application/json" }, cache: "no-store" })
                .then(async (response) => {
                    const payload = await response.json().catch(() => null);
                    if (!response.ok) throw new Error(payload?.message || "Daftar toko gagal dimuat.");
                    if (!disposed) setStores((payload as { stores: StoreItem[] }).stores);
                })
                .catch((err) => { if (!disposed) setError(getUserFacingMessage(err, "Daftar toko gagal dimuat.")); });
        }, 300);
        return () => { disposed = true; clearTimeout(handle); };
    }, [search]);

    return (
        <div className="space-y-4">
            <h1 className="text-xl font-black">Toko Titip Jual</h1>

            <label className="sales-card flex min-h-12 items-center gap-2 rounded-2xl bg-white px-4 shadow-sm shadow-[#123524]/5">
                <Search size={18} className="text-[#123524]/40" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari toko..."
                    className="w-full bg-transparent py-3 text-sm font-semibold outline-none"
                />
            </label>

            {error && <p className="sales-card rounded-2xl bg-white p-5 text-sm font-semibold text-red-700">{error}</p>}
            {!stores && !error && <div className="grid min-h-40 place-items-center"><Loader2 className="animate-spin text-[#184D47]" /></div>}

            {stores && stores.length === 0 && (
                <div className="sales-card grid place-items-center gap-2 rounded-2xl bg-white p-8 text-center">
                    <Store className="text-[#D4AF37]" />
                    <p className="text-sm font-semibold text-[#123524]/55">Belum ada toko yang ditugaskan kepada Anda.</p>
                </div>
            )}

            <ul className="space-y-3">
                {stores?.map((store) => (
                    <li key={store.id} className="sales-card rounded-2xl bg-white p-4 shadow-sm shadow-[#123524]/5">
                        <p className="text-base font-black uppercase">{store.name}</p>
                        {store.address && <p className="text-xs font-semibold text-[#123524]/50">{store.address}</p>}

                        {store.stocks.length > 0 && (
                            <ul className="mt-3 space-y-1 text-sm">
                                {store.stocks.map((stock) => (
                                    <li key={stock.productId} className="flex justify-between gap-3">
                                        <span className="text-[#123524]/75">{stock.name}</span>
                                        <span className="font-bold">Sisa {stock.currentStock} pcs</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <div className="mt-3 flex items-center justify-between border-t border-[#123524]/10 pt-3 text-sm">
                            <span className="font-bold">Total stok: {store.totalStock} pcs</span>
                            <span className="font-black text-[#8B6B3F]">Piutang: {formatRupiah(store.receivable)}</span>
                        </div>

                        <div className="mt-3 flex gap-2">
                            <Link
                                href={`/sales/kunjungan?storeId=${store.id}`}
                                className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#184D47] text-sm font-black text-[#F8F5EE] transition active:scale-[0.98]"
                            >
                                KUNJUNGI
                            </Link>
                            {store.hasCoordinates && (
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${store.latitude},${store.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-[#184D47]/25 px-4 text-sm font-bold text-[#184D47]"
                                >
                                    <MapPin size={16} /> Peta
                                </a>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}