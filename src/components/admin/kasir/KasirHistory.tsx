"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertCircle,
    ArrowLeft,
    Filter,
    Loader2,
    Receipt,
    Search,
    ShoppingCart,
} from "lucide-react";
import {
    formatDate,
    formatRupiah,
    paymentMethodLabel,
    sourceLabel,
    statusLabel,
} from "./kasir-shared";

// TAHAP D: halaman riwayat terhubung ke GET /api/admin/kasir/orders.

type SourceFilter = "SEMUA" | "TATAP_MUKA" | "WHATSAPP";

type KasirOrder = {
    id: string;
    invoice: string;
    customer: string;
    phone: string;
    source: string;
    paymentMethod: string;
    paymentStatus: string;
    status: string;
    subtotal: number;
    total: number;
    cashReceived: number | null;
    change: number | null;
    createdAt: string;
};

type KasirOrdersResponse = {
    orders: KasirOrder[];
    page: number;
    total: number;
    totalPages: number;
};

const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
    { id: "SEMUA", label: "Semua" },
    { id: "TATAP_MUKA", label: "Tatap Muka" },
    { id: "WHATSAPP", label: "WhatsApp" },
];

export default function KasirHistory() {
    const [query, setQuery] = useState("");
    const [source, setSource] = useState<SourceFilter>("SEMUA");
    const [page, setPage] = useState(1);
    const [orders, setOrders] = useState<KasirOrder[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadOrders = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (query.trim()) params.set("q", query.trim());
            if (source !== "SEMUA") params.set("source", source);
            params.set("page", String(page));
            params.set("limit", "20");

            const response = await fetch(`/api/admin/kasir/orders?${params.toString()}`, {
                headers: { Accept: "application/json" },
            });
            const payload = (await response.json().catch(() => null)) as (KasirOrdersResponse & { message?: string }) | null;
            if (!response.ok || !payload) {
                throw new Error(payload?.message || "Riwayat gagal dimuat.");
            }
            setOrders(payload.orders ?? []);
            setTotal(payload.total ?? 0);
            setTotalPages(payload.totalPages ?? 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Riwayat gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [query, source, page]);

    useEffect(() => {
        void loadOrders();
    }, [loadOrders]);

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff8df_0,#f7efd9_34%,#edf4ef_68%,#e4dcc7_100%)] pb-24 text-[#184D47]">
            <header className="sticky top-0 z-30 border-b border-[#C9A45B]/20 bg-[#F8F5EE]/90 shadow-[0_8px_28px_rgba(18,53,36,0.06)] backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#184D47] text-[#D4AF37]">
                            <Receipt size={22} />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-black uppercase tracking-[0.28em] text-[#C9A45B]">AFA STORE</p>
                            <h1 className="truncate text-xl font-black leading-tight sm:text-2xl">Riwayat Transaksi</h1>
                            <p className="truncate text-xs text-[#184D47]/60">Transaksi penjualan kasir</p>
                        </div>
                    </div>

                    <Link
                        href="/admin/kasir"
                        className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#D4AF37] px-4 font-black text-[#184D47] transition hover:brightness-105 active:scale-95"
                    >
                        <ShoppingCart size={18} />
                        <span className="hidden sm:inline">Kembali ke Kasir</span>
                        <span className="sm:hidden">Kasir</span>
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
                    <label className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-[#C9A45B]/20 bg-white/90 px-4 shadow-sm focus-within:border-[#C9A45B]">
                        <Search size={18} className="shrink-0 text-[#C9A45B]" />
                        <input
                            value={query}
                            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                            placeholder="Cari invoice atau nama pelanggan..."
                            className="h-full w-full bg-transparent text-sm font-medium outline-none placeholder:text-[#184D47]/40"
                        />
                    </label>

                    <div className="flex items-center gap-2 overflow-x-auto">
                        <Filter size={16} className="shrink-0 text-[#C9A45B]" />
                        {SOURCE_FILTERS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => { setSource(item.id); setPage(1); }}
                                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${source === item.id ? "bg-[#184D47] text-white" : "bg-white/80 text-[#184D47]/70 hover:bg-white"}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center rounded-[1.75rem] border border-white/70 bg-white/90 py-20 shadow-xl">
                        <Loader2 size={28} className="animate-spin text-[#C9A45B]" />
                        <span className="ml-3 font-black">Memuat riwayat...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-red-200 bg-red-50/70 py-16 text-center">
                        <AlertCircle size={30} className="text-red-600" />
                        <p className="mt-3 font-black text-red-700">{error}</p>
                        <button onClick={() => void loadOrders()} className="mt-4 min-h-12 rounded-2xl bg-[#184D47] px-5 font-black text-white">Coba Lagi</button>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="rounded-[1.75rem] border border-white/70 bg-white/90 shadow-xl shadow-[#184D47]/10">
                        <EmptyState />
                    </div>
                ) : (
                    <OrderTable orders={orders} total={total} page={page} totalPages={totalPages} onPrev={() => setPage((v) => Math.max(1, v - 1))} onNext={() => setPage((v) => v + 1)} />
                )}
            </main>
        </div>
    );
}

