"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, LocateFixed, MapPin, X } from "lucide-react";

import { LATITUDE_MAX, LATITUDE_MIN, LONGITUDE_MAX, LONGITUDE_MIN, normalizeLatitude, normalizeLongitude, type DeliveryCoordinates } from "@/lib/coordinates";

const DEFAULT_ZOOM = 15;

function lonToTileX(lon: number, zoom: number) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number) {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom));
}

function formatCoordinate(value: number, isLat: boolean) {
    const hemi = isLat ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
    return `${Math.abs(value).toFixed(6)}° ${hemi}`;
}

/**
 * Delivery-point picker (metadata only). Uses the browser Geolocation API when
 * the user opts in, or manual lat/lng entry. A lightweight OpenStreetMap tile
 * (no API key, same pattern as the partner MiniMap) renders a thumbnail with a
 * marker. Coordinates are NOT used for shipping price and NEVER replace the
 * Biteship destinationAreaId.
 */
export function CheckoutLocationPicker({ value, onChange }: { value: DeliveryCoordinates | null; onChange: (value: DeliveryCoordinates | null) => void }) {
    const [latText, setLatText] = useState("");
    const [lngText, setLngText] = useState("");
    const [locating, setLocating] = useState(false);
    const [message, setMessage] = useState("");
    const [editing, setEditing] = useState(false);
    const lastSentRef = useRef<{ lat: number; lng: number } | null>(null);

    useEffect(() => {
        if (editing) {
            setLatText(value ? String(value.latitude) : "");
            setLngText(value ? String(value.longitude) : "");
        }
    }, [editing, value]);

    const useMyLocation = () => {
        setMessage("");
        if (!("geolocation" in navigator)) {
            setMessage("Perangkat/browser ini tidak mendukung lokasi. Isi koordinat secara manual.");
            setEditing(true);
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                lastSentRef.current = { lat: latitude, lng: longitude };
                setLatText(String(latitude));
                setLngText(String(longitude));
                setLocating(false);
            },
            (err) => {
                setLocating(false);
                switch (err.code) {
                    case err.PERMISSION_DENIED:
                        setMessage("Izin lokasi belum diberikan. Aktifkan izin lokasi di browser atau isi koordinat manual.");
                        break;
                    case err.POSITION_UNAVAILABLE:
                        setMessage("GPS/lokasi perangkat tidak tersedia. Isi koordinat secara manual.");
                        break;
                    case err.TIMEOUT:
                        setMessage("Pengambilan lokasi terlalu lama. Coba lagi atau isi koordinat manual.");
                        break;
                    default:
                        setMessage("Gagal mengambil lokasi. Isi koordinat secara manual.");
                }
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
        );
    };

    const saveManual = () => {
        const lat = normalizeLatitude(latText.trim());
        const lng = normalizeLongitude(lngText.trim());
        if (lat === null || lng === null) {
            setMessage(`Koordinat tidak valid. Latitude ${LATITUDE_MIN}..${LATITUDE_MAX}, longitude ${LONGITUDE_MIN}..${LONGITUDE_MAX}.`);
            return;
        }
        onChange({ latitude: lat, longitude: lng });
        setMessage("");
        setEditing(false);
    };

    const clear = () => {
        onChange(null);
        setLatText("");
        setLngText("");
        setEditing(false);
        setMessage("");
    };

    const openExternal = (lat: number, lng: number) =>
        `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${DEFAULT_ZOOM}/${lat}/${lng}`;

    if (!value) {
        return (
            <div className="space-y-3">
                {!editing ? (
                    <>
                        <p className="text-sm text-[#6D6558]">Tambahkan titik lokasi (opsional) agar kurir lebih mudah menemukan alamat. Tidak memengaruhi ongkir.</p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={useMyLocation} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#184D47] px-4 text-sm font-bold text-[#184D47] hover:bg-[#EAF1ED]">
                                {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />} Gunakan Lokasi Saya
                            </button>
                            <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#C9A45B]/40 px-4 text-sm font-bold text-[#6D6558] hover:bg-[#F0E7D8]">
                                <MapPin size={16} /> Pilih Titik Lokasi
                            </button>
                        </div>
                        {message && <p className="text-sm text-[#8B6B3F]">{message}</p>}
                    </>
                ) : (
                    <div className="space-y-3 rounded-xl border border-[#C9A45B]/30 bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">Koordinat lokasi</p>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="grid gap-1 text-sm font-semibold text-[#123524]">
                                <span>Latitude ({LATITUDE_MIN}..{LATITUDE_MAX})</span>
                                <input value={latText} onChange={(e) => setLatText(e.target.value)} inputMode="decimal" placeholder="Contoh: -6.200000" className="min-h-11 rounded-xl border border-[#C9A45B]/30 bg-white px-3 font-normal" />
                            </label>
                            <label className="grid gap-1 text-sm font-semibold text-[#123524]">
                                <span>Longitude ({LONGITUDE_MIN}..{LONGITUDE_MAX})</span>
                                <input value={lngText} onChange={(e) => setLngText(e.target.value)} inputMode="decimal" placeholder="Contoh: 106.816666" className="min-h-11 rounded-xl border border-[#C9A45B]/30 bg-white px-3 font-normal" />
                            </label>
                        </div>
                        {message && <p className="text-sm text-[#8B6B3F]">{message}</p>}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={useMyLocation} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#184D47] px-4 text-sm font-bold text-[#184D47] hover:bg-[#EAF1ED]">
                                {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />} Gunakan Lokasi Saya
                            </button>
                            <button type="button" onClick={saveManual} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#123524] px-4 text-sm font-bold text-white hover:bg-[#184D47]">
                                <Check size={16} /> Simpan Titik
                            </button>
                            <button type="button" onClick={() => setEditing(false)} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-[#6D6558] hover:bg-[#F0E7D8]">
                                Batal
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const tile = `https://tile.openstreetmap.org/${DEFAULT_ZOOM}/${lonToTileX(value.longitude, DEFAULT_ZOOM)}/${latToTileY(value.latitude, DEFAULT_ZOOM)}.png`;

    return (
        <div className="space-y-3">
            <div className="relative h-44 w-full overflow-hidden rounded-xl bg-[#e7e4da]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tile} alt={`Peta lokasi ${value.latitude}, ${value.longitude}`} className="h-full w-full object-cover" draggable={false} />
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#D4AF37] text-[#184C3A] shadow-md">
                        <MapPin size={14} />
                    </span>
                </div>
            </div>
            <div className="rounded-xl bg-[#f7f4ec] p-3">
                <p className="text-sm font-bold text-[#123524]">📍 Lokasi yang dipilih</p>
                <p className="mt-1 text-xs text-[#6D6558]">Lat {formatCoordinate(value.latitude, true)} · Lng {formatCoordinate(value.longitude, false)}</p>
                <a href={openExternal(value.latitude, value.longitude)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#184D47] hover:underline">
                    Buka di peta <ExternalLink size={12} />
                </a>
            </div>
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setEditing(true); setMessage(""); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#184D47] px-4 text-sm font-bold text-[#184D47] hover:bg-[#EAF1ED]">
                    Ubah Lokasi
                </button>
                <button type="button" onClick={clear} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-200 px-4 text-sm font-bold text-red-700 hover:bg-red-50">
                    <X size={16} /> Hapus Titik
                </button>
            </div>
        </div>
    );
}
