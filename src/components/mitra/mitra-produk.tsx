"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Loader2, PackageSearch, Search } from "lucide-react";

import { formatRupiah, type PartnerProduct } from "@/components/partner/partner-shared";
import { MITRA_CARD, MITRA_INPUT } from "@/components/mitra/mitra-theme";

type PartnerPrice = { productId: string; price: number; costPrice: number };
type ProductsResponse = { products: PartnerProduct[] };
type PricesResponse = { prices: PartnerPrice[] };

export function MitraProduk() {
    const [products, setProducts] = useState<PartnerProduct[]>([]);
    const [prices, setPrices] = useState<PartnerPrice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [onlyStock, setOnlyStock] = useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetch("/api/partner/products", { headers: { Accept: "application/json" } }),
            fetch("/api/partner/prices", { headers: { Accept: "application/json" } }),
        ])
            .then(async ([productsRes, pricesRes]) => {
                const productsData = (await productsRes.json().catch(() => null)) as ProductsResponse | null;
                const pricesData = (await pricesRes.json().catch(() => null)) as PricesResponse | null;
                if (!productsRes.ok) throw new Error((productsData as { message?: string } | null)?.message || "Produk gagal dimuat.");
                if (!cancelled) {
                    setProducts(productsData?.products ?? []);
                    setPrices(pricesData?.prices ?? []);
                }
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Produk gagal dimuat.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const costByProduct = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of prices) map.set(p.productId, p.costPrice);
        return map;
    }, [prices]);

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        return products.filter((p) => {
            if (onlyStock && p.partnerStock <= 0) return false;
            if (!term) return true;
            return p.name.toLowerCase().includes(term) || (p.flavor ?? "").toLowerCase().includes(term);
        });
    }, [products, query, onlyStock]);

    if (loading) return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat produk…" />;
    if (error) return <State icon={<PackageSearch size={28} />} text={error} />;

    return (
        <div className="space-y-4">
            <div className={`${MITRA_CARD} p-3`}>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-3 text-[#184D47]/40" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari produk…" className={`${MITRA_INPUT} mt-0 pl-9`} />
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm font-bold text-[#184D47]/70">
                    <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} className="h-4 w-4 accent-[#184D47]" />
                    Hanya produk dengan stok mitra
                </label>
            </div>

            {filtered.length === 0 ? (
                <State icon={<PackageSearch size={28} />} text="Tidak ada produk untuk filter ini." />
            ) : (
                <ul className="grid gap-2">
                    {filtered.map((p) => {
                        const cost = costByProduct.get(p.productId) ?? p.price;
                        const margin = p.price - cost;
                        return (
                            <li key={p.productId} className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
                                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#faf8f2]">
                                    <Image src={p.image || "/AFA LOGO.svg"} alt={p.name} fill className="object-contain p-1" unoptimized />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">{p.name}</p>
                                    <p className="text-xs text-[#184D47]/50">Retail {formatRupiah(p.price)} · Mitra {formatRupiah(cost)}</p>
                                    <p className="text-xs">
                                        <span className={p.partnerStock > 0 ? "text-[#184D47]/60" : "text-[#8c2e25]"}>Stok {p.partnerStock}</span>
                                        {p.flavor ? ` · ${p.flavor}` : ""}
                                    </p>
                                </div>
                                {margin > 0 ? (
                                    <span className="shrink-0 rounded-xl bg-[#e8f3e3] px-2.5 py-1.5 text-right text-xs font-black text-[#29621a]">+{formatRupiah(margin)}</span>
                                ) : null}
                            </li>
                        );
                    })}
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