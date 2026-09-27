"use client";

// Admin — full-page map of consignment stores that have coordinates. Uses the
// singleton loadGoogleMaps()/getGoogleMapsApi() pair (never a second loader or
// hardcoded key). Info windows show stock, receivable and assigned sales.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, Map as MapIcon } from "lucide-react";

import { formatRupiah } from "@/components/sales/sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import { getGoogleMapsApi, loadGoogleMaps } from "@/lib/google-maps-loader";

type StoreMarker = {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    isActive: boolean;
    salesName: string | null;
    totalStock: number;
    receivable: number;
};

function escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function ConsignmentStoreMap() {
    const [stores, setStores] = useState<StoreMarker[] | null>(null);
    const [error, setError] = useState("");
    const [mapError, setMapError] = useState("");
    const mapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let disposed = false;
        fetch("/api/admin/consignment/stores?withCoordinates=1", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Data toko gagal dimuat.");
                if (!disposed) setStores((payload as { stores: StoreMarker[] }).stores);
            })
            .catch((err) => { if (!disposed) setError(getUserFacingMessage(err, "Data toko gagal dimuat.")); });
        return () => { disposed = true; };
    }, []);

    useEffect(() => {
        if (!stores || stores.length === 0 || !mapRef.current) return;
        let disposed = false;
        const node = mapRef.current;
        loadGoogleMaps()
            .then(() => {
                const api = getGoogleMapsApi();
                if (disposed || !node || !api) return;
                const points = stores.filter((store) => store.latitude !== null && store.longitude !== null);
                if (points.length === 0) return;
                const first = { lat: points[0].latitude as number, lng: points[0].longitude as number };
                const map = new api.maps.Map(node, {
                    center: first,
                    zoom: 12,
                    fullscreenControl: true,
                    streetViewControl: false,
                    mapTypeControl: false,
                    gestureHandling: "greedy",
                    clickableIcons: false,
                });
                const bounds = api.maps.LatLngBounds ? new api.maps.LatLngBounds() : null;
                const infoWindow = api.maps.InfoWindow ? new api.maps.InfoWindow() : null;
                for (const store of points) {
                    const position = { lat: store.latitude as number, lng: store.longitude as number };
                    bounds?.extend(position);
                    if (!api.maps.Marker) continue;
                    const marker = new api.maps.Marker({ map, position, title: store.name });
                    if (infoWindow && typeof marker.addListener === "function") {
                        marker.addListener("click", () => {
                            infoWindow.setContent(
                                `<div style="font-family:inherit;min-width:180px">` +
                                `<strong>${escapeHtml(store.name)}</strong>` +
                                (store.address ? `<div style="font-size:12px;color:#555">${escapeHtml(store.address)}</div>` : "") +
                                `<div style="margin-top:6px;font-size:13px">Stok titipan: <b>${store.totalStock} pcs</b></div>` +
                                `<div style="font-size:13px">Piutang: <b>${escapeHtml(formatRupiah(store.receivable))}</b></div>` +
                                `<div style="font-size:13px">Sales: <b>${escapeHtml(store.salesName ?? "Belum ditugaskan")}</b></div>` +
                                `</div>`,
                            );
                            infoWindow.open({ map, anchor: marker });
                        });
                    }
                }
                if (bounds && points.length > 1 && typeof map.fitBounds === "function") map.fitBounds(bounds);
            })
            .catch((err) => { if (!disposed) setMapError(getUserFacingMessage(err, "Peta gagal dimuat.")); });
        return () => { disposed = true; };
    }, [stores]);

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-6xl">
                <Link href="/admin/titip-jual" className="text-sm font-bold text-[#184C3A]">← Kembali ke Titip Jual</Link>

                <header className="mt-4">
                    <h1 className="flex items-center gap-2 text-2xl font-black text-[#123d2d]"><MapIcon size={22} className="text-[#D4AF37]" /> Peta Toko Titip Jual</h1>
                    <p className="text-sm text-[#17241d]/60">Semua toko titipan dengan koordinat. Klik penanda untuk stok, piutang, dan sales.</p>
                </header>

                {error && <p className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700">{error}</p>}
                {mapError && <p className="mt-4 rounded-2xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700">{mapError}</p>}

                {!stores ? (
                    <div className="mt-6 grid min-h-40 place-items-center"><Loader2 className="animate-spin text-[#184C3A]" /></div>
                ) : stores.length === 0 ? (
                    <p className="mt-6 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 p-10 text-center text-sm font-semibold text-[#17241d]/55">
                        Belum ada toko dengan koordinat. Tambahkan latitude/longitude pada detail toko.
                    </p>
                ) : (
                    <div
                        ref={mapRef}
                        role="application"
                        aria-label="Peta semua toko titip jual"
                        className="mt-5 h-[70vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-[#ded9cc] bg-[#f0ece0] shadow-sm"
                    />
                )}
            </div>
        </main>
    );
}