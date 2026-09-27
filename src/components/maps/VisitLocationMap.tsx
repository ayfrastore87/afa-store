"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { getGoogleMapsApi, loadGoogleMaps } from "@/lib/google-maps-loader";

type Props = {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    capturedAt?: string | Date | null;
    className?: string;
};

export function VisitLocationMap({ latitude, longitude, accuracy, capturedAt, className = "" }: Props) {
    const mapRef = useRef<HTMLDivElement | null>(null);
    const [failed, setFailed] = useState(false);
    const position = { lat: latitude, lng: longitude };
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

    useEffect(() => {
        let disposed = false;
        loadGoogleMaps()
            .then(() => {
                const api = getGoogleMapsApi();
                if (disposed || !mapRef.current || !api?.maps?.Map) return;
                const map = new api.maps.Map(mapRef.current, {
                    center: position,
                    zoom: 16,
                    fullscreenControl: false,
                    streetViewControl: false,
                    mapTypeControl: false,
                    clickableIcons: false,
                    gestureHandling: "cooperative",
                });
                if (api.maps.Marker) new api.maps.Marker({ map, position, title: "Lokasi kunjungan" });
            })
            .catch(() => { if (!disposed) setFailed(true); });
        return () => { disposed = true; };
    }, [latitude, longitude]);

    return (
        <div className={className}>
            <div className="mt-3 overflow-hidden rounded-xl bg-[#f0ece0]">
                {failed ? <p className="grid min-h-44 place-items-center p-4 text-sm font-semibold text-[#17241d]/60">Peta tidak dapat dimuat.</p> : <div ref={mapRef} className="h-44 w-full" aria-label="Peta lokasi kunjungan" />}
            </div>
            <p className="mt-3 text-sm">Koordinat: {latitude.toFixed(6)}, {longitude.toFixed(6)}</p>
            <p className="text-sm">Akurasi: {accuracy == null ? "-" : `±${Math.round(accuracy)} m`}</p>
            <p className="text-xs text-[#17241d]/60">Direkam: {capturedAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(capturedAt)) : "-"}</p>
            <a className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-[#184D47]" href={mapsUrl} target="_blank" rel="noreferrer"><MapPin size={14} /> Buka di Google Maps</a>
        </div>
    );
}