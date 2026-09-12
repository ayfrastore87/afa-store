"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Handshake, Loader2, Search, Store, User, Users } from "lucide-react";

type CustomerPartner = {
    id: string;
    partnerCode: string;
    partnerType: string;
    status: string;
    displayName: string;
    businessName: string | null;
};

type CustomerRow = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    isActive: boolean;
    createdAt: string;
    isPartner: boolean;
    partner: CustomerPartner | null;
    orderCount: number;
    totalSpent: number;
    lastOrderAt: string | null;
};

type CustomerResponse = {
    customers: CustomerRow[];
    summary: { total: number; partners: number; customers: number };
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

const TYPES = [
    { id: "all", label: "Semua" },
    { id: "customer", label: "Pelanggan" },
    { id: "partner", label: "Mitra" },
] as const;

const STATUS_TONES: Record<string, string> = {
    PENDING: "bg-[#fff2d6] text-[#8b5e00]",
    ACTIVE: "bg-[#e8f3e3] text-[#29621a]",
    REJECTED: "bg-[#f7e9e6] text-[#8c2e25]",
    SUSPENDED: "bg-[#f5ebd8] text-[#76551d]",
};

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const compactRupiah = (n: number) =>
    n >= 1_000_000 ? `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : rupiah(n);

const date = (v?: string | null) =>
    v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-";

export function CustomerAdminPanel() {
    const [data, setData] = useState<CustomerResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [type, setType] = useState<string>("all");
    const [partnerStatus, setPartnerStatus] = useState<string>("");
    const [page, setPage] = useState(1);

    const query = useMemo(() => {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        params.set("type", type);
        if (partnerStatus) params.set("partnerStatus", partnerStatus);
        params.set("page", String(page));
        params.set("limit", "20");
        return params.toString();
    }, [q, type, partnerStatus, page]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/customers?${query}`, { headers: { Accept: "application/json" } });
            const payload = (await response.json().catch(() => null)) as (CustomerResponse & { message?: string }) | null;
            if (!response.ok) throw new Error(payload?.message || "Data pelanggan gagal dimuat.");
            setData(payload as CustomerResponse);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Data pelanggan gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        void load();
    }, [load]);

    const customers = data?.customers ?? [];
    const summary = data?.summary ?? { total: 0, partners: 0, customers: 0 };
    const totalPages = data?.totalPages ?? 1;

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin" className="text-sm font-bold text-[#184C3A]">← Kembali ke Dashboard</Link>

                <header className="mt-4 mb-6 flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                        <Users size={26} />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4AF37]">AFA STORE PELANGGAN</p>
                        <h1 className="text-2xl font-black text-[#184C3A]">Manajemen Pelanggan</h1>
                    </div>
                </header>

                <div className="mb-5 grid grid-cols-3 gap-3">
                    <StatCard icon={Users} label="Total Pengguna" value={String(summary.total)} tone="green" />
                    <StatCard icon={User} label="Pelanggan" value={String(summary.customers)} tone="neutral" />
                    <StatCard icon={Handshake} label="Mitra" value={String(summary.partners)} tone="gold" />
                </div>

                <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                    <label className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#858a86]" />
                        <input
                            value={q}
                            onChange={(e) => {
                                setQ(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Cari nama, email, atau telepon..."
                            className="w-full rounded-xl border border-[#ded9cc] bg-[#f7f4ec] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#123d2d] outline-none focus:border-[#184C3A]"
                        />
                    </label>

                    <div className="flex gap-2">
                        {TYPES.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => {
                                    setType(t.id);
                                    setPage(1);
                                }}
                                className={`min-h-10 rounded-xl px-3 text-sm font-bold transition ${
                                    type === t.id ? "bg-[#184C3A] text-white" : "border border-[#ded9cc] bg-white text-[#123d2d] hover:bg-[#f0ede4]"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <select
                        value={partnerStatus}
                        onChange={(e) => {
                            setPartnerStatus(e.target.value);
                            setPage(1);
                        }}
                        className="min-h-10 rounded-xl border border-[#ded9cc] bg-white px-3 text-sm font-semibold text-[#123d2d] outline-none focus:border-[#184C3A]"
                    >
                        <option value="">Semua Status Mitra</option>
                        <option value="ACTIVE">Aktif</option>
                        <option value="PENDING">Ditinjau</option>
                        <option value="REJECTED">Ditolak</option>
                        <option value="SUSPENDED">Ditangguhkan</option>
                    </select>
                </div>

                {loading ? (
                    <div className="grid place-items-center py-16">
                        <Loader2 className="animate-spin text-[#184C3A]" size={32} />
                        <p className="mt-3 text-sm font-semibold text-[#69736d]">Memuat pelanggan...</p>
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 px-4 py-14 text-center">
                        <p className="text-sm font-semibold text-[#69736d]">{error}</p>
                    </div>
                ) : customers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 px-4 py-14 text-center">
                        <p className="text-sm font-semibold text-[#69736d]">Belum ada pelanggan yang cocok.</p>
                    </div>
                ) : (
                    <>
                        <div className="hidden overflow-hidden rounded-2xl border border-[#ded9cc] bg-white shadow-sm lg:block">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[#f0ede4] text-xs uppercase tracking-wide text-[#858a86]">
                                    <tr>
                                        <th className="p-3">Nama</th>
                                        <th className="p-3">Kontak</th>
                                        <th className="p-3">Jenis</th>
                                        <th className="p-3">Pesanan</th>
                                        <th className="p-3">Total Belanja</th>
                                        <th className="p-3">Terakhir</th>
                                        <th className="p-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.map((c) => (
                                        <tr key={c.id} className="border-t border-[#f0ede4]">
                                            <td className="p-3">
                                                <p className="font-bold text-[#123d2d]">{c.name}</p>
                                                {c.partner && <p className="text-[10px] text-[#858a86]">{c.partner.partnerCode}</p>}
                                            </td>
                                            <td className="p-3">
                                                <p className="text-[#123d2d]">{c.phone || "-"}</p>
                                                <p className="text-[10px] text-[#858a86]">{c.email}</p>
                                            </td>
                                            <td className="p-3">
                                                {c.isPartner ? (
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_TONES[c.partner?.status ?? ""] || "bg-gray-100 text-gray-700"}`}>
                                                        <Store size={11} /> MITRA
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f3e3] px-2.5 py-1 text-[10px] font-bold text-[#29621a]">
                                                        <User size={11} /> PELANGGAN
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 font-bold text-[#123d2d]">{c.orderCount}</td>
                                            <td className="p-3 font-black text-[#184C3A]">{compactRupiah(c.totalSpent)}</td>
                                            <td className="p-3 text-[#69736d]">{date(c.lastOrderAt)}</td>
                                            <td className="p-3 text-right">
                                                <Link href={`/admin/pelanggan/${c.id}`} className="inline-flex min-h-9 items-center rounded-xl bg-[#184C3A] px-3 text-xs font-bold text-white hover:bg-[#123a36]">
                                                    Detail
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="grid gap-3 lg:hidden">
                            {customers.map((c) => (
                                <article key={c.id} className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-black text-[#123d2d]">{c.name}</p>
                                            <p className="truncate text-xs text-[#858a86]">{c.email}</p>
                                        </div>
                                        {c.isPartner ? (
                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_TONES[c.partner?.status ?? ""] || "bg-gray-100 text-gray-700"}`}>MITRA</span>
                                        ) : (
                                            <span className="shrink-0 rounded-full bg-[#e8f3e3] px-2.5 py-1 text-[10px] font-bold text-[#29621a]">PELANGGAN</span>
                                        )}
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                                        <div>
                                            <p className="text-[10px] text-[#858a86]">Pesanan</p>
                                            <p className="font-bold text-[#123d2d]">{c.orderCount}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-[#858a86]">Belanja</p>
                                            <p className="font-black text-[#184C3A]">{compactRupiah(c.totalSpent)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-[#858a86]">Terakhir</p>
                                            <p className="font-semibold text-[#69736d]">{date(c.lastOrderAt)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <span className="text-xs text-[#69736d]">{c.phone || "-"}</span>
                                        <Link href={`/admin/pelanggan/${c.id}`} className="inline-flex min-h-9 items-center rounded-xl bg-[#184C3A] px-3 text-xs font-bold text-white">
                                            Detail
                                        </Link>
                                    </div>
                                </article>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="mt-4 flex items-center justify-between gap-3">
                                <button
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => p - 1)}
                                    className="min-h-10 rounded-xl border border-[#ded9cc] bg-white px-4 text-sm font-bold text-[#123d2d] disabled:opacity-40"
                                >
                                    ← Sebelumnya
                                </button>
                                <span className="text-sm font-bold text-[#69736d]">Halaman {page} dari {totalPages}</span>
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="min-h-10 rounded-xl border border-[#ded9cc] bg-white px-4 text-sm font-bold text-[#123d2d] disabled:opacity-40"
                                >
                                    Berikutnya →
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: "green" | "gold" | "neutral" }) {
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
        </div>
    );
}