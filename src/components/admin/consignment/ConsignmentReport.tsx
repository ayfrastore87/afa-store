"use client";

// Admin — Laporan Titip Jual: filterable item-level report (period / sales /
// store / payment status) whose summary totals come exclusively from the
// server (/api/admin/consignment/report). No client-side recalculation.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";

import { formatDateShort, formatRupiah } from "@/components/sales/sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type ReportRow = {
    id: string;
    visitId: string;
    visitedAt: string;
    salesName: string;
    storeName: string;
    storeId: string;
    productName: string;
    supplied: number;
    sold: number;
    returned: number;
    damaged: number;
    remaining: number;
    unitPrice: number;
    salesAmount: number;
    visitPaid: number;
    visitReceivable: number;
};

type ReportSummary = {
    totalSupply: number;
    totalSold: number;
    totalReturned: number;
    totalDamaged: number;
    totalStock: number;
    totalSales: number;
    totalSettlement: number;
    totalReceivable: number;
};

type Report = { rows: ReportRow[]; summary: ReportSummary; truncated: boolean };

type Option = { id: string; name: string };

const PAYMENT_FILTERS = [
    ["", "Semua Status"],
    ["paid", "Lunas"],
    ["partial", "Sebagian"],
    ["unpaid", "Belum Bayar"],
] as const;

