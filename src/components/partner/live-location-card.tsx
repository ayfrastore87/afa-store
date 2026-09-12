"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MapPin, Play, Radio, Square } from "lucide-react";

import { ACCURACY_QUALITY_LABELS, getAccuracyQuality, getLocationLiveStatus } from "@/lib/location-status";

type Location = {
    id: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    source: string;
    consent: boolean;
    recordedAt: string;
};

// Reusable live-location card for the partner summary dashboard (Tahap XVII).
// Same privacy model as the Lokasi tab: nothing starts on mount; sharing only
// begins after an explicit "Mulai Bagikan Lokasi" press + browser permission.
// watchPosition is throttled to ~1 write / 15s and skips sub-5m GPS drift.
export function PartnerLiveLocationCard() {
    const [location, setLocation] = useState<Location | null>(null);
    const [sharing, setSharing] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const watchIdRef = useRef<number | null>(null);
    const lastSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
    const sendingRef = useRef(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/partner/location", { headers: { Accept: "application/json" } });
            const payload = (await res.json().catch(() => null)) as { location?: Location | null } | null;
            setLocation(payload?.location ?? null);
        } catch {
            // Silent — the card still renders its idle state on failure.
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const send = useCallback(async (latitude: number, longitude: number, accuracy: number | null) => {
        if (sendingRef.current) return;
        sendingRef.current = true;
        try {
            const res = await fetch("/api/partner/location", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ latitude, longitude, accuracy, consent: true }),
            });
            const payload = (await res.json().catch(() => null)) as { location?: Location; message?: string } | null;
            if (!res.ok) throw new Error(payload?.message || "Gagal memperbarui lokasi.");
            setLocation(payload?.location ?? null);
            setNotice(payload?.message || "Lokasi berhasil diperbarui.");
            setError("");
        } catch (err) {
            setNotice("");
            setError(err instanceof Error ? err.message : "Lokasi belum dapat diperbarui. Periksa koneksi internet.");
        } finally {
            sendingRef.current = false;
        }
    }, []);

    const gpsErrorToMessage = useCallback((err: GeolocationPositionError) => {
        switch (err.code) {
            case err.PERMISSION_DENIED:
                return "Izin lokasi belum diberikan. Aktifkan izin lokasi di browser Anda.";
            case err.POSITION_UNAVAILABLE:
                return "GPS/lokasi perangkat tidak tersedia. Pastikan GPS aktif.";
            case err.TIMEOUT:
                return "Pengambilan lokasi terlalu lama. Periksa GPS lalu coba lagi.";
            default:
                return "Gagal mengambil lokasi. Silakan coba lagi.";
        }
    }, []);

    const stop = useCallback(() => {
        if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        lastSentRef.current = null;
        setSharing(false);
        setStarting(false);
        setNotice("");
    }, []);

    const start = useCallback(() => {
        if (!("geolocation" in navigator)) {
            setError("Perangkat/browser ini tidak mendukung geolocation.");
            return;
        }
        if (typeof window !== "undefined" && window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
            setError("Live Location memerlukan HTTPS agar browser mengizinkan GPS.");
            return;
        }
        setStarting(true);
        setError("");
        setNotice("");

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                setStarting(false);
                setSharing(true);
                const { latitude, longitude, accuracy } = position.coords;
                const accuracyNorm = accuracy != null && Number.isFinite(accuracy) ? accuracy : null;
                const now = Date.now();
                const last = lastSentRef.current;

                if (!last) {
                    lastSentRef.current = { at: now, lat: latitude, lng: longitude };
                    void send(latitude, longitude, accuracyNorm);
                    return;
                }
                const elapsed = now - last.at;
                if (elapsed < 15000 || Math.abs(last.lat - latitude) + Math.abs(last.lng - longitude) < 0.00005) return;
                lastSentRef.current = { at: now, lat: latitude, lng: longitude };
                void send(latitude, longitude, accuracyNorm);
            },
            (err) => {
                setStarting(false);
                setSharing(false);
                setError(gpsErrorToMessage(err));
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
        );
    }, [gpsErrorToMessage, send]);

    useEffect(() => {
        return () => {
            if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, []);

    const isLive = location ? getLocationLiveStatus(location.recordedAt) === "LIVE" : false;
    return (
        <section className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MapPin size={18} className="text-[#184D47]" />
                    <h2 className="text-lg font-black text-[#184D47]">Live Location</h2>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${sharing && isLive ? "bg-[#e8f3e3] text-[#29621a]" : "bg-[#f0ede4] text-[#69736d]"}`}>
                    <Radio size={12} className={sharing && isLive ? "animate-pulse" : ""} />
                    {sharing && isLive ? "Lokasi Aktif" : "Tidak Aktif"}
                </span>
            </div>

            {!sharing ? (
                <p className="mt-2 text-xs leading-relaxed text-[#184D47]/60">
                    Bagikan lokasi agar admin dapat memantau lokasi operasional saat diperlukan.
                </p>
            ) : (
                <p className="mt-2 text-xs leading-relaxed text-[#184D47]/60">
                    Live Location aktif selama halaman tetap berjalan dan izin lokasi tersedia.
                </p>
            )}

            {sharing ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field
                        label="Akurasi"
                        value={
                            location?.accuracy != null
                                ? `±${Math.round(location.accuracy)} m · ${ACCURACY_QUALITY_LABELS[getAccuracyQuality(location.accuracy)]}`
                                : "-"
                        }
                    />
                    <Field label="Update Terakhir" value={location ? "baru saja" : "-"} />
                </dl>
            ) : location ? (
                <p className="mt-3 text-xs text-[#184D47]/60">
                    Lokasi terakhir disimpan pada{" "}
                    {new Date(location.recordedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                </p>
            ) : null}

            {notice ? (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#e8f3e3] px-3 py-2 text-sm font-bold text-[#29621a]">
                    <CheckCircle2 size={16} /> {notice}
                </p>
            ) : null}
            {error ? (
                <p className="mt-3 rounded-xl bg-[#f7e9e6] px-3 py-2 text-sm font-bold text-[#8c2e25]">{error}</p>
            ) : null}

            <div className="mt-4">
                {sharing ? (
                    <button
                        type="button"
                        onClick={stop}
                        className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#8c2e25] px-4 text-sm font-bold text-white transition hover:bg-[#6f241d] active:scale-95"
                    >
                        <Square size={16} /> Berhenti Bagikan Lokasi
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={start}
                        disabled={starting}
                        className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#184D47] px-4 text-sm font-bold text-white transition hover:bg-[#123a36] active:scale-95 disabled:opacity-60"
                    >
                        {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        Mulai Bagikan Lokasi
                    </button>
                )}
            </div>
        </section>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-[#f7f4ec] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-[#184D47]">{value}</p>
        </div>
    );
}

