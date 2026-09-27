"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Map as MapIcon, MapPin, Package, Users } from "lucide-react";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import { getGoogleMapsApi, loadGoogleMaps } from "@/lib/google-maps-loader";

type Store = { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null; salesName: string | null; salesId: string | null; totalStock: number; photoUrl: string | null; visited: boolean; lastVisitAt: string | null };
type MappedStore = Store & { latitude: number; longitude: number };
type Filter = "all" | "sales" | "stock" | "empty";
const esc = (value: string) => value.replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] ?? c));
const valid = (s: Store): s is MappedStore => s.latitude !== null && s.longitude !== null && Number.isFinite(s.latitude) && Number.isFinite(s.longitude) && Math.abs(s.latitude) <= 90 && Math.abs(s.longitude) <= 180;

export function ConsignmentStoreMap() {
    const [stores, setStores] = useState<Store[] | null>(null);
    const [filter, setFilter] = useState<Filter>("all");
    const [sales, setSales] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [salesCount, setSalesCount] = useState(0);
    const mapInstanceRef = useRef<GoogleMapsMap | null>(null);
    const markersRef = useRef<Map<string, GoogleMapsMarker>>(new Map());
    const apiInfoRef = useRef<GoogleMapsInfoWindow | null>(null);
    const [error, setError] = useState("");
    const mapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let disposed = false;
        Promise.all([
            fetch("/api/admin/consignment/stores", { cache: "no-store" }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.message); return p.stores; }),
            fetch("/api/admin/consignment/salespeople", { cache: "no-store" }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.message); return p.salespeople; }),
        ]).then(([nextStores, nextSales]) => { if (!disposed) { setStores(nextStores); setSalesCount(nextSales.length); } }).catch(e => { if (!disposed) setError(getUserFacingMessage(e, "Data peta gagal dimuat.")); });
        return () => { disposed = true; };
    }, []);
    const filtered = useMemo(() => (stores ?? []).filter(s => filter === "sales" ? s.salesId === sales : filter === "stock" ? s.totalStock > 0 : filter === "empty" ? s.totalStock === 0 : true), [stores, filter, sales]);
    useEffect(() => {
        const points = filtered.filter(valid);
        if (!points.length || !mapRef.current) return;
        let disposed = false;
        const node = mapRef.current;
        loadGoogleMaps().then(() => {
            const api = getGoogleMapsApi();
            if (disposed || !api) return;
            const map = new api.maps.Map(node, { center: { lat: points[0].latitude, lng: points[0].longitude }, zoom: 12, gestureHandling: "cooperative", clickableIcons: false });
            mapInstanceRef.current = map;
            const bounds = api.maps.LatLngBounds ? new api.maps.LatLngBounds() : null;
            const info = api.maps.InfoWindow ? new api.maps.InfoWindow() : null;
            apiInfoRef.current = info;
            points.forEach(s => {
                const position = { lat: s.latitude, lng: s.longitude };
                bounds?.extend(position);
                if (!api.maps.Marker) return;
                const marker = new api.maps.Marker({ map, position, title: s.name });
                markersRef.current.set(s.id, marker);
                if (typeof marker.addListener !== "function") return;
                marker.addListener("click", () => {
                    if (!info) return;
                    const last = s.lastVisitAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(s.lastVisitAt)) : "Belum pernah";
                    setSelectedId(s.id);
                    info.setContent(`<div style="min-width:220px"><strong>${esc(s.salesName ?? "Sales belum ditugaskan")}</strong><div>${esc(s.name)}</div><div>${esc(s.address ?? "Alamat belum diisi")}</div><div>Stok titipan: ${s.totalStock} pcs</div><div>Kunjungan terakhir: ${esc(last)}</div><div style="margin-top:8px"><a href="https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}" target="_blank" rel="noreferrer">Buka di Google Maps</a> · <a href="/admin/titip-jual/toko/${encodeURIComponent(s.id)}">Lihat Detail</a></div></div>`);
                    info.open({ map, anchor: marker });
                });
            });
            if (bounds && points.length > 1 && typeof map.fitBounds === "function") map.fitBounds(bounds);
        }).catch(e => { if (!disposed) setError(getUserFacingMessage(e, "Peta gagal dimuat.")); });
        return () => { disposed = true; };
    }, [filtered]);
    const mapped = stores?.filter(valid).length ?? 0;
    const missing = stores?.filter(s => !valid(s)) ?? [];
    const totalStock = stores?.reduce((sum, s) => sum + s.totalStock, 0) ?? 0;
    const summaries = [["Total Sales", salesCount, Users], ["Total Titik Jual", stores?.length ?? 0, MapPin], ["Total Stok Titipan", totalStock, Package], ["Stok Habis", stores?.filter(s => s.totalStock === 0).length ?? 0, Package]] as const;
    const focus = (store: Store) => { if (!valid(store)) return; const map = mapInstanceRef.current; setSelectedId(store.id); map?.setCenter({ lat: store.latitude, lng: store.longitude }); map?.setZoom(16); const marker = markersRef.current.get(store.id); if (marker && map) apiInfoRef.current?.open({ map, anchor: marker }); };
    return <main className="min-h-screen overflow-x-hidden bg-[#f7f4ec] px-4 py-8 text-[#17241d]"><div className="mx-auto max-w-7xl"><Link href="/admin/titip-jual" className="font-bold text-[#184C3A]">← Kembali</Link><h1 className="mt-4 flex items-center gap-2 text-2xl font-black"><MapIcon className="text-[#D4AF37]" /> Peta Sebaran Sales & Titip Jual</h1>{error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}<div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{summaries.map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm"><Icon size={18} className="text-[#D4AF37]" /><p className="mt-2 text-xs opacity-60">{label}</p><b className="text-xl text-[#184C3A]">{value}</b></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><select value={filter} onChange={e => { setFilter(e.target.value as Filter); if (e.target.value !== "sales") setSales(""); }} className="rounded-xl border border-[#ded9cc] bg-white p-3"><option value="all">Semua Status</option><option value="sales">Sales tertentu</option><option value="stock">Ada Stok</option><option value="empty">Stok Habis</option></select>{filter === "sales" && <select value={sales} onChange={e => setSales(e.target.value)} className="rounded-xl border border-[#ded9cc] bg-white p-3"><option value="">Pilih Sales</option>{Array.from(new Map((stores ?? []).filter(s => s.salesId).map(s => [s.salesId!, s.salesName])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}</div>{!stores ? <Loader2 className="mt-8 animate-spin" /> : <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]"><div ref={mapRef} className="h-[60vh] min-h-[420px] w-full rounded-2xl bg-[#eee9dc]" role="application" aria-label="Peta sebaran sales" /><section className="max-h-[60vh] overflow-y-auto rounded-2xl border border-[#ded9cc] bg-white p-4"><h2 className="font-black">Titik Jual ({filtered.filter(valid).length})</h2><div className="mt-3 space-y-2">{filtered.filter(valid).map(s => <button type="button" key={s.id} onClick={() => focus(s)} className={`w-full rounded-xl border p-3 text-left ${selectedId === s.id ? "border-[#D4AF37] bg-[#fff8df]" : "border-[#f0ece0]"}`}><b className="block text-[#184C3A]">{s.name}</b><span className="text-xs">{s.salesName ?? "Sales belum ditugaskan"} · {s.totalStock} pcs</span><span className="block truncate text-xs opacity-60">{s.address ?? "Alamat belum diisi"}</span></button>)}</div></section></div>}{missing.length > 0 && <section className="mt-5 rounded-2xl bg-white p-4"><h2 className="font-black">Titik tanpa koordinat GPS ({missing.length})</h2><p className="mt-1 text-sm opacity-70">Lokasi ini tidak diberi marker sampai koordinat dipilih dan disimpan.</p></section>}</div></main>;
}