"use client";

// Admin — consignment store detail: profile + assignment editing, stock per
// product, visit & payment history, and a map thumbnail rendered through the
// existing loadGoogleMaps() singleton (no second loader, no hardcoded key).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Store } from "lucide-react";

import { formatDate, formatRupiah, paymentMethodLabel } from "@/components/sales/sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import { getGoogleMapsApi, loadGoogleMaps } from "@/lib/google-maps-loader";

type Detail = {
    store: {
        id: string;
        name: string;
        ownerName: string | null;
        phone: string | null;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        mapsUrl: string | null;
        notes: string | null;
        isActive: boolean;
        sales: { id: string; name: string; phone: string | null } | null;
    };
    stocks: {
        productId: string;
        productName: string;
        currentStock: number;
        quantitySupplied: number;
        quantitySold: number;
        quantityReturned: number;
        quantityDamaged: number;
        unitPrice: number;
    }[];
    totals: {
        totalStock: number;
        totalSold: number;
        totalSales: number;
        totalPaid: number;
        receivable: number;
        totalReturned: number;
        totalDamaged: number;
    };
    visits: { id: string; visitedAt: string; salesName: string; totalSold: number; totalSupplied: number; salesAmount: number; paidAmount: number; status: string }[];
    payments: { id: string; amount: number; paymentMethod: string; paymentDate: string; status: string; reference: string | null }[];
};

type SalesOption = { id: string; name: string; isActive: boolean };

