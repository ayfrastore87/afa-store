"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Map as MapIcon } from "lucide-react";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import { getGoogleMapsApi, loadGoogleMaps } from "@/lib/google-maps-loader";

type Store = { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null; salesName: string | null; salesId: string | null; totalStock: number; photoUrl: string | null; visited: boolean; lastVisitAt: string | null };
type MappedStore = Store & { latitude: number; longitude: number };
type Filter = "all" | "sales" | "visited" | "unvisited" | "stock" | "empty";
const esc = (value: string) => value.replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] ?? c));
const valid = (s: Store): s is MappedStore => s.latitude !== null && s.longitude !== null && Number.isFinite(s.latitude) && Number.isFinite(s.longitude) && Math.abs(s.latitude) <= 90 && Math.abs(s.longitude) <= 180;

export function ConsignmentStoreMap() {
    const [stores, setStores] = useState<Store[] | null>(null);
    const [filter, setFilter] = useState<Filter>("all");
    const [sales, setSales] = useState("");
    const [error, setError] = useState("");
    const mapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let disposed = false;
        fetch("/api/admin/consignment/stores", { cache: "no-store" }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.message); if (!disposed) setStores(p.stores); }).catch(e => { if (!disposed) setError(getUserFacingMessage(e, "Data toko gagal dimuat.")); });
        return () => { disposed = true; };
    }, []);
    const filtered = useMemo(() => (stores ?? []).filter(s => filter === "sales" ? s.salesId === sales : filter === "visited" ? s.visited : filter === "unvisited" ? !s.visited : filter === "stock" ? s.totalStock > 0 : filter === "empty" ? s.totalStock === 0 : true), [stores, filter, sales]);
    useEffect(() => {
        const points = filtered.filter(valid);
        if (!points.length || !mapRef.current) return;
        let disposed = false;
        const node = mapRef.current;
        loadGoogleMaps().then(() => {
            const api = getGoogleMapsApi();
            if (disposed || !api) return;
            const map = new api.maps.Map(node, { center: { lat: points[0].latitude, lng: points[0].longitude }, zoom: 12 });
            const bounds = api.maps.LatLngBounds ? new api.maps.LatLngBounds() : null;
            const info = api.maps.InfoWindow ? new api.maps.InfoWindow() : null;
            points.forEach(s => {
                const position = { lat: s.latitude, lng: s.longitude };
                bounds?.extend(position);
                if (!api.maps.Marker) return;
                const marker = new api.maps.Marker({ map, position, title: s.name });
                if (typeof marker.addListener !== "function") return;
                marker.addListener("click", () => {
                    if (!info) return;
                    const last = s.lastVisitAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(s.lastVisitAt)) : "Belum pernah";
                    info.setContent(`<div style="min-width:220px"><strong>${esc(s.name)}</strong><div>${esc(s.address ?? "Alamat belum diisi")}</div><div>Sales: ${esc(s.salesName ?? "Belum ditugaskan")}</div><div>${s.visited ? "Sudah dikunjungi" : "Belum dikunjungi"}</div><div>Kunjungan terakhir: ${esc(last)}</div><div>Status stok: ${s.totalStock > 0 ? `${s.totalStock} pcs` : "Stok kosong"}</div>${s.photoUrl?.startsWith("https://") ? `<img src="${esc(s.photoUrl)}" alt="Foto toko" style="width:100%;height:90px;object-fit:cover"/>` : ""}<div><a href="https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}" target="_blank" rel="noreferrer">Buka Google Maps</a> · <a href="/admin/titip-jual/toko/${encodeURIComponent(s.id)}">Detail Toko</a></div></div>`);
                    info.open({ map, anchor: marker });
                });
            });
            if (bounds && points.length > 1 && typeof map.fitBounds === "function") map.fitBounds(bounds);
        }).catch(e => { if (!disposed) setError(getUserFacingMessage(e, "Peta gagal dimuat.")); });
        return () => { disposed = true; };
    }, [filtered]);
    const mapped = stores?.filter(valid).length ?? 0;
    const missing = stores?.filter(s => !valid(s)) ?? [];
    const summaries = [["Total Toko", stores?.length ?? 0], ["Terpetakan", mapped], ["Belum Ada Lokasi", missing.length], ["Sudah Dikunjungi", stores?.filter(s => s.visited).length ?? 0], ["Belum Dikunjungi", stores?.filter(s => !s.visited).length ?? 0], ["Toko Dengan Stok", stores?.filter(s => s.totalStock > 0).length ?? 0]] as const;
    return <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]"><div className="mx-auto max-w-6xl"><Link href="/admin/titip-jual" className="font-bold text-[#184C3A]">← Kembali</Link><h1 className="mt-4 flex items-center gap-2 text-2xl font-black"><MapIcon /> Peta Sebaran Toko</h1>{error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}<div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-6">{summaries.map(([label, value]) => <div key={label} className="rounded-xl bg-white p-3"><p className="text-xs opacity-60">{label}</p><b>{value}</b></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><select value={filter} onChange={e => setFilter(e.target.value as Filter)} className="rounded-xl border bg-white p-3"><option value="all">Semua</option><option value="sales">Sales</option><option value="visited">Sudah Dikunjungi</option><option value="unvisited">Belum Dikunjungi</option><option value="stock">Ada Stok</option><option value="empty">Stok Kosong</option></select>{filter === "sales" && <select value={sales} onChange={e => setSales(e.target.value)} className="rounded-xl border bg-white p-3"><option value="">Pilih Sales</option>{Array.from(new Map((stores ?? []).filter(s => s.salesId).map(s => [s.salesId!, s.salesName])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}</div>{!stores ? <Loader2 className="mt-8 animate-spin" /> : <><div ref={mapRef} className="mt-4 h-[65vh] min-h-[420px] rounded-2xl bg-[#eee9dc]" role="application" aria-label="Peta sebaran toko" />{filtered.filter(valid).length === 0 && <p className="mt-2 text-sm">Tidak ada toko terpetakan untuk filter ini.</p>}<section className="mt-5 rounded-2xl bg-white p-4"><h2 className="font-black">Toko Belum Memiliki Titik Lokasi ({missing.length})</h2><ul className="mt-2 list-disc pl-5 text-sm">{missing.map(s => <li key={s.id}>{s.name} · {s.salesName ?? "Belum ditugaskan"}</li>)}</ul></section></>}</div></main>;
}