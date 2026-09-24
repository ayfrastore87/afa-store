"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getGoogleMapsApi, loadGoogleMaps } from "@/lib/google-maps-loader";
import { preferredGestureHandling } from "@/lib/map-gesture";

const MAPS_URL = "https://maps.app.goo.gl/YqgCHmL7amhsWyZD6";
// Resolved from MAPS_URL, the existing AFA STORE Google Maps location link.
const STORE_COORDINATES = { latitude: -6.0260352, longitude: 106.0569088 } as const;

type Props = { coordinates?: { latitude: number; longitude: number } | null };

function MapCanvas({ coordinates }: { fullscreen: boolean; coordinates?: Props["coordinates"] }) {
    const ref = useRef<HTMLDivElement>(null);
    const mapRef = useRef<GoogleMapsMap | null>(null);
    useEffect(() => {
        let disposed = false;
        loadGoogleMaps().then(() => {
            if (disposed || !ref.current) return;
            const api = getGoogleMapsApi();
            if (!api) return;
            if (!coordinates) return;
            const center = { lat: coordinates.latitude, lng: coordinates.longitude };
            const map = new api.maps.Map(ref.current, {
                center, zoom: 16, fullscreenControl: false, streetViewControl: false,
                mapTypeControl: false, gestureHandling: preferredGestureHandling(window), clickableIcons: false,
            });
            mapRef.current = map;
            if (api.maps.Marker) new api.maps.Marker({ map, position: center, title: "AFA STORE • Cilegon, Banten" });
        }).catch(() => undefined);
        return () => { disposed = true; mapRef.current = null; };
    }, [coordinates]);
    return <div ref={ref} role="application" aria-label="Peta lokasi AFA STORE" className="absolute inset-0" />;
}

export default function FooterLocationMap({ coordinates = STORE_COORDINATES }: Props) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);
    return <>
        <button type="button" onClick={() => setOpen(true)} aria-label="Lihat lokasi AFA STORE" className="relative mx-auto block h-[125px] w-[min(100%,150px)] max-w-full shrink-0 overflow-hidden rounded-xl border border-[rgba(212,175,55,.32)] bg-[#0E2118] text-left sm:mx-0 sm:h-[135px] sm:w-[160px]">
            <MapCanvas coordinates={coordinates} fullscreen={false} />
            <span className="sr-only">Lihat lokasi AFA STORE</span>
        </button>
        {open ? <div role="dialog" aria-modal="true" aria-label="Lokasi AFA STORE" className="fixed inset-0 z-[100] min-h-screen h-[100dvh] w-screen bg-[#07150F]">
            <MapCanvas coordinates={coordinates} fullscreen />
            <button type="button" onClick={() => setOpen(false)} aria-label="Tutup peta" className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-[rgba(212,175,55,.30)] bg-[rgba(14,33,24,.85)] text-[#F2EDE3]"><X size={16} /></button>
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" aria-label="Buka lokasi AFA STORE di Google Maps" className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[rgba(212,175,55,.35)] bg-[rgba(14,33,24,.92)] px-4 py-2 text-xs font-semibold text-[#F2EDE3]">Buka di Google Maps ↗</a>
        </div> : null}
    </>;
}