export function ConsignmentStoreDetail({ storeId }: { storeId: string }) {
    const [data, setData] = useState<Detail | null>(null);
    const [salespeople, setSalespeople] = useState<SalesOption[]>([]);
    const [error, setError] = useState("");
    const [actionError, setActionError] = useState("");
    const [busy, setBusy] = useState(false);
    const [mapError, setMapError] = useState("");
    const mapRef = useRef<HTMLDivElement | null>(null);

    const load = useCallback(() => {
        fetch(`/api/admin/consignment/stores/${storeId}`, { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Detail toko gagal dimuat.");
                setData(payload as Detail);
            })
            .catch((err) => setError(getUserFacingMessage(err, "Detail toko gagal dimuat.")));
    }, [storeId]);

    useEffect(() => {
        load();
        fetch("/api/admin/consignment/salespeople", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (response.ok) setSalespeople((payload as { salespeople: SalesOption[] }).salespeople.filter((sales) => sales.isActive));
            })
            .catch(() => undefined);
    }, [load]);

    // Map thumbnail: mounted only when the store has coordinates.
    const latitude = data?.store.latitude ?? null;
    const longitude = data?.store.longitude ?? null;
    const storeName = data?.store.name ?? "";
    useEffect(() => {
        if (latitude === null || longitude === null || !mapRef.current) return;
        let disposed = false;
        const node = mapRef.current;
        loadGoogleMaps()
            .then(() => {
                const api = getGoogleMapsApi();
                if (disposed || !node || !api) return;
                const position = { lat: latitude, lng: longitude };
                const map = new api.maps.Map(node, { center: position, zoom: 16, fullscreenControl: false, streetViewControl: false, mapTypeControl: false, gestureHandling: "cooperative", clickableIcons: false });
                if (api.maps.Marker) new api.maps.Marker({ map, position, title: storeName });
            })
            .catch((err) => { if (!disposed) setMapError(getUserFacingMessage(err, "Peta gagal dimuat.")); });
        return () => { disposed = true; };
    }, [latitude, longitude, storeName]);

    async function patchStore(body: Record<string, unknown>, fallback: string) {
        if (busy) return;
        setBusy(true);
        setActionError("");
        try {
            const response = await fetch(`/api/admin/consignment/stores/${storeId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || fallback);
            load();
        } catch (err) {
            setActionError(getUserFacingMessage(err, fallback));
        } finally {
            setBusy(false);
        }
    }

    if (error) {
        return (
            <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
                <div className="mx-auto max-w-5xl">
                    <Link href="/admin/titip-jual" className="text-sm font-bold text-[#184C3A]">← Kembali ke Titip Jual</Link>
                    <p className="mt-6 rounded-2xl border border-red-200 bg-white p-5 text-sm font-semibold text-red-700">{error}</p>
                </div>
            </main>
        );
    }

    if (!data) {
        return (
            <main className="grid min-h-screen place-items-center bg-[#f7f4ec]"><Loader2 className="animate-spin text-[#184C3A]" /></main>
        );
    }

    const { store, stocks, totals, visits, payments } = data;

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/titip-jual" className="text-sm font-bold text-[#184C3A]">← Kembali ke Titip Jual</Link>

                <header className="mt-4 mb-6 flex flex-wrap items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]"><Store size={26} /></div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-black text-[#123d2d]">{store.name}</h1>
                        <p className="text-sm text-[#17241d]/60">
                            {store.ownerName ? `${store.ownerName} · ` : ""}{store.phone ?? "-"}
                        </p>
                        {store.address && <p className="flex items-center gap-1 text-xs text-[#17241d]/50"><MapPin size={12} /> {store.address}</p>}
                    </div>
                    <span className={`ml-auto rounded-full px-3 py-1 text-xs font-black ${store.isActive ? "bg-[#e8f3e3] text-[#29621a]" : "bg-red-50 text-red-600"}`}>
                        {store.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                </header>

                {actionError && <p className="mb-4 rounded-2xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700">{actionError}</p>}

                <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Ringkasan toko">
                    {[
                        ["Stok Saat Ini", `${totals.totalStock} pcs`],
                        ["Total Terjual", `${totals.totalSold} pcs`],
                        ["Total Penjualan", formatRupiah(totals.totalSales)],
                        ["Sudah Disetor", formatRupiah(totals.totalPaid)],
                        ["Piutang", formatRupiah(totals.receivable)],
                        ["Retur", `${totals.totalReturned} pcs`],
                        ["Rusak", `${totals.totalDamaged} pcs`],
                    ].map(([label, value]) => (
                        <div key={label} className="admin-card rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-[#17241d]/55">{label}</p>
                            <p className="mt-1 text-lg font-black text-[#123d2d]">{value}</p>
                        </div>
                    ))}
                </section>

                <section className="mt-6 grid gap-4 md:grid-cols-[1.4fr_1fr]">
                    <div className="rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#17241d]/60">Pengelolaan</h2>
                        <label className="mt-3 block text-sm font-bold">Sales penanggung jawab
                            <select
                                value={store.sales?.id ?? ""}
                                disabled={busy}
                                onChange={(e) => patchStore({ assignedSalesId: e.target.value || null }, "Penugasan sales gagal diubah.")}
                                className="mt-1 h-11 w-full rounded-xl border border-[#ded9cc] bg-white px-3 font-semibold"
                            >
                                <option value="">Belum ditugaskan</option>
                                {salespeople.map((sales) => <option key={sales.id} value={sales.id}>{sales.name}</option>)}
                            </select>
                        </label>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => patchStore({ isActive: !store.isActive }, "Status toko gagal diubah.")}
                            className={`mt-4 min-h-11 w-full rounded-xl font-black text-white disabled:opacity-60 ${store.isActive ? "bg-red-600" : "bg-[#184C3A]"}`}
                        >
                            {store.isActive ? "Nonaktifkan Toko" : "Aktifkan Toko"}
                        </button>
                        {store.notes && <p className="mt-4 rounded-xl bg-[#f7f4ec] p-3 text-sm text-[#17241d]/70">{store.notes}</p>}
                    </div>

                    <div className="rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#17241d]/60">Lokasi</h2>
                        {store.latitude !== null && store.longitude !== null ? (
                            <>
                                <div ref={mapRef} className="mt-3 h-44 w-full overflow-hidden rounded-xl bg-[#f0ece0]" aria-label={`Peta lokasi ${store.name}`} />
                                {mapError && <p className="mt-2 text-xs font-semibold text-red-600">{mapError}</p>}
                                <a
                                    href={store.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${store.latitude},${store.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#184C3A] hover:underline"
                                >
                                    <MapPin size={14} /> Buka di Google Maps
                                </a>
                            </>
                        ) : (
                            <p className="mt-3 text-sm text-[#17241d]/55">Koordinat belum diatur.</p>
                        )}
                    </div>
                </section>

                <section className="mt-6 rounded-2xl border border-[#ded9cc] bg-white shadow-sm">
                    <h2 className="px-5 pt-5 text-sm font-black uppercase tracking-wide text-[#17241d]/60">Stok per Produk</h2>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="bg-[#f2eee2] text-left text-xs font-black uppercase tracking-wide text-[#17241d]/60">
                                    <th className="px-4 py-2.5">Produk</th>
                                    <th className="px-4 py-2.5 text-right">Supply</th>
                                    <th className="px-4 py-2.5 text-right">Terjual</th>
                                    <th className="px-4 py-2.5 text-right">Retur</th>
                                    <th className="px-4 py-2.5 text-right">Rusak</th>
                                    <th className="px-4 py-2.5 text-right">Sisa</th>
                                    <th className="px-4 py-2.5 text-right">Harga</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stocks.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-6 text-center text-[#17241d]/50">Belum ada stok titipan.</td></tr>
                                )}
                                {stocks.map((stock) => (
                                    <tr key={stock.productId} className="border-t border-[#f0ece0]">
                                        <td className="px-4 py-2.5 font-bold">{stock.productName}</td>
                                        <td className="px-4 py-2.5 text-right">{stock.quantitySupplied}</td>
                                        <td className="px-4 py-2.5 text-right">{stock.quantitySold}</td>
                                        <td className="px-4 py-2.5 text-right">{stock.quantityReturned}</td>
                                        <td className="px-4 py-2.5 text-right">{stock.quantityDamaged}</td>
                                        <td className="px-4 py-2.5 text-right font-black">{stock.currentStock}</td>
                                        <td className="px-4 py-2.5 text-right">{formatRupiah(stock.unitPrice)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="mt-6 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#17241d]/60">Riwayat Kunjungan</h2>
                        {visits.length === 0 ? <p className="mt-3 text-sm text-[#17241d]/50">Belum ada kunjungan.</p> : (
                            <ul className="mt-3 space-y-2">
                                {visits.map((visit) => (
                                    <li key={visit.id} className="rounded-xl border border-[#f0ece0] p-3 text-sm">
                                        <div className="flex justify-between gap-2">
                                            <span className="font-bold">{visit.salesName}</span>
                                            <span className="text-xs text-[#17241d]/50">{formatDate(visit.visitedAt)}</span>
                                        </div>
                                        <p className="mt-1 text-[#17241d]/70">
                                            Terjual {visit.totalSold} pcs · Supply {visit.totalSupplied} pcs · {formatRupiah(visit.salesAmount)} (dibayar {formatRupiah(visit.paidAmount)})
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#17241d]/60">Riwayat Setoran</h2>
                        {payments.length === 0 ? <p className="mt-3 text-sm text-[#17241d]/50">Belum ada setoran.</p> : (
                            <ul className="mt-3 space-y-2">
                                {payments.map((payment) => (
                                    <li key={payment.id} className="flex items-center justify-between rounded-xl border border-[#f0ece0] p-3 text-sm">
                                        <div>
                                            <p className="font-bold">{formatRupiah(payment.amount)}</p>
                                            <p className="text-xs text-[#17241d]/50">{formatDate(payment.paymentDate)} · {paymentMethodLabel(payment.paymentMethod)}</p>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-black ${payment.status === "VALID" ? "bg-[#e8f3e3] text-[#29621a]" : "bg-red-50 text-red-600"}`}>{payment.status}</span>
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