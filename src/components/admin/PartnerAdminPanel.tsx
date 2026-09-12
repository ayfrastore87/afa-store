"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    Award,
    Boxes,
    CheckCircle2,
    Download,
    Loader2,
    MapPin,
    Package,
    Store,
    Tags,
    TrendingUp,
    Users,
    Wallet,
    XCircle,
} from "lucide-react";

import { partnerStatusLabels, partnerTypeLabels, PARTNER_STATUSES } from "@/lib/partner";

type PartnerRow = {
    id: string;
    partnerCode: string;
    partnerType: string;
    status: string;
    displayName: string;
    businessName: string | null;
    phone: string | null;
    address: string | null;
    village: string | null;
    district: string | null;
    city: string | null;
    postalCode: string | null;
    createdAt: string;
    user: { id: string; name: string; email: string; phone: string | null; isActive: boolean } | null;
};

type PartnerAggregate = { revenue: number; grossProfit: number; transactions: number };

type PartnerDashboard = {
    period: string;
    generatedAt: string;
    summary: {
        revenue: number;
        transactionCount: number;
        itemsSold: number;
        grossProfit: number;
        averageTransaction: number;
    };
    growth: {
        revenuePct: number | null;
        transactionPct: number | null;
        prevRevenue: number;
        prevTransactions: number;
    };
    partners: {
        total: number;
        active: number;
        pending: number;
        rejected: number;
        suspended: number;
    };
    topPartners: {
        id: string;
        name: string;
        partnerCode: string;
        partnerType: string;
        revenue: number;
        transactions: number;
    }[];
    topProducts: { name: string; quantity: number; revenue: number }[];
    trend: { label: string; revenue: number; count: number }[];
};

const PERIODS: { id: string; label: string }[] = [
    { id: "hari", label: "Hari Ini" },
    { id: "7hari", label: "7 Hari" },
    { id: "bulan", label: "Bulan Ini" },
    { id: "bulanlalu", label: "Bulan Lalu" },
    { id: "tahun", label: "Tahun Ini" },
];