export function ConsignmentReport() {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [salesId, setSalesId] = useState("");
    const [storeId, setStoreId] = useState("");
    const [paymentStatus, setPaymentStatus] = useState("");
    const [salespeople, setSalespeople] = useState<Option[]>([]);
    const [stores, setStores] = useState<Option[]>([]);
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("/api/admin/consignment/salespeople", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (response.ok) setSalespeople((payload as { salespeople: Option[] }).salespeople);
            })
            .catch(() => undefined);
        fetch("/api/admin/consignment/stores", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (response.ok) setStores((payload as { stores: Option[] }).stores);
            })
            .catch(() => undefined);
    }, []);

    const loadReport = useCallback(() => {
        setLoading(true);
        setError("");
        const params = new URLSearchParams();
        if (from) params.set("from", new Date(`${from}T00:00:00+07:00`).toISOString());
        if (to) params.set("to", new Date(`${to}T23:59:59.999+07:00`).toISOString());
        if (salesId) params.set("salesId", salesId);
        if (storeId) params.set("storeId", storeId);
        if (paymentStatus) params.set("paymentStatus", paymentStatus);
        fetch(`/api/admin/consignment/report?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Laporan gagal dimuat.");
                setReport(payload as Report);
            })
            .catch((err) => setError(getUserFacingMessage(err, "Laporan gagal dimuat.")))
            .finally(() => setLoading(false));
    }, [from, to, salesId, storeId, paymentStatus]);

    useEffect(() => { loadReport(); }, [loadReport]);

    const summaryCards = report
        ? [
            ["Total Supply", `${report.summary.totalSupply} pcs`],
            ["Total Terjual", `${report.summary.totalSold} pcs`],
            ["Total Retur", `${report.summary.totalReturned} pcs`],
            ["Total Rusak", `${report.summary.totalDamaged} pcs`],
            ["Stok di Toko", `${report.summary.totalStock} pcs`],
            ["Total Penjualan", formatRupiah(report.summary.totalSales)],
            ["Total Setoran", formatRupiah(report.summary.totalSettlement)],
            ["Total Piutang", formatRupiah(report.summary.totalReceivable)],
        ]
        : [];

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-6xl">
                <Link href="/admin/titip-jual" className="text-sm font-bold text-[#184C3A]">← Kembali ke Titip Jual</Link>

                <header className="mt-4">
                    <h1 className="flex items-center gap-2 text-2xl font-black text-[#123d2d]"><BarChart3 size={22} className="text-[#D4AF37]" /> Laporan Titip Jual</h1>
                    <p className="text-sm text-[#17241d]/60">Rekap penjualan titipan per produk, toko, dan sales. Semua total dihitung server.</p>
                </header>

                <section className="mt-5 grid gap-3 rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm md:grid-cols-5" aria-label="Filter laporan">
                    <label className="text-sm font-bold">Dari tanggal
                        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                    </label>
                    <label className="text-sm font-bold">Sampai tanggal
                        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                    </label>
                    <label className="text-sm font-bold">Sales
                        <select value={salesId} onChange={(e) => setSalesId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] bg-white px-3 font-semibold">
                            <option value="">Semua Sales</option>
                            {salespeople.map((sales) => <option key={sales.id} value={sales.id}>{sales.name}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-bold">Toko
                        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] bg-white px-3 font-semibold">
                            <option value="">Semua Toko</option>
                            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-bold">Status pembayaran
                        <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] bg-white px-3 font-semibold">
                            {PAYMENT_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </label>
                </section>

                {error && <p className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700">{error}</p>}

                {loading ? (
                    <div className="mt-6 grid min-h-28 place-items-center"><Loader2 className="animate-spin text-[#184C3A]" /></div>
                ) : report ? (
                    <>
                        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Ringkasan laporan">
                            {summaryCards.map(([label, value]) => (
                                <div key={label} className="admin-card rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#17241d]/55">{label}</p>
                                    <p className="mt-1 text-lg font-black text-[#123d2d]">{value}</p>
                                </div>
                            ))}
                        </section>

                        {report.truncated && (
                            <p className="mt-3 text-xs font-semibold text-[#8B6B3F]">Menampilkan 500 baris pertama — persempit filter untuk hasil lengkap.</p>
                        )}

                        {report.rows.length === 0 ? (
                            <p className="mt-5 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 p-8 text-center text-sm font-semibold text-[#17241d]/55">Tidak ada data pada filter ini.</p>
                        ) : (
                            <div className="mt-5 overflow-x-auto rounded-2xl border border-[#ded9cc] bg-white shadow-sm">
                                <table className="w-full min-w-[960px] text-sm">
                                    <thead>
                                        <tr className="bg-[#f2eee2] text-left text-xs font-black uppercase tracking-wide text-[#17241d]/60">
                                            <th className="px-4 py-3">Tanggal</th>
                                            <th className="px-4 py-3">Toko</th>
                                            <th className="px-4 py-3">Sales</th>
                                            <th className="px-4 py-3">Produk</th>
                                            <th className="px-4 py-3 text-right">Supply</th>
                                            <th className="px-4 py-3 text-right">Terjual</th>
                                            <th className="px-4 py-3 text-right">Retur</th>
                                            <th className="px-4 py-3 text-right">Rusak</th>
                                            <th className="px-4 py-3 text-right">Sisa</th>
                                            <th className="px-4 py-3 text-right">Penjualan</th>
                                            <th className="px-4 py-3 text-right">Piutang Kunjungan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.rows.map((row) => (
                                            <tr key={row.id} className="border-t border-[#f0ece0]">
                                                <td className="px-4 py-2.5">{formatDateShort(row.visitedAt)}</td>
                                                <td className="px-4 py-2.5">
                                                    <Link href={`/admin/titip-jual/toko/${row.storeId}`} className="font-bold text-[#184C3A] hover:underline">{row.storeName}</Link>
                                                </td>
                                                <td className="px-4 py-2.5">{row.salesName}</td>
                                                <td className="px-4 py-2.5 font-bold">{row.productName}</td>
                                                <td className="px-4 py-2.5 text-right">{row.supplied}</td>
                                                <td className="px-4 py-2.5 text-right font-bold">{row.sold}</td>
                                                <td className="px-4 py-2.5 text-right">{row.returned}</td>
                                                <td className="px-4 py-2.5 text-right">{row.damaged}</td>
                                                <td className="px-4 py-2.5 text-right">{row.remaining}</td>
                                                <td className="px-4 py-2.5 text-right font-bold">{formatRupiah(row.salesAmount)}</td>
                                                <td className="px-4 py-2.5 text-right font-black text-[#8B6B3F]">{formatRupiah(row.visitReceivable)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                ) : null}
            </div>
        </main>
    );
}