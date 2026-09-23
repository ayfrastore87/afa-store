"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";

function safeImageSource(src: string | null) {
    if (!src?.trim()) return null;
    if (src.startsWith("/")) return src;
    try {
        const url = new URL(src);
        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

export default function ProductImage({ src, alt, priority = false, sizes, imgClassName = "p-5 sm:p-8" }: { src: string | null; alt: string; priority?: boolean; sizes: string; imgClassName?: string }) {
    const [imageSrc, setImageSrc] = useState(() => safeImageSource(src));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setImageSrc(safeImageSource(src));
        setLoading(true);
    }, [src]);

    if (!imageSrc) return <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-xs text-[var(--muted)]"><ImageIcon size={24} aria-hidden="true" /><span>Foto belum tersedia</span></div>;
    return <div className="relative h-full w-full"><div aria-hidden="true" className={`night-image-loading-veil absolute inset-0 bg-[linear-gradient(110deg,rgba(201,164,91,0.08),rgba(248,245,238,0.8),rgba(201,164,91,0.08))] transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} /><Image src={imageSrc} alt={alt} fill sizes={sizes} priority={priority} onLoad={() => setLoading(false)} onError={() => { setImageSrc(null); setLoading(false); }} className={`object-contain transition-opacity duration-300 ${imgClassName} ${loading ? "opacity-0" : "opacity-100"}`} /></div>;
}