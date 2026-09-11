"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MapPin, RefreshCw } from "lucide-react";

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

// Privacy-first location snapshot. GPS is only requested inside the explicit
// "Gunakan Lokasi Saya" handler — never on mount, focus, scroll, or a timer.
export function PartnerLocationTab() {
    const [location, setLocation] = useState<Location | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

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
                return "Lokasi tidak diperbarui karena izin lokasi ditolak.";
            case err.POSITION_UNAVAILABLE:
                return "Lokasi tidak tersedia. Pastikan GPS/perangkat aktif.";
            case err.TIMEOUT:
                return "Pengambilan lokasi terlalu lama. Silakan coba lagi.";
            default:
                return "Gagal mengambil lokasi. Silakan coba lagi.";
        }
    }, []);

    const save = useCallback(
        async (coords: { latitude: number; longitude: number; accuracy: number | null }) => {
            setSaving(true);
            setMessage("");
            setError("");
            try {
                const response = await fetch("/api/partner/location", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        accuracy: coords.accuracy,
                        consent: true,
                    }),
                });
                const payload = (await response.json().catch(() => null)) as { location?: Location; message?: string } | null;
                if (!response.ok) throw new Error(payload?.message || "Lokasi gagal diperbarui.");
                setLocation(payload?.location ?? null);
                setMessage(payload?.message || "Lokasi berhasil diperbarui.");
            } catch (err) {
                setError(err instanceof Error ? err.message : "Lokasi gagal diperbarui.");
            } finally {
                setSaving(false);
            }
        },
        []
    );

    const handleUpdate = useCallback(() => {
        if (!("geolocation" in navigator)) {
            setError("Perangkat tidak mendukung pengambilan lokasi.");
            return;
        }
        setSaving(true);
        setMessage("");
        setError("");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                void save({
                    latitude,
                    longitude,
                    accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
                });
            },
            (err) => {
                setSaving(false);
                setError(gpsErrorToMessage(err));
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }, [gpsErrorToMessage, save]);

    const hasLocation = location != null;

    return (
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MapPin size={18} className="text-[#184D47]" />
                    <h2 className="text-lg font-black text-[#184D47]">Lokasi Usaha</h2>
                </div>
                <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={saving}
                    className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#184D47] px-4 text-sm font-bold text-white transition hover:bg-[#123a36] active:scale-95 disabled:opacity-60"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {hasLocation ? "Perbarui Lokasi" : "Gunakan Lokasi Saya"}
                </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[#184D47]/60">
                Lokasi Anda akan digunakan untuk membantu AFA STORE mengetahui lokasi Mitra. Lokasi tidak dipantau
                terus-menerus — lokasi hanya diambil sekali ketika Anda menekan tombol di atas.
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
                        <Field label="Akurasi" value={location.accuracy != null ? `±${Math.round(location.accuracy)} meter` : "-"} />
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
