"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Truck, Search, CheckCircle, AlertTriangle, Package } from "lucide-react";
import { formatRupiah } from "./kasir-shared";

type Summary = { totalActive: number; perluDiproses: number; dalamPengiriman: number; perluPerhatian: number };
type Order = {
    id: string; invoice: string; customer: string; phone: string; trackingNumber: string | null;
    courier: string | null; service: string | null; biteshipStatus: string | null; shipping: number; total: number; status: string;
    createdAt: Date; updatedAt: Date; normalizedKey: string; normalizedLabel: string;
};
type ResponseData = { summary: Summary; orders: Order[]; page: number; limit: number; total: number; totalPages: number };

const STATUS_COLORS: Record<string, string> = {
    MENUNGGU_PENGIRIMAN: "bg-gray-100 text-gray-800", KURIR_DICARI: "bg-blue-100 text-blue-800",
    DALAM_PENGIRIMAN: "bg-green-100 text-green-800", TERKIRIM: "bg-emerald-100 text-emerald-800",
    GAGAL: "bg-red-100 text-red-800", DIKEMBALIKAN: "bg-orange-100 text-orange-800",
    DITAHAN: "bg-yellow-100 text-yellow-800", TIDAK_DIKENAL: "bg-purple-100 text-purple-800", DEFAULT: "bg-gray-100 text-gray-800",
};

export default function KasirDeliveryMonitoring({ detailBasePath = "/admin/kasir/orders" }: { detailBasePath?: string }) {
    const [summary, setSummary] = useState<Summary>({ totalActive: 0, perluDiproses: 0, dalamPengiriman: 0, perluPerhatian: 0 });
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1); const [total, setTotal] = useState(0);
    const [filter, setFilter] = useState("ALL"); const [search, setSearch] = useState(""); const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 500); return () => clearTimeout(t); }, [search]);

    const fetchData = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams({ filter, page: page.toString(), limit: "20" });
            if (debouncedSearch) params.set("q", debouncedSearch);
            const res = await fetch(`/api/admin/kasir/monitoring/delivery?${params}`, { headers: { "Content-Type": "application/json" } });
            if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
            const data: ResponseData = await res.json();
            setSummary(data.summary); setOrders(data.orders); setPage(data.page); setTotalPages(data.totalPages); setTotal(data.total);
        } catch (err) { setError(err instanceof Error ? err.message : "An error occurred"); } finally { setLoading(false); }
    }, [filter, page, debouncedSearch]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const formatDate = (d: Date) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
    const getStatusColor = (k: string) => STATUS_COLORS[k] || STATUS_COLORS.DEFAULT;
    const getStatusIcon = (key: string) => {
        if (key === "TERKIRIM") return <CheckCircle className="w-4 h-4" />;
        if (key === "DALAM_PENGIRIMAN") return <Truck className="w-4 h-4" />;
        if (key === "GAGAL" || key === "DIKEMBALIKAN") return <AlertTriangle className="w-4 h-4" />;
        if (key === "MENUNGGU_PENGIRIMAN") return <Package className="w-4 h-4" />;
        return <div className="w-4 h-4"></div>;
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
    if (error) return <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded" role="alert"><strong>Error:</strong> <span>{error}</span></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Truck className="w-6 h-6" />Monitoring Pengiriman</h2><p className="mt-1 text-sm text-gray-600">Pantau status pesanan yang dikirim ke pelanggan.</p></div>
                <div className="text-sm text-gray-600">Total Pesanan Kirim Aktif: <span className="font-semibold">{summary.totalActive}</span></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200"><div className="text-sm text-gray-600 mb-1">Perlu Diproses</div><div className="text-2xl font-bold text-blue-600">{summary.perluDiproses}</div><div className="text-xs text-gray-500">Belum dibuat pengiriman</div></div>
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200"><div className="text-sm text-gray-600 mb-1">Dalam Pengiriman</div><div className="text-2xl font-bold text-green-600">{summary.dalamPengiriman}</div><div className="text-xs text-gray-500">Sedang dikirim</div></div>
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200"><div className="text-sm text-gray-600 mb-1">Perlu Perhatian</div><div className="text-2xl font-bold text-red-600">{summary.perluPerhatian}</div><div className="text-xs text-gray-500">Gagal/dikembalikan</div></div>
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200"><div className="text-sm text-gray-600 mb-1">Terselesaikan</div><div className="text-2xl font-bold text-emerald-600">{summary.totalActive - summary.perluDiproses - summary.dalamPengiriman - summary.perluPerhatian}</div><div className="text-xs text-gray-500">Terkirim</div></div>
            </div>
            <div className="bg-white rounded-lg shadow border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input type="text" placeholder="Cari invoice, nama, no. WhatsApp, resi..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div className="flex gap-2">
                            {["ALL", "PERLU_DIPROSES", "DALAM_PENGIRIMAN", "SELESAI", "PERLU_PERHATIAN"].map((f) => (
                                <button key={f} onClick={() => { setFilter(f); setPage(1); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                                    {f === "ALL" ? "Semua" : f === "PERLU_DIPROSES" ? "Perlu Diproses" : f === "DALAM_PENGIRIMAN" ? "Dalam Pengiriman" : f === "SELESAI" ? "Selesai" : "Perlu Perhatian"}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                {orders.length === 0 ? (<div className="p-12 text-center text-gray-500"><Package className="w-12 h-12 mx-auto mb-3 text-gray-400" /><p>Tidak ada pesanan yang ditemukan</p></div>) : (
                    <>
                        <div className="space-y-3 md:hidden">
                            {orders.map((order) => <Link key={order.id} href={`${detailBasePath}/${order.id}`} className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm active:scale-[.99]"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-gray-900">{order.invoice}</p><p className="text-sm text-gray-700">{order.customer}</p></div><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(order.normalizedKey)}`}>{getStatusIcon(order.normalizedKey)}{order.normalizedLabel}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600"><span>{order.courier || "Kurir belum dipilih"}{order.service ? ` • ${order.service}` : ""}</span><span className="text-right">{order.trackingNumber || "Tanpa resi"}</span><span>{order.phone}</span><span className="text-right">{formatDate(order.updatedAt)}</span></div></Link>)}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full"><thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Pelanggan</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">No. HP / WA</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Resi</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Ongkir</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Diupdate</th></tr></thead>
                            <tbody className="divide-y divide-gray-200">
                                {orders.map((order) => (
                                    <tr key={order.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-900"><Link className="font-semibold hover:underline" href={`${detailBasePath}/${order.id}`}>{order.customer}</Link><div className="text-xs text-gray-500">{order.invoice}</div></td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{order.phone}</td>
                                        <td className="px-4 py-3"><div className="max-w-xs truncate text-gray-700" title={order.trackingNumber || ""}>{order.trackingNumber || "-"}</div></td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{formatRupiah(order.shipping)}</td>
                                        <td className="px-4 py-3 whitespace-nowrap"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(order.normalizedKey)}`} title={order.biteshipStatus || undefined}>{getStatusIcon(order.normalizedKey)}{order.normalizedLabel}</span></td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDate(order.updatedAt)}</td>
                                    </tr>
                                ))}
                            </tbody></table>
                        </div>
                        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                            <div className="text-sm text-gray-600">Menampilkan<span className="font-medium">{total === 0 ? 0 : (page - 1) * 20 + 1}</span> - <span className="font-medium">{Math.min(page * 20, total)}</span> dari <span className="font-medium">{total}</span> pesanan</div>
                            <div className="flex gap-2">
                                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">Sebelumnya</button>
                                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">Selanjutnya</button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
