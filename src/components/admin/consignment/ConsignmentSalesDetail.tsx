"use client";

// Admin — one field-sales person: profile, operational totals, assigned
// stores, latest visits and settlements. Read-only; account state changes
// happen from the Sales list panel.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, UserCircle } from "lucide-react";

import { formatDate, formatRupiah, paymentMethodLabel } from "@/components/sales/sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type Detail = {
    salesPerson: { id: string; name: string; phone: string | null; email: string | null; isActive: boolean; createdAt: string };
    totals: { storeCount: number; visitCount: number; totalSold: number; totalSupplied: number; totalSales: number; totalSettlement: number; receivable: number };
    stores: { id: string; name: string; address: string | null; totalStock: number }[];
    visits: { id: string; visitedAt: string; storeName: string; totalSold: number; totalSupplied: number; salesAmount: number; status: string }[];
    payments: { id: string; amount: number; paymentMethod: string; paymentDate: string; storeName: string }[];
};

export function ConsignmentSalesDetail({ salesId }: { salesId: string }) {
    const [data, setData] = useState<Detail | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let disposed = false;
        fetch(`/api/admin/consignment/salespeople/${salesId}`, { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Detail sales gagal dimuat.");
                if (!disposed) setData(payload as Detail);
            })
            .catch((err) => { if (!disposed) setError(getUserFacingMessage(err, "Detail sales gagal dimuat.")); });
        return () => { disposed = true; };
    }, [salesId]);

    if (error) {
        return (
            <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
                <div className="mx-auto max-w-5xl">
                    <Link href="/admin/titip-jual/sales" className="text-sm font-bold text-[#184C3A]">← Kembali ke Sales</Link>
                    <p className="mt-6 rounded-2xl border border-red-200 bg-white p-5 text-sm font-semibold text-red-700">{error}</p>
                </div>
            </main>
        );
    }

    if (!data) {
        return <main className="grid min-h-screen place-items-center bg-[#f7f4ec]"><Loader2 className="animate-spin text-[#184C3A]" /></main>;
    }

    const { salesPerson, totals, stores, visits, payments } = data;

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/titip-jual/sales" className="text-sm font-bold text-[#184C3A]">← Kembali ke Sales</Link>

                <header className="mt-4 mb-6 flex flex-wrap items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]"><UserCircle size={28} /></div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-black text-[#123d2d]">{salesPerson.name}</h1>
                        <p className="text-sm text-[#17241d]/60">{salesPerson.email ?? "-"}{salesPerson.phone ? ` · ${salesPerson.phone}` : ""}</p>
                    </div>
                    <span className={`ml-auto rounded-full px-3 py-1 text-xs font-black ${salesPerson.isActive ? "bg-[#e8f3e3] text-[#29621a]" : "bg-red-50 text-red-600"}`}>
                        {salesPerson.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                </header>

                <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Ringkasan sales">
                    {[
                        ["Toko Dipegang", String(totals.storeCount)],
                        ["Kunjungan", String(totals.visitCount)],
                        ["Terjual", `${totals.totalSold} pcs`],
                        ["Disupply", `${totals.totalSupplied} pcs`],
                        ["Total Penjualan", formatRupiah(totals.totalSales)],
                        ["Total Setoran", formatRupiah(totals.totalSettlement)],
                        ["Piutang", formatRupiah(totals.receivable)],
                    ].map(([label, value]) => (
                        <div key={label} className="admin-card rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-[#17241d]/55">{label}</p>
                            <p className="mt-1 text-lg font-black text-[#123d2d]">{value}</p>
                        </div>
                    ))}
                </section>

                <section className="mt-6 rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-black uppercase tracking-wide text-[#17241d]/60">Toko yang Dipegang</h2>
                    {stores.length === 0 ? <p className="mt-3 text-sm text-[#17241d]/50">Belum ada toko yang ditugaskan.</p> : (
                        <ul className="mt-3 grid gap-2 md:grid-cols-2">
                            {stores.map((store) => (
                                <li key={store.id} className="rounded-xl border border-[#f0ece0] p-3 text-sm">
                                    <Link href={`/admin/titip-jual/toko/${store.id}`} className="font-black text-[#184C3A] hover:underline">{store.name}</Link>
                                    <p className="text-xs text-[#17241d]/50">{store.address ?? "-"}</p>
                                    <p className="mt-1 text-xs font-bold text-[#17241d]/70">Stok titipan: {store.totalStock} pcs</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="mt-6 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#17241d]/60">Kunjungan Terakhir</h2>
                        {visits.length === 0 ? <p className="mt-3 text-sm text-[#17241d]/50">Belum ada kunjungan.</p> : (
                            <ul className="mt-3 space-y-2">
                                {visits.map((visit) => (
                                    <li key={visit.id} className="rounded-xl border border-[#f0ece0] p-3 text-sm">
                                        <div className="flex justify-between gap-2">
                                            <span className="font-bold">{visit.storeName}</span>
                                            <span className="text-xs text-[#17241d]/50">{formatDate(visit.visitedAt)}</span>
                                        </div>
                                        <p className="mt-1 text-[#17241d]/70">Terjual {visit.totalSold} pcs · Supply {visit.totalSupplied} pcs · {formatRupiah(visit.salesAmount)}</p>
                                        <Link href={`/admin/titip-jual/kunjungan/${visit.id}`} className="mt-2 inline-block font-black text-[#184C3A] hover:underline">Lihat Detail</Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#17241d]/60">Setoran Terakhir</h2>
                        {payments.length === 0 ? <p className="mt-3 text-sm text-[#17241d]/50">Belum ada setoran.</p> : (
                            <ul className="mt-3 space-y-2">
                                {payments.map((payment) => (
                                    <li key={payment.id} className="flex items-center justify-between rounded-xl border border-[#f0ece0] p-3 text-sm">
                                        <div>
                                            <p className="font-bold">{formatRupiah(payment.amount)}</p>
                                            <p className="text-xs text-[#17241d]/50">{payment.storeName} · {paymentMethodLabel(payment.paymentMethod)}</p>
                                        </div>
                                        <span className="text-xs text-[#17241d]/50">{formatDate(payment.paymentDate)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}