function OrderTable({ orders, total, page, totalPages, onPrev, onNext }: { orders: KasirOrder[]; total: number; page: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
    return (
        <>
            <div className="hidden overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/90 shadow-xl shadow-[#184D47]/10 lg:block">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[#184D47] text-white">
                        <tr>
                            {["Invoice", "Tanggal", "Pelanggan", "Sumber", "Metode Pembayaran", "Total", "Status", "Aksi"].map((head) => (
                                <th key={head} className="p-4 font-black">{head}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order) => (
                            <tr key={order.id} className="border-t border-[#184D47]/10 transition hover:bg-[#184D47]/5">
                                <td className="p-4 font-black text-[#0F4C45]">{order.invoice}</td>
                                <td className="p-4 font-semibold text-[#184D47]/70">{formatDate(order.createdAt)}</td>
                                <td className="p-4 font-semibold">{order.customer || "-"}</td>
                                <td className="p-4"><span className="rounded-full bg-[#f8f0dd] px-3 py-1 text-xs font-black text-[#184D47]">{sourceLabel(order.source)}</span></td>
                                <td className="p-4 font-semibold">{paymentMethodLabel(order.paymentMethod)}</td>
                                <td className="p-4 font-black">{formatRupiah(order.total)}</td>
                                <td className="p-4"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{statusLabel(order.status)}</span></td>
                                <td className="p-4"><Link href={`/admin/kasir/${order.id}`} className="font-black text-[#184D47] underline hover:text-[#C9A45B]">Detail</Link></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid gap-3 lg:hidden">
                {orders.map((order) => (
                    <Link key={order.id} href={`/admin/kasir/${order.id}`} className="rounded-[1.5rem] border border-white/70 bg-white/90 p-4 shadow-md transition hover:shadow-lg">
                        <div className="flex items-center justify-between gap-3">
                            <span className="font-black text-[#0F4C45]">{order.invoice}</span>
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{statusLabel(order.status)}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold">{order.customer || "-"}</p>
                        <p className="text-xs text-[#184D47]/60">{formatDate(order.createdAt)}</p>
                        <div className="mt-3 flex items-center justify-between">
                            <span className="rounded-full bg-[#f8f0dd] px-3 py-1 text-xs font-black text-[#184D47]">{sourceLabel(order.source)}</span>
                            <span className="text-sm font-black">{formatRupiah(order.total)}</span>
                        </div>
                    </Link>
                ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
                <p className="text-sm font-bold text-[#184D47]/60">{total} transaksi · Halaman {page} dari {Math.max(1, totalPages)}</p>
                <div className="flex gap-2">
                    <button disabled={page <= 1} onClick={onPrev} className="rounded-xl border border-[#184D47]/15 bg-white px-4 py-2 font-bold disabled:opacity-40">Prev</button>
                    <button disabled={page >= totalPages} onClick={onNext} className="rounded-xl border border-[#184D47]/15 bg-white px-4 py-2 font-bold disabled:opacity-40">Next</button>
                </div>
            </div>
        </>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#f8f0dd] text-[#C9A45B]">
                <Receipt size={30} />
            </div>
            <h2 className="mt-5 text-xl font-black">Belum ada riwayat transaksi</h2>
            <p className="mt-2 max-w-sm text-sm text-[#184D47]/60">Transaksi tatap muka dan WhatsApp akan muncul di sini setelah transaksi kasir dibuat.</p>
            <Link href="/admin/kasir" className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-[#184D47] px-5 font-black text-white transition hover:brightness-110 active:scale-95">
                <ArrowLeft size={18} />
                Mulai Transaksi
            </Link>
        </div>
    );
}
