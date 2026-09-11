"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, CheckCircle2, Loader2, MapPin, Store, Tags, XCircle } from "lucide-react";

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

const statusTone: Record<string, string> = {
    PENDING: "bg-[#fff2d6] text-[#8b5e00]",
    ACTIVE: "bg-[#e8f3e3] text-[#29621a]",
    REJECTED: "bg-[#f7e9e6] text-[#8c2e25]",
    SUSPENDED: "bg-[#f5ebd8] text-[#76551d]",
};

const date = (value?: string | null) => (value ? new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

export function PartnerAdminPanel() {
    const [partners, setPartners] = useState<PartnerRow[]>([]);
    const [filter, setFilter] = useState<string>("Semua");
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [message, setMessage] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/admin/partners");
            if (response.ok) {
                const data = (await response.json()) as { partners?: PartnerRow[] };
                setPartners(data.partners ?? []);
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const counts = useMemo(() => {
        const result: Record<string, number> = { Semua: partners.length };
        for (const status of PARTNER_STATUSES) result[status] = partners.filter((p) => p.status === status).length;
        return result;
    }, [partners]);

    const shown = partners.filter((p) => filter === "Semua" || p.status === filter);

    const act = async (id: string, action: "approve" | "reject") => {
        setBusyId(id);
        setMessage("");
        try {
            const response = await fetch(`/api/admin/partners/${id}/${action}`, { method: "POST" });
            const data = (await response.json().catch(() => null)) as { message?: string } | null;
            if (response.ok) {
                setMessage(data?.message || (action === "approve" ? "Mitra disetujui." : "Mitra ditolak."));
                await load();
            } else {
                setMessage(data?.message || "Aksi gagal.");
            }
        } catch {
            setMessage("Aksi gagal. Silakan coba lagi.");
        } finally {
            setBusyId(null);
        }
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
                        <h1 className="text-2xl font-black text-[#184C3A]">Kelola Pengajuan Mitra</h1>
                    </div>
                </header>

                <nav className="mb-4 flex flex-wrap gap-2">
                    {["Semua", ...PARTNER_STATUSES].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === status ? "border-[#184C3A] bg-[#184C3A] text-white" : "border-[#ded9cc] bg-white text-[#184C3A]"}`}
                        >
                            {status === "Semua" ? "Semua" : partnerStatusLabels[status]} <span className="ml-1.5 rounded-full bg-black/5 px-1.5 py-0.5">{counts[status] ?? 0}</span>
                        </button>
                    ))}
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
                                        </div>
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
