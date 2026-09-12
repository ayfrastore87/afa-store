"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, LocateFixed, MapPin, Navigation } from "lucide-react";

import { partnerStatusLabels, partnerTypeLabels } from "@/lib/partner";
import { ACCURACY_QUALITY_LABELS, getAccuracyQuality, getLocationLiveStatus, relativeTimeAgo } from "@/lib/location-status";

type Location = {
    id: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    source: string;
    consent: boolean;
    recordedAt: string;
};

type Response = {
    partner: { id: string; partnerCode: string; name: string; partnerType: string; status: string };
    location: Location | null;
};

type Props = {
    partnerId: string;
    partnerName: string;
    partnerCode: string;
    partnerStatus: string;
};

const wib = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
});

function formatWib(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : `${wib.format(date)} WIB`;
}

// Poll cadence (ms). ~15s matches the live-window definition so the admin
// marker drifts with fresh partner updates without a full page reload.
const POLL_INTERVAL_MS = 15000;
const DEFAULT_ZOOM = 16;
// Radius (px) of the accuracy circle drawn relative to the marker.
const ACCURACY_CIRCLE_RADIUS_PX = 48;

export function PartnerLocationPanel({ partnerId, partnerName, partnerCode, partnerStatus }: Props) {
    const [data, setData] = useState<Response | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [now, setNow] = useState(() => Date.now());

    const location = data?.location ?? null;

    const load = useCallback(async () => {
        setError("");
        try {
            const response = await fetch(`/api/admin/partners/${partnerId}/location`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            const payload = (await response.json().catch(() => null)) as (Response & { message?: string }) | null;
            if (!response.ok) throw new Error(payload?.message || "Lokasi mitra gagal dimuat.");
            setData(payload as Response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Lokasi mitra gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [partnerId]);

    useEffect(() => {
        void load();
        const id = setInterval(() => {
            void load();
        }, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [load]);

    // Refresh relative-time labels so "x detik lalu" stays accurate.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 2000);
        return () => clearInterval(id);
    }, []);

    const liveStatus = location ? getLocationLiveStatus(location.recordedAt, now) : "OFFLINE";
    const lastTimeAgo = location ? relativeTimeAgo(location.recordedAt, now) : "-";
    const googleMapsUrl = location
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`
        : null;

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/mitra" className="text-sm font-bold text-[#184C3A]">← Kembali ke Mitra</Link>
                <header className="mt-4 mb-6 flex flex-wrap items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                        <MapPin size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-2xl font-black text-[#123d2d]">Lokasi {partnerName}</h1>
                        <p className="text-sm text-[#69736d]">
                            {partnerCode} · <span className="font-bold">{partnerStatusLabels[partnerStatus] || partnerStatus}</span>
                        </p>
                    </div>
                    {location ? <StatusBadge live={liveStatus === "LIVE"} /> : null}
                </header>

                {loading && !data ? (
                    <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat lokasi mitra..." />
                ) : error ? (
                    <State icon={<MapPin size={28} />} text={error} />
                ) : !location ? (
                    <State icon={<MapPin size={28} />} text="Mitra belum menyimpan lokasi." />
                ) : (
                    <section className="grid gap-4 lg:grid-cols-2">
                        <div className="overflow-hidden rounded-2xl border border-[#ded9cc] bg-white p-3 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <h2 className="text-lg font-black text-[#123d2d]">Peta Live</h2>
                                {googleMapsUrl ? (
                                    <a
                                        href={googleMapsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#184C3A] px-3 py-2 text-xs font-bold text-white hover:bg-[#123a36]"
                                    >
                                        <ExternalLink size={14} /> Buka di Google Maps
                                    </a>
                                ) : null}
                            </div>

                            <MiniMap latitude={location.latitude} longitude={location.longitude} accuracy={location.accuracy} />

                            <div className="mt-3 flex items-center justify-between gap-2">
                                <a
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#184C3A] px-3 py-2 text-xs font-bold text-[#184C3A] hover:bg-[#184C3A] hover:text-white"
                                >
                                    <Navigation size={14} /> Navigasi
                                </a>
                                <p className="text-[10px] text-[#858a86]">Peta © OpenStreetMap</p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                            <h2 className="mb-4 text-lg font-black text-[#123d2d]">Info Lokasi</h2>
                            <dl className="grid gap-3 sm:grid-cols-2">
                                <Field label="Status" value={liveStatus === "LIVE" ? "● Live" : "○ Offline"} />
                                <Field label="Terakhir Update" value={lastTimeAgo} />
                                <Field label="Nama Mitra" value={location ? data?.partner.name ?? "-" : "-"} />
                                <Field label="Jenis Mitra" value={location ? partnerTypeLabels[data?.partner.partnerType ?? ""] || (data?.partner.partnerType ?? "-") : "-"} />
                                <Field label="Latitude" value={String(location.latitude)} />
                                <Field label="Longitude" value={String(location.longitude)} />
                                <Field
                                    label="Akurasi"
                                    value={
                                        location.accuracy != null
                                            ? `±${Math.round(location.accuracy)} m · ${ACCURACY_QUALITY_LABELS[getAccuracyQuality(location.accuracy)]}`
                                            : "-"
                                    }
                                />
                                <Field label="Terakhir Diperbarui" value={formatWib(location.recordedAt)} />
                            </dl>
                            <p className="mt-4 text-[10px] leading-relaxed text-[#858a86]">
                                Status Live dihitung dari waktu update terakhir. Lokasi dianggap Live bila diperbarui dalam 60 detik
                                terakhir; setelah itu tampil Offline/&quot;terakhir terlihat&quot;. Diperbarui otomatis tiap ±15 detik.
                            </p>
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}

function StatusBadge({ live }: { live: boolean }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-black ${live ? "bg-[#e8f3e3] text-[#29621a]" : "bg-[#f0ede4] text-[#69736d]"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${live ? "animate-pulse bg-[#2fa24a]" : "bg-[#9aa09b]"}`} />
            {live ? "LIVE" : "OFFLINE"}
        </span>
    );
}

// Lightweight OSM map without a map SDK. Uses the public tile server directly so
// no API key is needed, and overlays a marker + accuracy ring via absolute CSS.
// The tile is inherently centered on the marker coordinate; a "Pusatkan Lokasi"
// button resets zoom back to the default without being touched by polling.
function MiniMap({ latitude, longitude, accuracy }: { latitude: number; longitude: number; accuracy: number | null }) {
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [recenterKey, setRecentKey] = useState(0);

    const tile = `https://tile.openstreetmap.org/${zoom}/${lonToTileX(longitude, zoom)}/${latToTileY(latitude, zoom)}.png`;

    return (
        <div className="relative">
            <div className="relative h-64 w-full overflow-hidden rounded-xl bg-[#e7e4da] sm:h-72">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={tile}
                    alt={`Peta lokasi ${latitude}, ${longitude}`}
                    className="h-full w-full object-cover"
                    draggable={false}
                />
                <div
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    title={`${latitude}, ${longitude}`}
                >
                    {accuracy != null && Number.isFinite(accuracy) && accuracy > 0 ? (
                        <span
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2fa24a]/40 bg-[#2fa24a]/15"
                            style={{ width: ACCURACY_CIRCLE_RADIUS_PX * 2, height: ACCURACY_CIRCLE_RADIUS_PX * 2 }}
                        />
                    ) : null}
                    <span className="relative grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#D4AF37] text-[#184C3A] shadow-md">
                        <MapPin size={14} />
                    </span>
                </div>
            </div>

            <button
                key={recenterKey}
                type="button"
                onClick={() => {
                    setZoom(DEFAULT_ZOOM);
                    setRecentKey((n) => n + 1);
                }}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-xl border border-[#ded9cc] bg-white/95 px-2.5 py-1.5 text-xs font-bold text-[#184C3A] shadow-sm hover:bg-white"
            >
                <LocateFixed size={14} /> Pusatkan Lokasi
            </button>
        </div>
    );
}

function lonToTileX(lon: number, zoom: number) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number) {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom));
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-[#f7f4ec] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-[#123d2d]">{value}</p>
        </div>
    );
}

function State({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 px-4 py-12 text-center">
            <span className="text-[#D4AF37]">{icon}</span>
            <p className="text-sm font-semibold text-[#69736d]">{text}</p>
        </div>
    );
}
