"use client";

import { useMemo, useState } from "react";
import { Loader2, Minus, Plus, Search } from "lucide-react";
import { formatRupiah, type Product } from "@/lib/products";
import { GUEST_FORM_MAX_ITEMS, type GuestLine } from "./guest-pre-order-shared";

type Props = {
    products: Product[];
    loading: boolean;
    loadError: string;
    onRetry: () => void;
    lines: GuestLine[];
    add: (productId: string) => void;
    remove: (productId: string) => void;
    setQty: (productId: string, qty: number) => void;
};

export default function GuestProductPicker({ products, loading, loadError, onRetry, lines, add, remove, setQty }: Props) {
    const [search, setSearch] = useState("");
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q)) : products;
    }, [products, search]);

    return (
        <section className="space-y-4 rounded-3xl border border-[#C9A45B]/20 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">1. Pilih Produk</h2>
            <label className="flex h-11 items-center gap-2 rounded-2xl border border-[#123524]/15 px-3">
                <Search size={16} className="text-[#C9A45B]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Cari produk" />
            </label>
            {loading ? <p className="flex items-center gap-2 text-sm text-[#6D6558]"><Loader2 size={16} className="animate-spin" /> Memuat produk...</p> : null}
            {loadError ? <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{loadError} <button type="button" onClick={onRetry} className="ml-2 font-bold underline">Coba lagi</button></div> : null}
            {!loading && !loadError && filtered.length === 0 ? <p className="text-sm text-[#6D6558]">Tidak ada produk yang cocok.</p> : null}
            <ul className="grid gap-2 sm:grid-cols-2">
                {filtered.map((p) => {
                    const line = lines.find((l) => l.productId === p.id);
                    return (
                        <li key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#123524]/10 p-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{p.name}</p>
                                <p className="text-xs text-[#6D6558]">{p.category ?? "Produk"} · {formatRupiah(p.price)}</p>
                            </div>
                            {line ? (
                                <div className="flex shrink-0 items-center gap-1">
                                    <button type="button" onClick={() => (line.quantity <= 1 ? remove(p.id) : setQty(p.id, line.quantity - 1))} aria-label={`Kurangi ${p.name}`} className="grid h-8 w-8 place-items-center rounded-lg border border-[#123524]/15"><Minus size={14} /></button>
                                    <input inputMode="numeric" value={line.quantity} onChange={(e) => setQty(p.id, Number(e.target.value.replace(/\D/g, "")) || 1)} aria-label={`Jumlah ${p.name}`} className="h-8 w-12 rounded-lg border border-[#123524]/15 text-center text-sm font-bold" />
                                    <button type="button" onClick={() => setQty(p.id, line.quantity + 1)} aria-label={`Tambah ${p.name}`} className="grid h-8 w-8 place-items-center rounded-lg border border-[#123524]/15"><Plus size={14} /></button>
                                </div>
                            ) : (
                                <button type="button" onClick={() => add(p.id)} disabled={lines.length >= GUEST_FORM_MAX_ITEMS} className="shrink-0 rounded-xl bg-[#123524] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Tambah</button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
