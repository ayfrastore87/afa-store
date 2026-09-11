"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, Printer, Receipt, TrendingUp, Wallet } from "lucide-react";

import { formatDate, formatRupiah, type SaleRow } from "@/components/partner/partner-shared";

type Period = "hari" | "minggu" | "bulan" | "tahun" | "semua";

type TopProduct = { name: string; quantity: number; revenue: number; profit: number };

type Report = {
    period: Period;
    summary: { revenue: number; count: number; grossProfit: number; totalItems: number };
    sales: SaleRow[];
    topProducts: TopProduct[];
};

const PERIODS: { id: Period; label: string }[] = [
    { id: "hari", label: "Hari Ini" },
    { id: "minggu", label: "7 Hari" },
    { id: "bulan", label: "Bulan Ini" },
    { id: "tahun", label: "Tahun Ini" },
    { id: "semua", label: "Semua" },
];

function exportCsv(filename: string, rows: Record<string, string | number>[]) {
    if (!rows.length) return;
    const header = Object.keys(rows[0]);
    const body = rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

async function exportPdf(title: string, rows: Record<string, string | number>[]) {
    if (!rows.length) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.text(title, 14, 16);
    rows.slice(0, 40).forEach((row, index) => doc.text(Object.values(row).join(" | ").slice(0, 105), 14, 28 + index * 7));
    doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

async function exportXlsx(filename: string, rows: Record<string, string | number>[]) {
    if (!rows.length) return;
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Laporan");
    XLSX.writeFile(workbook, filename);
}

export function PartnerReportsTab({ refreshSignal }: { refreshSignal: number }) {
    const [report, setReport] = useState<Report | null>(null);
    const [period, setPeriod] = useState<Period>("bulan");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        fetch(`/api/partner/sales/report?period=${period}`, { headers: { Accept: "application/json" } })
            .then(async (response) => {
                const data = await response.json().catch(() => null);
                if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Laporan gagal dimuat.");
                if (!cancelled) setReport(data as Report);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Laporan gagal dimuat.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [period, refreshSignal]);

    const rows = useMemo(() => {
        if (!report) return [];
        return report.sales.map((sale) => ({
            Invoice: sale.saleNumber,
            Tanggal: formatDate(sale.soldAt),
            Item: sale.itemCount,
            Total: formatRupiah(sale.total),
            Laba: formatRupiah(sale.grossProfit),
        }));
    }, [report]);

    if (loading) {
        return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat laporan..." />;
    }
    if (error) {
        return <State icon={<FileText size={28} />} text={error} />;
    }
    if (!report) {
        return <State icon={<FileText size={28} />} text="Belum ada data." />;
    }

    const cards = [
        { label: "Pendapatan", value: formatRupiah(report.summary.revenue), sub: `${report.summary.count} transaksi`, icon: Wallet },
        { label: "Laba Kotor", value: formatRupiah(report.summary.grossProfit), sub: "Estimasi laba", icon: TrendingUp },
        { label: "Item Terjual", value: `${report.summary.totalItems} unit`, sub: "Semua produk", icon: Receipt },
    ];
    // __REPORTS_RENDER__
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-[#C9A45B]">Laporan Mitra</p>
                    <h2 className="text-2xl font-black text-[#184D47]">Laporan Penjualan</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="rounded-xl bg-white/80 px-3 py-2 text-sm font-bold text-[#184D47] ring-1 ring-[#184D47]/15">
                        {PERIODS.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                    <button type="button" onClick={() => void exportPdf("Laporan Penjualan Mitra", rows)} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-2 text-sm font-bold text-[#184D47] transition hover:brightness-105 active:scale-95">
                        <FileText size={15} /> PDF
                    </button>
                    <button type="button" onClick={() => void exportXlsx("laporan-mitra.xlsx", rows)} className="inline-flex items-center gap-2 rounded-xl bg-[#184D47] px-3 py-2 text-sm font-bold text-white transition hover:brightness-110 active:scale-95">
                        <Download size={15} /> Excel
                    </button>
                    <button type="button" onClick={() => exportCsv("laporan-mitra.csv", rows)} className="inline-flex items-center gap-2 rounded-xl border border-[#184D47]/20 px-3 py-2 text-sm font-bold text-[#184D47] transition hover:bg-white/70 active:scale-95">
                        <Download size={15} /> CSV
                    </button>
                    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-[#184D47]/20 px-3 py-2 text-sm font-bold text-[#184D47] transition hover:bg-white/70 active:scale-95">
                        <Printer size={15} /> Print
                    </button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                {cards.map(({ label, value, sub, icon: Icon }) => (
                    <div key={label} className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                        <div className="flex items-center gap-2 text-[#184D47]/50">
                            <Icon size={16} />
                            <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
                        </div>
                        <p className="mt-2 text-xl font-black text-[#184D47]">{value}</p>
                        <p className="mt-1 text-xs text-[#184D47]/50">{sub}</p>
                    </div>
                ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                    <h3 className="mb-3 text-lg font-black text-[#184D47]">Produk Terlaris</h3>
                    {report.topProducts.length === 0 ? (
                        <p className="py-6 text-center text-sm text-[#184D47]/50">Belum ada produk terjual.</p>
                    ) : (
                        <ul className="space-y-2">
                            {report.topProducts.map((p, index) => (
                                <li key={p.name} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 p-2.5">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#184D47] text-xs font-black text-[#D4AF37]">{index + 1}</span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-[#184D47]">{p.name}</p>
                                            <p className="text-xs text-[#184D47]/50">{p.quantity} unit terjual</p>
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-black text-[#184D47]">{formatRupiah(p.revenue)}</p>
                                        <p className="text-xs text-[#1f7a4d]">Laba {formatRupiah(p.profit)}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                    <h3 className="mb-3 text-lg font-black text-[#184D47]">Transaksi Terakhir</h3>
                    {report.sales.length === 0 ? (
                        <p className="py-6 text-center text-sm text-[#184D47]/50">Belum ada transaksi pada periode ini.</p>
                    ) : (
                        <ul className="space-y-2">
                            {report.sales.slice(0, 10).map((sale) => (
                                <li key={sale.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 p-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-[#184D47]">{sale.saleNumber}</p>
                                        <p className="text-xs text-[#184D47]/50">{formatDate(sale.soldAt)} · {sale.itemCount} item</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-black text-[#184D47]">{formatRupiah(sale.total)}</p>
                                        <p className="text-xs text-[#1f7a4d]">Laba {formatRupiah(sale.grossProfit)}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
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
