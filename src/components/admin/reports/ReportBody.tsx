"use client";

import { useMemo, useState } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleDollarSign,
    CreditCard,
    Crown,
    Download,
    FileSpreadsheet,
    FileText,
    Loader2,
    Package,
    Repeat,
    Search,
    ShoppingBag,
    Star,
    TrendingUp,
    UserPlus,
    Users,
} from "lucide-react";

import {
    CHART_GRANULARITIES,
    PERIODS,
    STATUS_FILTERS,
    exportCsv,
    exportPdf,
    exportXlsx,
    paymentMethodLabel,
    statusLabel,
    type ChartGranularity,
    type Period,
    type ReportTransaction,
    type SalesReport,
} from "./report-shared";

const formatRupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};

type StatusFilter = "semua" | "selesai" | "diproses" | "pending" | "dibatalkan";

type ReportBodyProps = {
    report: SalesReport;
    period: Period;
    setPeriod: (period: Period) => void;
    orders: ReportTransaction[];
    query: string;
    setQuery: (query: string) => void;
    statusFilter: StatusFilter;
    setStatusFilter: (status: StatusFilter) => void;
    page: number;
    setPage: (page: number) => void;
    total: number;
    totalPages: number;
    tableLoading: boolean;
};
export function ReportBody({
    report,
    period,
    setPeriod,
    orders,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    total,
    totalPages,
    tableLoading,
}: ReportBodyProps) {
    const [granularity, setGranularity] = useState<ChartGranularity>("harian");

    const chartData = useMemo(() => report.chart[granularity] ?? [], [report, granularity]);

    const exportRows = useMemo<Record<string, string | number>[]>(
        () =>
            orders.map((order) => ({
                Invoice: order.invoice,
                Pelanggan: order.customer,
                Telepon: order.phone,
                Sumber: order.source,
                Pembayaran: paymentMethodLabel(order.paymentMethod),
                Status: statusLabel(order.status),
                Total: order.total,
                Tanggal: formatDate(order.createdAt),
            })),
        [orders]
    );

    const onExportPdf = () => void exportPdf("Laporan Penjualan", exportRows);
    const onExportXlsx = () => void exportXlsx("laporan-penjualan.xlsx", exportRows);
    const onExportCsv = () => exportCsv("laporan-penjualan.csv", exportRows);

    const summaryCards = [
        { label: "Omzet", value: formatRupiah(report.summary.revenue), icon: CircleDollarSign },
        { label: "Transaksi", value: String(report.summary.transactionCount), icon: ShoppingBag },
        { label: "Produk Terjual", value: `${report.summary.itemsSold} pcs`, icon: Package },
        { label: "Rata-rata Transaksi", value: formatRupiah(report.summary.averageTransaction), icon: TrendingUp },
    ];

    const penjualan = [
        { label: "Total Omzet", value: formatRupiah(report.summary.subtotal) },
        { label: "Diskon", value: `- ${formatRupiah(report.summary.discount)}` },
        { label: "Ongkir", value: formatRupiah(report.summary.shipping) },
        { label: "Grand Total", value: formatRupiah(report.summary.grandTotal), strong: true },
        { label: "Transaksi Selesai", value: String(report.summary.completed) },
        { label: "Transaksi Pending", value: String(report.summary.pending) },
        { label: "Transaksi Batal", value: String(report.summary.cancelled) },
    ];

    return (
        <div className="space-y-6">
            <Toolbar
                period={period}
                setPeriod={setPeriod}
                onExportPdf={onExportPdf}
                onExportXlsx={onExportXlsx}
                onExportCsv={onExportCsv}
            />

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-[#184D47]/50">
                            <item.icon size={16} />
                            <p className="text-sm font-bold">{item.label}</p>
                        </div>
                        <p className="mt-2 text-2xl font-black text-[#184D47]">{item.value}</p>
                    </div>
                ))}
            </section>

            <ChartCard granularity={granularity} setGranularity={setGranularity} data={chartData} />

            <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
                    <h3 className="mb-4 text-lg font-black text-[#184D47]">Penjualan</h3>
                    <dl className="space-y-2">
                        {penjualan.map((item) => (
                            <div
                                key={item.label}
                                className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                                    "strong" in item && item.strong
                                        ? "bg-[#184D47] text-white"
                                        : "bg-[#f8f6f0] text-[#184D47]"
                                }`}
                            >
                                <dt className="text-sm font-bold">{item.label}</dt>
                                <dd className="font-black">{item.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <TopProducts products={report.topProducts} />
            </section>
            <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#184D47]">
                        <Users size={18} />
                        Pelanggan
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {[
                            { label: "Jumlah Pelanggan", value: report.customers.total, icon: Users },
                            { label: "Pelanggan Baru", value: report.customers.newCount, icon: UserPlus },
                            { label: "Pelanggan Berulang", value: report.customers.returningCount, icon: Repeat },
                        ].map((item) => (
                            <div key={item.label} className="rounded-xl bg-[#f8f6f0] p-3 text-center">
                                <item.icon size={18} className="mx-auto mb-1 text-[#D4AF37]" />
                                <p className="text-xs font-bold text-[#184D47]/60">{item.label}</p>
                                <p className="text-xl font-black text-[#184D47]">{item.value}</p>
                            </div>
                        ))}
                    </div>

                    <h3 className="mb-3 mt-5 flex items-center gap-2 text-lg font-black text-[#184D47]">
                        <CreditCard size={18} />
                        Metode Pembayaran
                    </h3>
                    <PaymentMethods methods={report.paymentMethods} />
                </div>

                <StatusOrders
                    orderStatuses={report.orderStatuses}
                    transactionCount={report.summary.transactionCount}
                />
            </section>

            <TransactionTable
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
        </div>
    );
}

function Toolbar({
    period,
    setPeriod,
    onExportPdf,
    onExportXlsx,
    onExportCsv,
}: {
    period: Period;
    setPeriod: (period: Period) => void;
    onExportPdf: () => void;
    onExportXlsx: () => void;
    onExportCsv: () => void;
}) {
    return (
        <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
                {PERIODS.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setPeriod(item.id)}
                        className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                            period === item.id
                                ? "bg-[#184D47] text-[#D4AF37]"
                                : "bg-white/80 text-[#184D47]/70 hover:bg-white"
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    onClick={onExportPdf}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#0F4C45]"
                >
                    <FileText size={16} />
                    PDF
                </button>
                <button
                    onClick={onExportXlsx}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#184D47] px-4 py-2 text-sm font-bold text-white"
                >
                    <FileSpreadsheet size={16} />
                    Excel
                </button>
                <button
                    onClick={onExportCsv}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#184D47]/15 bg-white/80 px-4 py-2 text-sm font-bold text-[#184D47]"
                >
                    <Download size={16} />
                    CSV
                </button>
            </div>
        </section>
    );
}

function ChartCard({
    granularity,
    setGranularity,
    data,
}: {
    granularity: ChartGranularity;
    setGranularity: (g: ChartGranularity) => void;
    data: { label: string; revenue: number; count: number }[];
}) {
    return (
        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-black text-[#184D47]">Grafik Penjualan</h3>
                <div className="flex flex-wrap gap-2">
                    {CHART_GRANULARITIES.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setGranularity(item.id)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                granularity === item.id
                                    ? "bg-[#184D47] text-[#D4AF37]"
                                    : "bg-[#f8f0dd] text-[#184D47]/70"
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0F766E" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#0F766E" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#184D47" strokeOpacity={0.08} />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#184D47" }} />
                        <YAxis
                            tick={{ fontSize: 12, fill: "#184D47" }}
                            tickFormatter={(value: number) => formatRupiah(value)}
                        />
                        <Tooltip formatter={(value) => formatRupiah(Number(value))} />
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            name="Omzet"
                            stroke="#0F4C45"
                            strokeWidth={2}
                            fill="url(#revenueFill)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </section>
    );
}

function TopProducts({ products }: { products: { name: string; quantity: number; revenue: number }[] }) {
    return (
        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#184D47]">
                <Crown size={18} className="text-[#D4AF37]" />
                Produk Terlaris
            </h3>
            {products.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#184D47]/50">Belum ada produk terjual.</p>
            ) : (
                <ul className="space-y-2">
                    {products.map((product, index) => (
                        <li
                            key={`${product.name}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-xl bg-[#f8f6f0] p-2.5"
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#184D47] text-xs font-black text-[#D4AF37]">
                                    {index + 1}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-[#184D47]">{product.name}</p>
                                    <p className="text-xs text-[#184D47]/50">{product.quantity} unit</p>
                                </div>
                            </div>
                            <span className="shrink-0 text-sm font-black text-[#184D47]">
                                {formatRupiah(product.revenue)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function PaymentMethods({ methods }: { methods: { method: string; count: number; total: number }[] }) {
    return (
        <ul className="space-y-2">
            {methods.length === 0 ? (
                <p className="py-4 text-center text-sm text-[#184D47]/50">Belum ada pembayaran.</p>
            ) : (
                methods.map((method) => (
                    <li
                        key={method.method}
                        className="flex items-center justify-between rounded-xl bg-[#f8f6f0] px-3 py-2"
                    >
                        <span className="text-sm font-bold text-[#184D47]">
                            {paymentMethodLabel(method.method)}
                        </span>
                        <span className="text-sm font-black text-[#184D47]">
                            {method.count} · {formatRupiah(method.total)}
                        </span>
                    </li>
                ))
            )}
        </ul>
    );
}

function StatusOrders({
    orderStatuses,
    transactionCount,
}: {
    orderStatuses: { status: string; count: number }[];
    transactionCount: number;
}) {
    return (
        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#184D47]">
                <CircleCheck size={18} />
                Status Pesanan
            </h3>
            <ul className="space-y-2">
                {orderStatuses.length === 0 ? (
                    <p className="py-4 text-center text-sm text-[#184D47]/50">Belum ada pesanan.</p>
                ) : (
                    orderStatuses.map((status) => (
                        <li key={status.status} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-bold text-[#184D47]">{status.status}</span>
                                <span className="font-black text-[#184D47]">{status.count}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[#f8f6f0]">
                                <div
                                    className="h-full rounded-full bg-[#184D47]"
                                    style={{
                                        width: `${transactionCount ? Math.round((status.count / transactionCount) * 100) : 0}%`,
                                    }}
                                />
                            </div>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}

function TransactionTable({
    orders,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    total,
    totalPages,
    tableLoading,
}: {
    orders: ReportTransaction[];
    query: string;
    setQuery: (query: string) => void;
    statusFilter: StatusFilter;
    setStatusFilter: (status: StatusFilter) => void;
    page: number;
    setPage: (page: number) => void;
    total: number;
    totalPages: number;
    tableLoading: boolean;
}) {
    return (
        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-lg font-black text-[#184D47]">
                    <Star size={18} className="text-[#D4AF37]" />
                    Detail Seluruh Transaksi
                    <span className="rounded-full bg-[#f8f0dd] px-2 py-0.5 text-xs font-bold text-[#184D47]/70">
                        {total}
                    </span>
                </h3>
                <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 rounded-xl bg-[#f8f6f0] px-3">
                        <Search size={16} className="text-[#184D47]/50" />
                        <input
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setPage(1);
                            }}
                            placeholder="Cari invoice / pelanggan"
                            className="h-10 w-48 bg-transparent text-sm font-bold text-[#184D47] outline-none placeholder:text-[#184D47]/40"
                        />
                    </label>
                    <select
                        value={statusFilter}
                        onChange={(event) => {
                            setStatusFilter(event.target.value as StatusFilter);
                            setPage(1);
                        }}
                        className="h-10 rounded-xl bg-[#f8f6f0] px-3 text-sm font-bold text-[#184D47]"
                    >
                        {STATUS_FILTERS.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="text-[#184D47]/50">
                        <tr>
                            <th className="p-3">Invoice</th>
                            <th className="p-3">Pelanggan</th>
                            <th className="p-3">Pembayaran</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Total</th>
                            <th className="p-3 text-right">Tanggal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableLoading ? (
                            <tr>
                                <td colSpan={6} className="p-6 text-center">
                                    <Loader2 size={20} className="mx-auto animate-spin text-[#C9A45B]" />
                                    <span className="mt-2 block text-sm font-bold text-[#184D47]/50">Memuat...</span>
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-6 text-center text-sm text-[#184D47]/50">
                                    Belum ada transaksi pada filter ini.
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => (
                                <tr key={order.id} className="border-t border-[#184D47]/10">
                                    <td className="p-3 font-black text-[#184D47]">{order.invoice}</td>
                                    <td className="p-3">
                                        <p className="font-bold text-[#184D47]">{order.customer}</p>
                                        <p className="text-xs text-[#184D47]/50">{order.source}</p>
                                    </td>
                                    <td className="p-3 text-[#184D47]/70">
                                        {paymentMethodLabel(order.paymentMethod)}
                                    </td>
                                    <td className="p-3">
                                        <StatusBadge status={order.status} />
                                    </td>
                                    <td className="p-3 text-right font-black text-[#184D47]">
                                        {formatRupiah(order.total)}
                                    </td>
                                    <td className="p-3 text-right text-[#184D47]/70">
                                        {formatDate(order.createdAt)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm font-bold text-[#184D47]/60">
                        Halaman {page} dari {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page <= 1}
                            className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#184D47]/15 px-3 text-sm font-bold text-[#184D47] disabled:opacity-40"
                        >
                            <ChevronLeft size={16} />
                            Sebelumnya
                        </button>
                        <button
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page >= totalPages}
                            className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#184D47]/15 px-3 text-sm font-bold text-[#184D47] disabled:opacity-40"
                        >
                            Berikutnya
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

function StatusBadge({ status }: { status: string }) {
    const upper = status.toUpperCase();
    const tone =
        upper === "COMPLETED"
            ? "bg-emerald-100 text-emerald-800"
            : upper === "CANCELLED" || upper === "CANCELED"
              ? "bg-red-100 text-red-800"
              : upper === "PENDING"
                ? "bg-amber-100 text-amber-800"
                : "bg-sky-100 text-sky-800";

    return (
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
            {statusLabel(status)}
        </span>
    );
}
