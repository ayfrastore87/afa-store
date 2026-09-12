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

// Distance between two coordinates (Haversine) in metres. Used to skip sending
// tiny GPS drift that hasn't actually moved the device meaningfully.
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
    const rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLng = (bLng - aLng) * rad;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// Optional live location sharing. The partner must press "Mulai Bagikan Lokasi"
// AND the browser must grant permission. No tracking before consent; nothing
// starts on mount. We use watchPosition for continuous updates but throttle
// server writes to ~1 / 15s and skip writes when the device hasn't moved
// meaningfully. clearWatch on stop. This is a web app, so live sharing only
// works while this page stays open and the browser keeps geolocation alive.
export function PartnerLocationTab() {
    const [location, setLocation] = useState<Location | null>(null);
    const [loading, setLoading] = useState(true);
    const [sharing, setSharing] = useState(false);
    const [starting, setStarting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const watchIdRef = useRef<number | null>(null);
    const lastSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
    const sendingRef = useRef(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/partner/location", { headers: { Accept: "application/json" } });
            const payload = (await response.json().catch(() => null)) as { location?: Location | null; message?: string } | null;
            if (!response.ok) throw new Error(payload?.message || "Lokasi gagal dimuat.");
            setLocation(payload?.location ?? null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Lokasi gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

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

    const sendLocation = useCallback(async (latitude: number, longitude: number, accuracy: number | null) => {
        if (sendingRef.current) return;
        sendingRef.current = true;
        try {
            const response = await fetch("/api/partner/location", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ latitude, longitude, accuracy, consent: true }),
            });
            const payload = (await response.json().catch(() => null)) as { location?: Location; message?: string } | null;
            if (!response.ok) throw new Error(payload?.message || "Lokasi gagal diperbarui.");
            const saved = payload?.location ?? null;
            setLocation(saved);
            setMessage(payload?.message || "Lokasi berhasil diperbarui.");
        } catch (err) {
            // Concise id-ID message, never a stack trace. Keep sharing active so a
            // transient network hiccup recovers on the next throttle tick.
            setError(err instanceof Error ? err.message : "Lokasi belum dapat diperbarui. Periksa koneksi internet.");
            setMessage("");
        } finally {
            sendingRef.current = false;
        }
    }, []);

    const stopSharing = useCallback(() => {
        if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        lastSentRef.current = null;
        setSharing(false);
        setStarting(false);
        setMessage("");
        // The last stored location stays; stopping never deletes it.
    }, []);

    const throttleAndSend = useCallback(
        (position: GeolocationPosition) => {
            const { latitude, longitude, accuracy } = position.coords;
            const last = lastSentRef.current;
            const now = Date.now();
            const accuracyNorm = accuracy != null && Number.isFinite(accuracy) ? accuracy : null;

            if (!last) {
                lastSentRef.current = { at: now, lat: latitude, lng: longitude };
                void sendLocation(latitude, longitude, accuracyNorm);
                return;
            }
            const elapsed = now - last.at;
            const moved = distanceMeters(last.lat, last.lng, latitude, longitude);
            // ≥15s AND moved ≥5m before writing, to avoid hammering the server with
            // every tiny GPS callback (which can be many per second).
            if (elapsed < 15000 || moved < 5) return;
            lastSentRef.current = { at: now, lat: latitude, lng: longitude };
            void sendLocation(latitude, longitude, accuracyNorm);
        },
        [sendLocation]
    );

    const startSharing = useCallback(() => {
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
        setMessage("");

        const onError = (err: GeolocationPositionError) => {
            setStarting(false);
            setSharing(false);
            setError(gpsErrorToMessage(err));
        };

        watchIdRef.current = navigator.geolocation.watchPosition((position) => {
            setStarting(false);
            setSharing(true);
            throttleAndSend(position);
        }, onError, {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 15000,
        });
    }, [gpsErrorToMessage, throttleAndSend]);

    // Cleanup watch on unmount.
    useEffect(() => {
        return () => {
            if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, []);

    const hasLocation = location != null;
    const liveStatus = hasLocation ? getLocationLiveStatus(location.recordedAt) : "OFFLINE";

    return (
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MapPin size={18} className="text-[#184D47]" />
                    <h2 className="text-lg font-black text-[#184D47]">Lokasi Usaha</h2>
                </div>

                {sharing ? (
                    <button
                        type="button"
                        onClick={stopSharing}
                        className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#8c2e25] px-4 text-sm font-bold text-white transition hover:bg-[#6f241d] active:scale-95"
                    >
                        <Square size={16} /> Berhenti Bagikan Lokasi
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={startSharing}
                        disabled={starting}
                        className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#184D47] px-4 text-sm font-bold text-white transition hover:bg-[#123a36] active:scale-95 disabled:opacity-60"
                    >
                        {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        Mulai Bagikan Lokasi
                    </button>
                )}
            </div>

            <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${sharing ? "bg-[#e8f3e3] text-[#29621a]" : "bg-[#f0ede4] text-[#69736d]"}`}>
                    <Radio size={12} className={sharing ? "animate-pulse" : ""} />
                    {sharing ? "Lokasi Sedang Dibagikan" : liveStatus === "LIVE" ? "Lokasi Baru Saja Diperbarui" : "Tidak Aktif"}
                </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[#184D47]/60">
                Live Location aktif selama halaman tetap berjalan dan izin lokasi tersedia. Lokasi hanya dikirim setelah
                Anda menekan tombol di atas dan browser memberikan izin. Tidak ada pelacakan diam-diam — Anda dapat
                menghentikan kapan saja.
            </p>

            {message ? (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#e8f3e3] px-3 py-2 text-sm font-bold text-[#29621a]">
                    <CheckCircle2 size={16} /> {message}
                </p>
            ) : null}
            {error ? (
                <p className="mt-3 rounded-xl bg-[#f7e9e6] px-3 py-2 text-sm font-bold text-[#8c2e25]">{error}</p>
            ) : null}

            <div className="mt-4">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm font-semibold text-[#69736d]">
                        <Loader2 size={18} className="animate-spin" /> Memuat lokasi...
                    </div>
                ) : !hasLocation ? (
                    <p className="py-6 text-center text-sm font-semibold text-[#69736d]">Belum ada lokasi tersimpan.</p>
                ) : (
                    <dl className="grid gap-3 sm:grid-cols-2">
                        <Field label="Terakhir Diperbarui" value={formatWib(location.recordedAt)} />
                        <Field
                            label="Akurasi"
                            value={
                                location.accuracy != null
                                    ? `±${Math.round(location.accuracy)} m · ${ACCURACY_QUALITY_LABELS[getAccuracyQuality(location.accuracy)]}`
                                    : "-"
                            }
                        />
                        <Field label="Latitude" value={String(location.latitude)} />
                        <Field label="Longitude" value={String(location.longitude)} />
                    </dl>
                )}
            </div>
        </section>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-[#f7f4ec] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-[#123d2d]">{value}</p>
        </div>
    );
}
