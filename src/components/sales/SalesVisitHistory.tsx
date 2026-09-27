"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatRupiah } from "./sales-shared";

type Visit = { id: string; visitedAt: string; storeName: string; salesAmount: number; paidAmount: number; remainingReceivable: number; hasLocation: boolean; photoUrl: string | null };
export function SalesVisitHistory() {
    const [visits, setVisits] = useState<Visit[] | null>(null); const [error, setError] = useState("");
    useEffect(() => { fetch("/api/sales/visits", { cache: "no-store" }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.message); setVisits(p.visits); }).catch(e => setError(e.message || "Riwayat gagal dimuat.")); }, []);
    if (error) return <p className="rounded-2xl bg-white p-5 text-red-700">{error}</p>;
    if (!visits) return <p className="rounded-2xl bg-white p-5">Memuat riwayat...</p>;
    return <div className="space-y-3"><h1 className="text-xl font-black">Riwayat Kunjungan</h1>{visits.length === 0 ? <div className="rounded-2xl bg-white p-8 text-center">Belum ada kunjungan.</div> : visits.map(v => <Link key={v.id} href={`/sales/riwayat/${v.id}`} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm"><div className="min-w-0 flex-1"><p className="font-black">{v.storeName}</p><p className="text-xs text-[#123524]/55">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v.visitedAt))}</p><p className="mt-2 text-sm font-bold">Penjualan {formatRupiah(v.salesAmount)} · Setoran {formatRupiah(v.paidAmount)} · Sisa {formatRupiah(v.remainingReceivable)}</p><p className="mt-1 text-xs font-bold text-[#29621a]">{v.hasLocation ? "✓ GPS" : "○ GPS tidak tersedia"}</p></div>{v.photoUrl && <img src={v.photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />}</Link>)}</div>;
}