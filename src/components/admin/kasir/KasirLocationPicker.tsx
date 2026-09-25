"use client";

// ---------------------------------------------------------------------------
// Kasir (POS) delivery location picker.
//
// It REUSES the customer checkout picker instead of building a second map:
//   - `CheckoutLocationSearch`  : official Google Places (New) autocomplete widget
//   - `CheckoutLocationMap`     : Google Maps with the SAME center-pin architecture and
//                                 the SAME gesture policy (coarse pointer -> cooperative,
//                                 fine pointer -> greedy, wheel/pinch zoom, +/- buttons)
//
// Rules preserved from the checkout:
//   * the pin NEVER moves — the cashier pans the map underneath it,
//   * panning/zooming only updates the DRAFT center: no reverse geocoding happens here,
//   * a search suggestion only MOVES the draft center (it is not a confirmation),
//   * nothing is confirmed until the cashier presses "GUNAKAN LOKASI INI".
// ---------------------------------------------------------------------------

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, LocateFixed } from "lucide-react";

import type { DeliveryCoordinates } from "@/lib/coordinates";
import { CheckoutLocationMap, type CheckoutMapStatus } from "@/components/checkout/location-map";
import { CheckoutLocationSearch } from "@/components/checkout/location-search";
import type { LocationSearchResult } from "@/lib/geocoding-normalize";

// Existing AFA/Kasir regression fixtures identify the store area in Cilegon.
// Keep the fallback local to that known project location; never fall back to Jakarta.
const DEFAULT_MAP_CENTER: DeliveryCoordinates = { latitude: -6.0021, longitude: 106.012345678 };
const DEFAULT_MAP_ZOOM = 16;
const CONFIRMED_MAP_ZOOM = 17;

type Props = {
    open: boolean;
    /** Already confirmed pin (numbers, so the parent may re-render freely). */
    initialLatitude: number | null;
    initialLongitude: number | null;
    onCancel: () => void;
    onConfirm: (coords: DeliveryCoordinates) => void;
};

export default function KasirLocationPicker({
    open,
    initialLatitude,
    initialLongitude,
    onCancel,
    onConfirm,
}: Props) {
    const [center, setCenter] = useState<DeliveryCoordinates>(DEFAULT_MAP_CENTER);
    const [zoom, setZoom] = useState(DEFAULT_MAP_ZOOM);
    const [mapStatus, setMapStatus] = useState<CheckoutMapStatus>("loading");
    const [interacting, setInteracting] = useState(false);
    const [settled, setSettled] = useState(true);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [geoState, setGeoState] = useState<"idle" | "locating">("idle");
    const [message, setMessage] = useState("");

    // Re-center on every open: the confirmed pin wins, otherwise the default center.
    // Missing coordinates are NEVER fabricated from address text.
    useEffect(() => {
        if (!open || typeof document === "undefined") return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (typeof initialLatitude === "number" && typeof initialLongitude === "number") {
            setCenter({ latitude: initialLatitude, longitude: initialLongitude });
            setZoom(CONFIRMED_MAP_ZOOM);
        } else {
            setCenter(DEFAULT_MAP_CENTER);
            setZoom(DEFAULT_MAP_ZOOM);
        }
        setMessage("");
        setGeoState("idle");
        setInteracting(false);
        setSettled(true);
        return () => {
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        };
    }, [open, initialLatitude, initialLongitude]);

    if (!open) return null;

    const handleInteractionStart = () => {
        setInteracting(true);
        setSettled(false);
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };

    const handleInteractionEnd = () => {
        setInteracting(false);
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(() => setSettled(true), 600);
    };

    // A suggestion only navigates the DRAFT center — it never confirms a location.
    const handleSearchSelect = (result: LocationSearchResult) => {
        setCenter({ latitude: result.latitude, longitude: result.longitude });
        setZoom(DEFAULT_MAP_ZOOM);
        setMessage("");
    };

    const useMyLocation = () => {
        if (!("geolocation" in navigator)) {
            setMessage("Perangkat ini tidak mendukung lokasi. Geser peta secara manual.");
            return;
        }
        setGeoState("locating");
        setMessage("Mencari lokasi perangkat...");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setGeoState("idle");
                setCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude });
                setZoom(CONFIRMED_MAP_ZOOM);
                setMessage("");
            },
            () => {
                setGeoState("idle");
                setMessage("Lokasi perangkat tidak dapat diambil. Geser peta secara manual.");
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#F8F5EE]" style={{ minHeight: "100vh" }} role="dialog" aria-modal="true" aria-label="Pilih lokasi pengiriman">
            <div className="shrink-0 border-b border-[#184D47]/10 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={onCancel} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#184D47]/15 text-[#184D47]" aria-label="Kembali">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C9A45B]">Alamat Pengiriman</p>
                        <h2 className="truncate text-lg font-black text-[#184D47]">Pilih Lokasi Pengiriman</h2>
                         <p className="text-xs font-semibold text-[#184D47]/60">Geser peta atau cari alamat untuk menentukan titik pengiriman.</p>
                    </div>
                </div>
                <div className="mt-3 space-y-2">
                    <CheckoutLocationSearch onSelect={handleSearchSelect} placeholder="Cari jalan, tempat, atau patokan" />
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={useMyLocation}
                            disabled={geoState === "locating"}
                            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#184D47]/20 bg-white px-3 text-xs font-bold text-[#184D47] transition hover:bg-[#EAF1ED] disabled:opacity-50"
                        >
                            {geoState === "locating" ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
                            Gunakan Lokasi Perangkat
                        </button>
                        <p className="text-[11px] font-semibold text-[#184D47]/60">
                            {mapStatus === "ready"
                                ? interacting
                                    ? "Geser peta, pin tetap di tengah."
                                    : settled
                                        ? "Geser peta untuk memindahkan titik pengiriman."
                                        : "Menyesuaikan titik..."
                                : mapStatus === "unconfigured"
                                    ? "Peta belum aktif. Gunakan pencarian alamat."
                                    : mapStatus === "unavailable"
                                        ? "Peta gagal dimuat. Gunakan pencarian alamat."
                                        : "Memuat peta..."}
                        </p>
                    </div>
                    {message ? <p className="text-xs font-semibold text-[#8B6B3F]">{message}</p> : null}
                </div>
            </div>



                <div className="relative min-h-0 flex-1">
                <CheckoutLocationMap
                        center={center}
                        zoom={zoom}
                        onCenterChange={setCenter}
                        onZoomChange={setZoom}
                        onInteractionStart={handleInteractionStart}
                        onInteractionEnd={handleInteractionEnd}
                        onStateChange={setMapStatus}
                        fullscreen
                    />
                </div>

                <div className="flex flex-col gap-2 border-t border-[#184D47]/10 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold text-[#184D47]/60">
                        Pastikan pin tepat di titik pengiriman, lalu tekan tombol di samping.
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="min-h-12 flex-1 rounded-2xl border border-[#184D47]/15 px-4 font-bold text-[#184D47] transition hover:bg-[#184D47]/5 sm:flex-none"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={() => onConfirm(center)}
                            className="min-h-12 flex-1 rounded-2xl bg-[#184D47] px-5 font-black text-white shadow-lg shadow-[#184D47]/20 transition hover:brightness-110 active:scale-95 sm:flex-none"
                        >
                            GUNAKAN LOKASI INI
                        </button>
                    </div>
            </div>
        </div>,
        document.body,
    );
}