const statusTone: Record<string, string> = {
    PENDING: "bg-[#fff2d6] text-[#8b5e00]",
    ACTIVE: "bg-[#e8f3e3] text-[#29621a]",
    REJECTED: "bg-[#f7e9e6] text-[#8c2e25]",
    SUSPENDED: "bg-[#f5ebd8] text-[#76551d]",
};

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const compactRupiah = (n: number) =>
    n >= 1_000_000 ? `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : rupiah(n);

const date = (value?: string | null) =>
    value ? new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

export function PartnerAdminPanel() {
    const [partners, setPartners] = useState<PartnerRow[]>([]);
    const [aggregates, setAggregates] = useState<Record<string, PartnerAggregate>>({});
    const [dashboard, setDashboard] = useState<PartnerDashboard | null>(null);
    const [dashLoading, setDashLoading] = useState(true);
    const [period, setPeriod] = useState<string>("bulan");
    const [filter, setFilter] = useState<string>("Semua");
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [message, setMessage] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/admin/partners");
            if (response.ok) {
                const data = (await response.json()) as { partners?: PartnerRow[]; aggregates?: Record<string, PartnerAggregate> };
                setPartners(data.partners ?? []);
                setAggregates(data.aggregates ?? {});
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    const loadDashboard = useCallback(async (selected: string) => {
        setDashLoading(true);
        try {
            const response = await fetch(`/api/admin/partners/dashboard?period=${selected}`);
            if (response.ok) {
                const data = (await response.json()) as PartnerDashboard;
                setDashboard(data);
            }
        } catch {
            // ignore
        } finally {
            setDashLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        void loadDashboard(period);
    }, [loadDashboard, period]);

    const counts = useMemo(() => {
        const result: Record<string, number> = { Semua: partners.length };
        for (const status of PARTNER_STATUSES) result[status] = partners.filter((p) => p.status === status).length;
        return result;
    }, [partners]);

    const shown = partners.filter((p) => filter === "Semua" || p.status === filter);

    const pct = (value: number | null | undefined) => (value == null ? null : value >= 0 ? `+${value}%` : `${value}%`);

    const act = async (id: string, action: "approve" | "reject" | "suspend" | "reactivate" | "rereview") => {
        setBusyId(id);
        setMessage("");
        try {
            const response = await fetch(`/api/admin/partners/${id}/${action}`, { method: "POST" });
            const data = (await response.json().catch(() => null)) as { message?: string } | null;
            if (response.ok) {
                const fallback: Record<string, string> = {
                    approve: "Mitra disetujui.",
                    reject: "Mitra ditolak.",
                    suspend: "Mitra ditangguhkan.",
                    reactivate: "Mitra diaktifkan kembali.",
                    rereview: "Pengajuan dibuka kembali.",
                };
                setMessage(data?.message || fallback[action]);
                await Promise.all([load(), loadDashboard(period)]);
            } else {
                setMessage(data?.message || "Aksi gagal.");
            }
        } catch {
            setMessage("Aksi gagal. Silakan coba lagi.");
        } finally {
            setBusyId(null);
        }
    };

    const exportCsv = () => {
        if (!partners.length) return;
        const header = ["Partner Code", "Nama", "Jenis", "Status", "Bisnis", "Telepon", "Alamat", "Pendapatan", "Transaksi", "Diajukan"];
        const rows = partners.map((p) => {
            const agg = aggregates[p.id];
            return [
                p.partnerCode,
                p.businessName || p.displayName,
                partnerTypeLabels[p.partnerType] || p.partnerType,
                partnerStatusLabels[p.status] || p.status,
                p.businessName ?? "",
                p.phone || p.user?.phone || "",
                [p.address, p.village, p.district, p.city, p.postalCode].filter(Boolean).join(", "),
                agg ? String(agg.revenue) : "0",
                agg ? String(agg.transactions) : "0",
                date(p.createdAt),
            ];
        });
        const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "mitra-afa-store.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin" className="text-sm font-bold text-[#184C3A]">← Kembali ke Dashboard</Link>
                <header className="mt-4 mb-6 flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                        <Store size={26} />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4AF37]">AFA STORE MITRA</p>
                        <h1 className="text-2xl font-black text-[#184C3A]">Pusat Pengembangan Bisnis</h1>
                    </div>
                </header>

                {/* Dashboard overview (Tahap 1): period filter, stat cards, trend, */}
                {/* top partners, top products. */}

                <div className="mb-6 flex flex-wrap items-center gap-2">
                    {PERIODS.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setPeriod(item.id)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${period === item.id ? "border-[#184C3A] bg-[#184C3A] text-white" : "border-[#ded9cc] bg-white text-[#184C3A]"}`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                {dashboard && (
                    <div className="mb-6 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <StatCard icon={Wallet} label="Pendapatan" value={rupiah(dashboard.summary.revenue)} sub={pct(dashboard.growth.revenuePct)} tone="green" />
                            <StatCard icon={TrendingUp} label="Transaksi" value={String(dashboard.summary.transactionCount)} sub={pct(dashboard.growth.transactionPct)} tone="gold" />
                            <StatCard icon={Package} label="Item Terjual" value={String(dashboard.summary.itemsSold)} sub={`${rupiah(dashboard.summary.averageTransaction)} / transaksi`} tone="neutral" />
                            <StatCard icon={Users} label="Mitra Aktif" value={`${dashboard.partners.active} dari ${dashboard.partners.total}`} sub={`${dashboard.partners.pending} ditinjau`} tone="green" />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm lg:col-span-2">
                                <div className="mb-3 flex items-center justify-between">
                                    <h2 className="text-sm font-black text-[#123d2d]">Tren Pendapatan Mitra</h2>
                                    <span className="text-xs font-bold text-[#69736d]">Margin kotor {rupiah(dashboard.summary.grossProfit)}</span>
                                </div>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={dashboard.trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="partnerRevenueFill" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#184C3A" stopOpacity={0.35} />
                                                    <stop offset="95%" stopColor="#184C3A" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#184C3A" strokeOpacity={0.08} />
                                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#184C3A" }} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 11, fill: "#184C3A" }} tickFormatter={(v) => compactRupiah(Number(v))} width={72} />
                                            <Tooltip formatter={(v) => rupiah(Number(v))} labelStyle={{ color: "#123d2d", fontWeight: 700 }} />
                                            <Area type="monotone" dataKey="revenue" stroke="#184C3A" strokeWidth={2} fill="url(#partnerRevenueFill)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                                <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-[#123d2d]">
                                    <Award size={16} className="text-[#D4AF37]" /> Mitra Terbaik
                                </h2>
                                {dashboard.topPartners.length === 0 ? (
                                    <p className="py-8 text-center text-xs text-[#69736d]">Belum ada penjualan mitra pada periode ini.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {dashboard.topPartners.map((partner, index) => (
                                            <li key={partner.id} className="flex items-center gap-3 rounded-xl border border-[#f0ede4] px-3 py-2">
                                                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#184C3A] text-xs font-black text-white">{index + 1}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-bold text-[#123d2d]">{partner.name}</p>
                                                    <p className="text-[10px] text-[#858a86]">{partner.partnerCode}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-[#184C3A]">{compactRupiah(partner.revenue)}</p>
                                                    <p className="text-[10px] text-[#858a86]">{partner.transactions} transaksi</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </div>

                        <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                            <h2 className="mb-3 text-sm font-black text-[#123d2d]">Produk Terlaris (Mitra)</h2>
                            {dashboard.topProducts.length === 0 ? (
                                <p className="py-6 text-center text-xs text-[#69736d]">Belum ada produk terjual pada periode ini.</p>
                            ) : (
                                <div className="h-48">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={dashboard.topProducts} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#184C3A" strokeOpacity={0.08} horizontal={false} />
                                            <XAxis type="number" tick={{ fontSize: 11, fill: "#184C3A" }} />
                                            <YAxis type="category" dataKey="name" width={136} tick={{ fontSize: 10, fill: "#184C3A" }} />
                                            <Tooltip formatter={(v, _name, item) => [`${item.payload.quantity} unit · ${rupiah(Number(item.payload.revenue))}`, "Terjual"]} labelStyle={{ color: "#123d2d", fontWeight: 700 }} />
                                            <Bar dataKey="quantity" fill="#D4AF37" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {dashLoading && (
                    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="h-20 animate-pulse rounded-2xl bg-white" />
                        ))}
                    </div>
                )}

                <nav className="mb-4 flex flex-wrap items-center gap-2">
                    {["Semua", ...PARTNER_STATUSES].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === status ? "border-[#184C3A] bg-[#184C3A] text-white" : "border-[#ded9cc] bg-white text-[#184C3A]"}`}
                        >
                            {status === "Semua" ? "Semua" : partnerStatusLabels[status]} <span className="ml-1.5 rounded-full bg-black/5 px-1.5 py-0.5">{counts[status] ?? 0}</span>
                        </button>
                    ))}
                    <button
                        onClick={exportCsv}
                        className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#184C3A] bg-white px-4 text-sm font-bold text-[#184C3A] hover:bg-[#184C3A] hover:text-white"
                    >
                        <Download size={15} /> Ekspor CSV
                    </button>
                </nav>

                {message && <p className="mb-4 rounded-xl bg-[#fff2d6] p-3 text-sm font-bold text-[#8b5e00]">{message}</p>}

                {loading ? (
                    <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div>
                ) : shown.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-white py-16 text-center">
                        <Store className="mx-auto text-[#b18a3d]" />
                        <p className="mt-2 text-sm font-bold text-[#69736d]">Belum ada pengajuan mitra</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {shown.map((partner) => (
                            <article key={partner.id} className="rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <b className="text-sm text-[#123d2d]">{partner.displayName}</b>
                                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTone[partner.status] || "bg-gray-100"}`}>{partnerStatusLabels[partner.status] || partner.status}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-[#858a86]">{partner.partnerCode} · {partnerTypeLabels[partner.partnerType] || partner.partnerType}</p>
                                        {partner.businessName && <p className="text-xs text-[#69736d]">{partner.businessName}</p>}
                                        <p className="mt-1 text-xs text-[#69736d]">{[partner.address, partner.village, partner.district, partner.city, partner.postalCode].filter(Boolean).join(", ") || "-"}</p>
                                        <p className="mt-1 text-xs text-[#858a86]">Akun: {partner.user?.name || "-"} · {partner.user?.email || "-"} · {partner.phone || partner.user?.phone || "-"}</p>
                                        <p className="text-[10px] text-[#a0a6a1]">Diajukan {date(partner.createdAt)}</p>
                                        {aggregates[partner.id] && (
                                            <p className="mt-1 text-xs font-semibold text-[#184C3A]">
                                                Total: {rupiah(aggregates[partner.id].revenue)} · {aggregates[partner.id].transactions} transaksi
                                            </p>
                                        )}
                                    </div>
                                    {partner.status === "PENDING" && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => void act(partner.id, "approve")}
                                                disabled={busyId === partner.id}
                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#184C3A] px-4 text-sm font-bold text-white hover:bg-[#123a36] disabled:opacity-60"
                                            >
                                                {busyId === partner.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Setujui
                                            </button>
                                            <button
                                                onClick={() => void act(partner.id, "reject")}
                                                disabled={busyId === partner.id}
                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#ded9cc] bg-white px-4 text-sm font-bold text-[#8c2e25] hover:bg-red-50 disabled:opacity-60"
                                            >
                                                {busyId === partner.id ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Tolak
                                            </button>
                                        </div>
                                    )}
                                    {partner.status === "ACTIVE" && (
                                        <div className="flex flex-wrap gap-2">
                                            <Link
                                                href={`/admin/mitra/${partner.id}`}
                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#184C3A] px-4 text-sm font-bold text-white hover:bg-[#123a36]"
                                            >
                                                <Store size={15} /> Detail
                                            </Link>
                                            <Link
                                                href={`/admin/mitra/${partner.id}/stok`}
                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#184C3A] bg-white px-4 text-sm font-bold text-[#184C3A] hover:bg-[#184C3A] hover:text-white"
                                            >
                                                <Boxes size={15} /> Lihat Stok
                                            </Link>
                                            <Link
                                                href={`/admin/mitra/${partner.id}/harga`}
                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#184C3A] bg-white px-4 text-sm font-bold text-[#184C3A] hover:bg-[#184C3A] hover:text-white"
                                            >
                                                <Tags size={15} /> Kelola Harga
                                            </Link>
                                            <Link
                                                href={`/admin/mitra/${partner.id}/lokasi`}
                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#184C3A] bg-white px-4 text-sm font-bold text-[#184C3A] hover:bg-[#184C3A] hover:text-white"
                                            >
                                                <MapPin size={15} /> Lihat Lokasi
                                            </Link>
                                            <button
                                                onClick={() => void act(partner.id, "suspend")}
                                                disabled={busyId === partner.id}
                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#ded9cc] bg-white px-4 text-sm font-bold text-[#76551d] hover:bg-amber-50 disabled:opacity-60"
                                            >
                                                {busyId === partner.id ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Tangguhkan
                                            </button>
                                        </div>
                                    )}
                                    {partner.status === "SUSPENDED" && (
                                        <button
                                            onClick={() => void act(partner.id, "reactivate")}
                                            disabled={busyId === partner.id}
                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#184C3A] px-4 text-sm font-bold text-white hover:bg-[#123a36] disabled:opacity-60"
                                        >
                                            {busyId === partner.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Aktifkan Kembali
                                        </button>
                                    )}
                                    {partner.status === "REJECTED" && (
                                        <button
                                            onClick={() => void act(partner.id, "rereview")}
                                            disabled={busyId === partner.id}
                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#184C3A] bg-white px-4 text-sm font-bold text-[#184C3A] hover:bg-[#184C3A] hover:text-white disabled:opacity-60"
                                        >
                                            {busyId === partner.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Tinjau Ulang
                                        </button>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}

function StatCard({ icon: Icon, label, value, sub, tone }: {
    icon: typeof Wallet;
    label: string;
    value: string;
    sub: string | null;
    tone: "green" | "gold" | "neutral";
}) {
    const toneClass =
        tone === "green"
            ? "bg-[#184C3A] text-[#D4AF37]"
            : tone === "gold"
                ? "bg-[#D4AF37] text-[#184C3A]"
                : "bg-[#e8f3e3] text-[#184C3A]";
    return (
        <div className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
                <span className={`grid h-8 w-8 place-items-center rounded-xl ${toneClass}`}>
                    <Icon size={16} />
                </span>
            </div>
            <p className="mt-2 text-xl font-black text-[#123d2d]">{value}</p>
            {sub != null && <p className="mt-1 text-xs font-semibold text-[#69736d]">{sub}</p>}
        </div>
    );
}
