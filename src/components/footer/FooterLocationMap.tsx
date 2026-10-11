"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const MAPS_URL = "https://maps.app.goo.gl/YqgCHmL7amhsWyZD6";
const MAP_EMBED_SRC = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3967.6505435656736!2d106.06298317409379!3d-6.0425941593192976!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e418d005ae6f539%3A0xd7f1035299205348!2sAFA_store!5e0!3m2!1sid!2sid!4v1791703607405!5m2!1sid!2sid";

type Props = { mapsUrl?: string };

function MapEmbed() {
    return <iframe
        src={MAP_EMBED_SRC}
        title="Lokasi AFA STORE Cilegon"
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
    />;
}

export default function FooterLocationMap({ mapsUrl }: Props) {
    const resolvedMapsUrl = mapsUrl || MAPS_URL;
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);
    return <>
        <button type="button" onClick={() => setOpen(true)} aria-label="Lihat lokasi AFA STORE" className="relative mx-auto block h-[125px] w-[min(100%,150px)] max-w-full shrink-0 overflow-hidden rounded-xl border border-[rgba(212,175,55,.32)] bg-[#0E2118] text-left sm:mx-0 sm:h-[135px] sm:w-[160px]">
            <MapEmbed />
            <span className="sr-only">Lihat lokasi AFA STORE</span>
        </button>
        {open ? <div role="dialog" aria-modal="true" aria-label="Lokasi AFA STORE" className="fixed inset-0 z-[100] min-h-screen h-[100dvh] w-screen bg-[#07150F]">
            <MapEmbed />
            <button type="button" onClick={() => setOpen(false)} aria-label="Tutup peta" className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-[rgba(212,175,55,.30)] bg-[rgba(14,33,24,.85)] text-[#F2EDE3]"><X size={16} /></button>
            <a href={resolvedMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Buka lokasi AFA STORE di Google Maps" className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[rgba(212,175,55,.35)] bg-[rgba(14,33,24,.92)] px-4 py-2 text-xs font-semibold text-[#F2EDE3]">Buka di Google Maps ↗</a>
        </div> : null}
    </>;
}