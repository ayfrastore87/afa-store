"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

type Banner = { id: string; title: string; subtitle: string; image: string | null; ctaLabel: string | null; ctaUrl: string | null };

function validImageSource(src: string | null) {
  if (!src?.trim()) return false;
  if (src.startsWith("/")) return true;
  try {
    const url = new URL(src);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function HomePromoBanners({ banners }: { banners: Banner[] }) {
  const banner = banners.find((item) => validImageSource(item.image));
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [banner?.image]);
  const showImage = Boolean(banner?.image) && !imageFailed;
  return <section className="mx-auto max-w-[1400px] px-5 py-4 sm:px-8 lg:px-12"><article className="relative min-h-[190px] overflow-hidden rounded-2xl bg-[#073126] p-6 text-[#F8F5EE] sm:min-h-[210px] sm:p-8"><div className={`relative z-10 ${showImage ? "max-w-[58%]" : "max-w-2xl"}`}><p className="text-xs font-bold uppercase tracking-[.2em] text-[#D4AF37]">{banner?.title ?? "Hampers"}</p><h3 className="mt-1 font-display text-3xl font-bold leading-tight">{banner?.subtitle ?? "Untuk Setiap Momen"}</h3><p className="mt-2 text-sm text-white/75">Pilihan spesial untuk orang tersayang.</p><Link href={banner?.ctaUrl || "/produk"} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#C9A45B] px-4 py-2 text-sm font-bold text-[#123524]">{banner?.ctaLabel || "Lihat Produk"} <ArrowRight size={16} /></Link></div>{showImage && <Image src={banner!.image!} alt={banner!.title} fill sizes="(min-width: 768px) 70vw, 100vw" onError={() => setImageFailed(true)} className="object-contain object-right" />}</article></section>;
}