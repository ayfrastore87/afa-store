"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProductDetailClose() {
    const router = useRouter();

    const close = () => {
        if (window.history.length > 1) router.back();
        else router.replace("/produk");
    };

    return <button type="button" onClick={close} aria-label="Tutup detail produk" className="product-detail-close grid h-10 w-10 shrink-0 place-items-center rounded-full border border-transparent bg-transparent text-[#8B6B3F] transition duration-200 hover:border-[rgba(212,175,55,0.30)] hover:bg-[rgba(212,175,55,0.06)] hover:text-[#C9A45B]"><X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></button>;
}