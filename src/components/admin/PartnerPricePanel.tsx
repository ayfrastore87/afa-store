"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, PackageSearch, Plus, Tags } from "lucide-react";

import { partnerStatusLabels } from "@/lib/partner";

type PriceProduct = {
    id: string;
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
    createdAt: string;
};

type PricesResponse = {
    products: PriceProduct[];
    history: PriceHistory[];
};

type Props = {
    partnerId: string;
    partnerName: string;
    partnerCode: string;
    partnerStatus: string;
};

const statusTone: Record<string, string> = {
    Aktif: "bg-[#e8f3e3] text-[#29621a]",
    "Akan Datang": "bg-[#fff2d6] text-[#8b5e00]",
    Berakhir: "bg-[#f5ebd8] text-[#76551d]",
};

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const dateOnly = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-";

function todayInputValue() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
}


export function PartnerPricePanel({ partnerId, partnerName, partnerCode, partnerStatus }: Props) {
    const [products, setProducts] = useState<PriceProduct[]>([]);
    const [history, setHistory] = useState<PriceHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const [productId, setProductId] = useState("");
    const [price, setPrice] = useState("");
    const [effectiveFrom, setEffectiveFrom] = useState(todayInputValue());
    const [submitting, setSubmitting] = useState(false);

    const isActive = partnerStatus === "ACTIVE";

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/partners/${partnerId}/prices`, { headers: { Accept: "application/json" } });
            const data = (await response.json().catch(() => null)) as PricesResponse | null;
            if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Harga gagal dimuat.");
            setProducts(data?.products ?? []);
            setHistory(data?.history ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Harga gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [partnerId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setMessage("");
        try {
            const response = await fetch(`/api/admin/partners/${partnerId}/prices`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ productId, price: Number(price), effectiveFrom }),
            });
            const data = (await response.json().catch(() => null)) as { message?: string } | null;
            if (response.ok) {
                setMessage(data?.message || "Harga modal disimpan.");
                setPrice("");
                await load();
            } else {
                setMessage(data?.message || "Harga gagal disimpan.");
            }
        } catch {
            setMessage("Harga gagal disimpan. Silakan coba lagi.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/mitra" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#184C3A] hover:text-[#123a36]">
                    <ArrowLeft size={15} /> Kembali ke Mitra
                </Link>

                <header className="mt-4 mb-6 flex flex-wrap items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                        <Tags size={24} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl font-black text-[#123d2d]">{partnerName}</h1>
                        <p className="text-xs text-[#858a86]">{partnerCode} · {partnerStatusLabels[partnerStatus] || partnerStatus}</p>
                    </div>
                    <div className="ml-auto rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#184C3A] shadow-sm">Manajemen Harga Modal</div>
                </header>

                {!isActive && (
                    <p className="mb-4 rounded-2xl border border-[#f0d9a6] bg-[#fff7e6] px-4 py-3 text-sm text-[#8b5e00]">
                        Mitra belum berstatus Aktif, sehingga harga modal baru tidak dapat ditetapkan.
                    </p>
                )}

                {message && <p className="mb-4 rounded-2xl border border-[#cfe3d2] bg-[#eaf4ec] px-4 py-3 text-sm font-semibold text-[#29621a]">{message}</p>}
                {error && <p className="mb-4 rounded-2xl border border-[#f0d9d6] bg-[#fbf0ee] px-4 py-3 text-sm font-semibold text-[#8c2e25]">{error}</p>}

                {isActive && (
                    <form onSubmit={submit} className="mb-6 rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-sm">
                        <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-[#123d2d]">
                            <Plus size={16} /> Tetapkan Harga Modal Baru
                        </h2>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <label className="block">
                                <span className="text-xs font-bold text-[#69736d]">Produk</span>
                                <select
                                    value={productId}
                                    onChange={(e) => setProductId(e.target.value)}
                                    required
                                    className="mt-1 w-full rounded-xl border border-[#ded9cc] bg-white px-3 py-2.5 text-sm"
                                >
                                    <option value="">Pilih produk…</option>
                                    {products.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold text-[#69736d]">Harga Modal (Rp)</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    placeholder="12000"
                                    required
                                    className="mt-1 w-full rounded-xl border border-[#ded9cc] bg-white px-3 py-2.5 text-sm"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold text-[#69736d]">Mulai Berlaku</span>
                                <input
                                    type="date"
                                    value={effectiveFrom}
                                    onChange={(e) => setEffectiveFrom(e.target.value)}
                                    required
                                    className="mt-1 w-full rounded-xl border border-[#ded9cc] bg-white px-3 py-2.5 text-sm"
                                />
                            </label>
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#184C3A] px-5 text-sm font-bold text-white hover:bg-[#123a36] disabled:opacity-60"
                        >
                            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Simpan Harga
                        </button>
                    </form>
                )}

                <section className="rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-sm">
                    <h2 className="mb-3 text-sm font-black text-[#123d2d]">Harga Modal Saat Ini</h2>
                    {loading ? (
                        <State icon={<Loader2 className="animate-spin" size={24} />} text="Memuat…" />
                    ) : products.length === 0 ? (
                        <State icon={<PackageSearch size={24} />} text="Belum ada produk aktif." />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-[#e5e0d5] text-xs text-[#858a86]">
                                        <th className="py-2 pr-3 font-bold">Produk</th>
                                        <th className="py-2 pr-3 font-bold">Harga Katalog</th>
                                        <th className="py-2 pr-3 font-bold">Harga Modal</th>
                                        <th className="py-2 pr-3 font-bold">Mulai Berlaku</th>
                                        <th className="py-2 font-bold">Berakhir</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map((p) => (
                                        <tr key={p.id} className="border-b border-[#f0ede4] last:border-0">
                                            <td className="py-2 pr-3">
                                                <p className="font-bold text-[#123d2d]">{p.name}</p>
                                                <p className="text-xs text-[#a0a6a1]">{p.size || p.flavor || "-"}</p>
                                            </td>
                                            <td className="py-2 pr-3 text-[#69736d]">{rupiah(p.price)}</td>
                                            <td className="py-2 pr-3 font-bold text-[#184C3A]">{rupiah(p.costPrice)}</td>
                                            <td className="py-2 pr-3 text-[#69736d]">{dateOnly(p.effectiveFrom)}</td>
                                            <td className="py-2 text-[#69736d]">{p.hasCustomPrice ? dateOnly(p.effectiveTo) : "Katalog"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="mt-6 rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-sm">
                    <h2 className="mb-3 text-sm font-black text-[#123d2d]">Riwayat Harga</h2>
                    {loading ? (
                        <State icon={<Loader2 className="animate-spin" size={24} />} text="Memuat…" />
                    ) : history.length === 0 ? (
                        <State icon={<PackageSearch size={24} />} text="Belum ada riwayat harga khusus." />
                    ) : (
                        <ul className="grid gap-2">
                            {history.map((h) => (
                                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f0ede4] px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-[#123d2d]">{h.productName}</p>
                                        <p className="text-xs text-[#858a86]">{dateOnly(h.effectiveFrom)} → {h.effectiveTo ? dateOnly(h.effectiveTo) : "sekarang"}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-[#184C3A]">{rupiah(h.price)}</span>
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTone[h.status] || "bg-gray-100 text-gray-600"}`}>{h.status}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </main>
    );
}

function State({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#184C3A]/15 bg-white/50 px-4 py-10 text-center">
            <span className="text-[#C9A45B]">{icon}</span>
            <p className="text-sm font-semibold text-[#184D47]/60">{text}</p>
        </div>
    );
}
