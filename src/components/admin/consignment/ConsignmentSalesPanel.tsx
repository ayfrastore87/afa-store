"use client";

// Admin — sales lapangan (field sales) accounts: list with operational totals,
// create account (Supabase Auth + users + SalesPerson, handled server-side),
// and activate/deactivate toggle. Mirrors the Akun Kasir management flow.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Users } from "lucide-react";

import { formatRupiah } from "@/components/sales/sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type SalesRow = {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    isActive: boolean;
    storeCount: number;
    visitCount: number;
    totalSold: number;
    totalSales: number;
    totalSettlement: number;
};

const emptyForm = { name: "", email: "", password: "", phone: "" };

export function ConsignmentSalesPanel() {
    const [salespeople, setSalespeople] = useState<SalesRow[] | null>(null);
    const [error, setError] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const load = useCallback(() => {
        fetch("/api/admin/consignment/salespeople", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Daftar sales gagal dimuat.");
                setSalespeople((payload as { salespeople: SalesRow[] }).salespeople);
            })
            .catch((err) => setError(getUserFacingMessage(err, "Daftar sales gagal dimuat.")));
    }, []);

    useEffect(() => { load(); }, [load]);

    async function createAccount(e: React.FormEvent) {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        setFormError("");
        try {
            const response = await fetch("/api/admin/consignment/salespeople", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: form.name, email: form.email, password: form.password, phone: form.phone || undefined }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || "Akun sales gagal dibuat.");
            setForm(emptyForm);
            setFormOpen(false);
            load();
        } catch (err) {
            setFormError(getUserFacingMessage(err, "Akun sales gagal dibuat."));
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(sales: SalesRow) {
        if (togglingId) return;
        setTogglingId(sales.id);
        setError("");
        try {
            const response = await fetch("/api/admin/consignment/salespeople", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: sales.id, isActive: !sales.isActive }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || "Status sales gagal diubah.");
            load();
        } catch (err) {
            setError(getUserFacingMessage(err, "Status sales gagal diubah."));
        } finally {
            setTogglingId(null);
        }
    }

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-6xl">
                <Link href="/admin/titip-jual" className="text-sm font-bold text-[#184C3A]">← Kembali ke Titip Jual</Link>

                <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-black text-[#123d2d]"><Users size={22} className="text-[#D4AF37]" /> Sales Lapangan</h1>
                        <p className="text-sm text-[#17241d]/60">Kelola akun sales titip jual beserta ringkasan operasionalnya.</p>
                    </div>
                    <button type="button" onClick={() => setFormOpen((open) => !open)} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#184C3A] px-4 text-sm font-black text-white">
                        <Plus size={16} /> {formOpen ? "Tutup Form" : "Tambah Sales"}
                    </button>
                </header>

                {error && <p className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700">{error}</p>}

                {formOpen && (
                    <form onSubmit={createAccount} className="mt-4 grid gap-3 rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm md:grid-cols-2">
                        <label className="text-sm font-bold">Nama *
                            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                        </label>
                        <label className="text-sm font-bold">Email *
                            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" autoComplete="off" />
                        </label>
                        <label className="text-sm font-bold">Password * <span className="font-normal text-[#17241d]/50">(min. 8 karakter)</span>
                            <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" autoComplete="new-password" />
                        </label>
                        <label className="text-sm font-bold">No. WhatsApp
                            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] px-3 font-semibold" />
                        </label>
                        {formError && <p className="text-sm font-semibold text-red-600 md:col-span-2">{formError}</p>}
                        <button disabled={saving} className="min-h-11 rounded-xl bg-[#184C3A] font-black text-white disabled:opacity-60 md:col-span-2">
                            {saving ? "Menyimpan..." : "BUAT AKUN SALES"}
                        </button>
                    </form>
                )}

                {!salespeople ? (
                    <div className="mt-6 grid min-h-28 place-items-center"><Loader2 className="animate-spin text-[#184C3A]" /></div>
                ) : salespeople.length === 0 ? (
                    <p className="mt-6 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 p-8 text-center text-sm font-semibold text-[#17241d]/55">Belum ada akun sales.</p>
                ) : (
                    <div className="mt-6 overflow-x-auto rounded-2xl border border-[#ded9cc] bg-white shadow-sm">
                        <table className="w-full min-w-[820px] text-sm">
                            <thead>
                                <tr className="bg-[#f2eee2] text-left text-xs font-black uppercase tracking-wide text-[#17241d]/60">
                                    <th className="px-4 py-3">Sales</th>
                                    <th className="px-4 py-3 text-right">Toko</th>
                                    <th className="px-4 py-3 text-right">Kunjungan</th>
                                    <th className="px-4 py-3 text-right">Terjual</th>
                                    <th className="px-4 py-3 text-right">Penjualan</th>
                                    <th className="px-4 py-3 text-right">Setoran</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {salespeople.map((sales) => (
                                    <tr key={sales.id} className="border-t border-[#f0ece0]">
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/titip-jual/sales/${sales.id}`} className="font-black text-[#184C3A] hover:underline">{sales.name}</Link>
                                            <p className="text-xs text-[#17241d]/50">{sales.email ?? "-"}{sales.phone ? ` · ${sales.phone}` : ""}</p>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold">{sales.storeCount}</td>
                                        <td className="px-4 py-3 text-right font-bold">{sales.visitCount}</td>
                                        <td className="px-4 py-3 text-right font-bold">{sales.totalSold} pcs</td>
                                        <td className="px-4 py-3 text-right font-bold">{formatRupiah(sales.totalSales)}</td>
                                        <td className="px-4 py-3 text-right font-bold">{formatRupiah(sales.totalSettlement)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-3 py-1 text-xs font-black ${sales.isActive ? "bg-[#e8f3e3] text-[#29621a]" : "bg-red-50 text-red-600"}`}>
                                                {sales.isActive ? "Aktif" : "Nonaktif"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                disabled={togglingId === sales.id}
                                                onClick={() => toggleActive(sales)}
                                                className={`min-h-9 rounded-lg px-3 text-xs font-black text-white disabled:opacity-60 ${sales.isActive ? "bg-red-600" : "bg-[#184C3A]"}`}
                                            >
                                                {sales.isActive ? "Nonaktifkan" : "Aktifkan"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </main>
    );
}