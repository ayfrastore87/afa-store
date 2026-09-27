"use client";

// Admin — Sales & Titip Jual dashboard: period summary + stores table +
// create-store form. Every figure comes from the admin consignment APIs;
// nothing is computed client-side beyond display formatting.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2, Map, MapPin, Plus, Store, Users, Wallet } from "lucide-react";

import { formatDateShort, formatRupiah } from "@/components/sales/sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type Summary = {
    period: string;
    activeStores: number;
    consignedStock: number;
    soldToday: number;
    soldThisMonth: number;
    periodSold: number;
    periodSupplied: number;
    periodVisitCount: number;
    omzet: number;
    settlement: number;
    returned: number;
    damaged: number;
    receivable: number;
};

type StoreRow = {
    id: string;
    name: string;
    address: string | null;
    isActive: boolean;
    salesName: string | null;
    totalStock: number;
    totalSold: number;
    receivable: number;
    lastVisitAt: string | null;
};

type SalesOption = { id: string; name: string; isActive: boolean };

const PERIODS = [
    ["today", "Hari Ini"],
    ["7d", "7 Hari"],
    ["30d", "30 Hari"],
    ["month", "Bulan Ini"],
] as const;

const emptyStoreForm = { name: "", ownerName: "", phone: "", address: "", latitude: "", longitude: "", assignedSalesId: "" };

