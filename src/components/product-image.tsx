"use client";

import Image from "next/image";
import { useState } from "react";

const FALLBACK_IMAGE = "/products/parcel.png";

function safeImageSource(src: string | null) {
    if (!src?.trim()) return FALLBACK_IMAGE;
    if (src.startsWith("/")) return src;
    try {
        const url = new URL(src);
        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : FALLBACK_IMAGE;
    } catch {
        return FALLBACK_IMAGE;
    }
}

export default function ProductImage({ src, alt, priority = false, sizes }: { src: string | null; alt: string; priority?: boolean; sizes: string }) {
    const [imageSrc, setImageSrc] = useState(() => safeImageSource(src));
    const [loading, setLoading] = useState(true);

    return <div className="relative h-full w-full"><div aria-hidden="true" className={`absolute inset-0 bg-[linear-gradient(110deg,rgba(201,164,91,0.08),rgba(255,255,255,0.8),rgba(201,164,91,0.08))] transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} /><Image src={imageSrc} alt={alt} fill sizes={sizes} priority={priority} onLoad={() => setLoading(false)} onError={() => { if (imageSrc !== FALLBACK_IMAGE) { setImageSrc(FALLBACK_IMAGE); setLoading(true); } else { setLoading(false); } }} className={`object-contain p-5 transition-opacity duration-300 sm:p-8 ${loading ? "opacity-0" : "opacity-100"}`} /></div>;
}