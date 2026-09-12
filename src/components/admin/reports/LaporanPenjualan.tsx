"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    BarChart3,
    Loader2,
    Receipt,
} from "lucide-react";
import {
    type Period,
    type ReportTransaction,
    type SalesReport,
    type TransactionsResponse,
} from "./report-shared";
import { ReportBody } from "./ReportBody";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

type StatusFilter = "semua" | "selesai" | "diproses" | "pending" | "dibatalkan";

export default function LaporanPenjualan() {
    const [period, setPeriod] = useState<Period>("hari");
    const [report, setReport] = useState<SalesReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("semua");
    const [page, setPage] = useState(1);
    const [orders, setOrders] = useState<ReportTransaction[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [tableLoading, setTableLoading] = useState(true);

    const loadReport = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/sales/report?period=${period}`, { headers: { Accept: "application/json" } });
            const payload = (await response.json().catch(() => null)) as (SalesReport & { message?: string }) | null;
            if (!response.ok || !payload) throw new Error(payload?.message || "Laporan gagal dimuat.");
            setReport(payload);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Laporan gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [period]);

    const loadTransactions = useCallback(async () => {
        setTableLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("period", period);
            if (query.trim()) params.set("q", query.trim());
            if (statusFilter !== "semua") params.set("status", statusFilter);
            params.set("page", String(page));
            params.set("limit", "20");

            const response = await fetch(`/api/admin/sales/transactions?${params.toString()}`, { headers: { Accept: "application/json" } });
            const payload = (await response.json().catch(() => null)) as (TransactionsResponse & { message?: string }) | null;
            if (!response.ok || !payload) throw new Error(payload?.message || "Daftar transaksi gagal dimuat.");
            setOrders(payload.orders ?? []);
            setTotal(payload.total ?? 0);
            setTotalPages(payload.totalPages ?? 1);
        } catch {
            setOrders([]);
            setTotal(0);
            setTotalPages(1);
        } finally {
            setTableLoading(false);
        }
    }, [period, query, statusFilter, page]);

    useEffect(() => {
        void loadReport();
    }, [loadReport]);

    useEffect(() => {
        void loadTransactions();
    }, [loadTransactions]);

    return (
        <div className="min-h-screen text-[#184D47]">
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
                <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#184D47] text-[#D4AF37]">
                            <BarChart3 size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#C9A45B]">AFA STORE</p>
                            <h1 className="text-2xl font-black leading-tight">Laporan Penjualan</h1>
                        </div>
                    </div>
                    <Link
                        href="/admin"
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#184D47]/15 bg-white/80 px-4 font-bold text-[#184D47] transition hover:bg-white active:scale-95"
                    >
                        <ArrowLeft size={18} />
                        Dashboard
                    </Link>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center px-6 py-20 text-center">
                        <Loader2 size={28} className="animate-spin text-[#C9A45B]" />
                        <span className="ml-3 font-black">Memuat laporan...</span>
                    </div>
                ) : error ? (
                    <State icon={<Receipt size={28} />} text={error} />
                ) : report ? (
                    <ReportBody
                        report={report}
                        period={period}
                        setPeriod={setPeriod}
                        orders={orders}
                        query={query}
                        setQuery={setQuery}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        page={page}
                        setPage={setPage}
                        total={total}
                        totalPages={totalPages}
                        tableLoading={tableLoading}
                    />
                ) : null}
            </main>
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