export function ConsignmentAdminPanel() {
    const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("today");
    const [summary, setSummary] = useState<Summary | null>(null);
    const [stores, setStores] = useState<StoreRow[] | null>(null);
    const [salespeople, setSalespeople] = useState<SalesOption[]>([]);
    const [error, setError] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyStoreForm);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);

    const loadStores = useCallback(() => {
        fetch("/api/admin/consignment/stores", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Daftar toko gagal dimuat.");
                setStores((payload as { stores: StoreRow[] }).stores);
            })
            .catch((err) => setError(getUserFacingMessage(err, "Daftar toko gagal dimuat.")));
    }, []);

    useEffect(() => {
        loadStores();
        fetch("/api/admin/consignment/salespeople", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (response.ok) setSalespeople((payload as { salespeople: SalesOption[] }).salespeople.filter((sales) => sales.isActive));
            })
            .catch(() => undefined);
    }, [loadStores]);

    useEffect(() => {
        let disposed = false;
        setSummary(null);
        fetch(`/api/admin/consignment/summary?period=${period}`, { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Ringkasan gagal dimuat.");
                if (!disposed) setSummary(payload as Summary);
            })
            .catch((err) => { if (!disposed) setError(getUserFacingMessage(err, "Ringkasan gagal dimuat.")); });
        return () => { disposed = true; };
    }, [period]);

    async function createStore(e: React.FormEvent) {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        setFormError("");
        try {
            const latitude = form.latitude.trim() === "" ? null : Number(form.latitude);
            const longitude = form.longitude.trim() === "" ? null : Number(form.longitude);
            if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
                throw new Error("Koordinat harus berupa angka.");
            }
            const response = await fetch("/api/admin/consignment/stores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    ownerName: form.ownerName || undefined,
                    phone: form.phone || undefined,
                    address: form.address || undefined,
                    latitude,
                    longitude,
                    assignedSalesId: form.assignedSalesId || null,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || "Toko gagal disimpan.");
            setForm(emptyStoreForm);
            setFormOpen(false);
            loadStores();
        } catch (err) {
            setFormError(getUserFacingMessage(err, "Toko gagal disimpan."));
        } finally {
            setSaving(false);
        }
    }

    const cards = summary
        ? [
            { label: "Toko Aktif", value: String(summary.activeStores) },
            { label: "Stok Dititipkan", value: `${summary.consignedStock} pcs` },
            { label: "Terjual (periode)", value: `${summary.periodSold} pcs` },
            { label: "Omzet Titip Jual", value: formatRupiah(summary.omzet) },
            { label: "Setoran Diterima", value: formatRupiah(summary.settlement) },
            { label: "Total Piutang", value: formatRupiah(summary.receivable) },
            { label: "Retur (periode)", value: `${summary.returned} pcs` },
            { label: "Rusak (periode)", value: `${summary.damaged} pcs` },
        ]
        : [];

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-6xl">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-black text-[#123d2d]">Sales &amp; Titip Jual</h1>
                        <p className="text-sm text-[#17241d]/60">Pantau toko titipan, sales lapangan, setoran, dan piutang.</p>
                    </div>
                    <nav className="flex flex-wrap gap-2 text-sm font-bold">
                        <Link href="/admin/titip-jual/sales" className="flex min-h-11 items-center gap-2 rounded-xl border border-[#184C3A]/25 bg-white px-4 text-[#184C3A]"><Users size={16} /> Sales</Link>
                        <Link href="/admin/sales/map" className="flex min-h-11 items-center gap-2 rounded-xl border border-[#184C3A]/25 bg-white px-4 text-[#184C3A]"><Map size={16} /> Peta</Link>
                        <Link href="/admin/titip-jual/laporan" className="flex min-h-11 items-center gap-2 rounded-xl border border-[#184C3A]/25 bg-white px-4 text-[#184C3A]"><BarChart3 size={16} /> Laporan</Link>
                    </nav>
                </header>

                {error && <p className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700">{error}</p>}

                <div className="mt-6 flex flex-wrap gap-2">
                    {PERIODS.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setPeriod(value)}
                            className={`min-h-10 rounded-xl px-4 text-sm font-black transition ${period === value ? "bg-[#184C3A] text-white" : "border border-[#184C3A]/20 bg-white text-[#184C3A]"}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {!summary ? (
                    <div className="mt-6 grid min-h-28 place-items-center"><Loader2 className="animate-spin text-[#184C3A]" /></div>
                ) : (
                    <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Ringkasan titip jual">
                        {cards.map((card) => (
                            <div key={card.label} className="admin-card rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-[#17241d]/55">{card.label}</p>
                                <p className="mt-1 text-lg font-black text-[#123d2d]">{card.value}</p>
                            </div>
                        ))}
                    </section>
                )}

                <section className="mt-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="flex items-center gap-2 text-lg font-black text-[#123d2d]"><Store size={18} className="text-[#D4AF37]" /> Toko Titipan</h2>
                        <button type="button" onClick={() => setFormOpen((open) => !open)} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#184C3A] px-4 text-sm font-black text-white">
                            <Plus size={16} /> {formOpen ? "Tutup Form" : "Tambah Toko"}
                        </button>
                    </div>

                    {formOpen && (
                        <form onSubmit={createStore} className="mt-4 grid gap-3 rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm md:grid-cols-2">
                            <label className="text-sm font-bold">Nama toko *
                                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                            </label>
                            <label className="text-sm font-bold">Nama pemilik
                                <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                            </label>
                            <label className="text-sm font-bold">No. telepon
                                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                            </label>
                            <label className="text-sm font-bold">Sales penanggung jawab
                                <select value={form.assignedSalesId} onChange={(e) => setForm({ ...form, assignedSalesId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] bg-white px-3 font-semibold">
                                    <option value="">Belum ditugaskan</option>
                                    {salespeople.map((sales) => <option key={sales.id} value={sales.id}>{sales.name}</option>)}
                                </select>
                            </label>
                            <label className="text-sm font-bold md:col-span-2">Alamat
                                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                            </label>
                            <label className="text-sm font-bold">Latitude
                                <input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="-6.2" className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                            </label>
                            <label className="text-sm font-bold">Longitude
                                <input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="106.8" className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                            </label>
                            {formError && <p className="text-sm font-semibold text-red-600 md:col-span-2">{formError}</p>}
                            <button disabled={saving} className="min-h-11 rounded-xl bg-[#184C3A] font-black text-white disabled:opacity-60 md:col-span-2">
                                {saving ? "Menyimpan..." : "SIMPAN TOKO"}
                            </button>
                        </form>
                    )}

                    {!stores ? (
                        <div className="mt-4 grid min-h-28 place-items-center"><Loader2 className="animate-spin text-[#184C3A]" /></div>
                    ) : stores.length === 0 ? (
                        <p className="mt-4 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 p-8 text-center text-sm font-semibold text-[#17241d]/55">Belum ada toko titipan.</p>
                    ) : (
                        <div className="mt-4 overflow-x-auto rounded-2xl border border-[#ded9cc] bg-white shadow-sm">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead>
                                    <tr className="bg-[#f2eee2] text-left text-xs font-black uppercase tracking-wide text-[#17241d]/60">
                                        <th className="px-4 py-3">Toko</th>
                                        <th className="px-4 py-3">Sales</th>
                                        <th className="px-4 py-3 text-right">Stok</th>
                                        <th className="px-4 py-3 text-right">Terjual</th>
                                        <th className="px-4 py-3 text-right">Piutang</th>
                                        <th className="px-4 py-3">Kunjungan Terakhir</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stores.map((store) => (
                                        <tr key={store.id} className="border-t border-[#f0ece0]">
                                            <td className="px-4 py-3">
                                                <Link href={`/admin/titip-jual/toko/${store.id}`} className="font-black text-[#184C3A] hover:underline">{store.name}</Link>
                                                {store.address && <p className="flex items-center gap-1 text-xs text-[#17241d]/50"><MapPin size={11} /> {store.address}</p>}
                                            </td>
                                            <td className="px-4 py-3 font-semibold">{store.salesName ?? <span className="text-[#17241d]/40">—</span>}</td>
                                            <td className="px-4 py-3 text-right font-bold">{store.totalStock} pcs</td>
                                            <td className="px-4 py-3 text-right font-bold">{store.totalSold} pcs</td>
                                            <td className="px-4 py-3 text-right font-black text-[#8B6B3F]">{formatRupiah(store.receivable)}</td>
                                            <td className="px-4 py-3">{formatDateShort(store.lastVisitAt)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`rounded-full px-3 py-1 text-xs font-black ${store.isActive ? "bg-[#e8f3e3] text-[#29621a]" : "bg-red-50 text-red-600"}`}>
                                                    {store.isActive ? "Aktif" : "Nonaktif"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <p className="mt-8 flex items-center gap-2 text-xs text-[#17241d]/40"><Wallet size={13} /> Piutang = penjualan kunjungan selesai − setoran valid, dihitung otomatis oleh server.</p>
            </div>
        </main>
    );
}