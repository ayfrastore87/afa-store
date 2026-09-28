"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, CircleHelp, Facebook, Globe, Handshake, Heart, Instagram, Mail, MapPin, MessageCircle, Music2, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AdminButton from "@/components/AdminButton";
import FooterLocationMap from "@/components/footer/FooterLocationMap";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef } from "react";

type FooterSettings = {
  logo: string;
  footerLogo: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  address: string;
  maps: string;
  /** Store contact e-mail — shown as a mailto link when non-empty. */
  email: string;
};

function useFooterSettings(): FooterSettings {
  const defaults: FooterSettings = {
    logo: "", footerLogo: "", whatsapp: "6287770000883",
    instagram: "https://www.instagram.com/afa_store_c6/",
    facebook: "https://www.facebook.com/AFAstoreC6",
    tiktok: "https://www.tiktok.com/@afa_store_c6",
    address: "", maps: "", email: "",
  };
  const [settings, setSettings] = useState<FooterSettings>(defaults);
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    void supabase
      .from("settings")
      .select("key,value")
      .in("key", ["logo", "footerLogo", "whatsapp", "instagram", "facebook", "tiktok", "address", "maps", "email"])
      .then(({ data }) => {
        if (!data) return;
        const patch: Partial<FooterSettings> = {};
        for (const row of data) {
          const raw =
            typeof row.value === "object" && row.value && "value" in row.value
              ? (row.value as { value?: unknown }).value
              : row.value;
          if (typeof raw === "string" && raw.trim()) {
            (patch as Record<string, string>)[row.key as string] = raw;
          }
        }
        setSettings((prev) => ({ ...prev, ...patch }));
      });
  }, []);
  return settings;
}

const faqItems = ["Tanpa tepung?", "Lama tahan?", "Bisa COD?", "Kirim seluruh Indonesia?", "Custom parcel?"];
const YOUTUBE_URL = "https://www.youtube.com/channel/UCDTv7ulodlf2C4szoyXXr9g";

export default function PremiumFooter() {
  const [open, setOpen] = useState<number | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);
  const st = useFooterSettings();
  const logoSrc = st.footerLogo || st.logo || "/AFA LOGO.svg";
  const waNumber = st.whatsapp.replace(/\D/g, "") || "6287770000883";
  const waDisplay = waNumber.startsWith("62") ? `0${waNumber.slice(2)}` : waNumber;
  const waDisplay4 = waDisplay.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
  const socials: { label: string; href: string; Icon: LucideIcon }[] = [
    { label: "Facebook AFA STORE", href: st.facebook || "https://www.facebook.com/AFAstoreC6", Icon: Facebook },
    { label: "Instagram AFA STORE", href: st.instagram || "https://www.instagram.com/afa_store_c6/", Icon: Instagram },
    { label: "TikTok AFA STORE", href: st.tiktok || "https://www.tiktok.com/@afa_store_c6", Icon: Music2 },
    { label: "YouTube AFA STORE", href: YOUTUBE_URL, Icon: Youtube },
  ];
  return <footer id="kontak" className="premium-footer relative mt-6 overflow-hidden text-[#F2EDE3]"><div className="section-shell relative z-10 px-5 py-4 sm:px-8 lg:px-12">
    <div className="grid items-start gap-y-0 lg:grid-cols-[1fr_1fr_1.15fr] lg:gap-x-10 lg:gap-y-0 xl:gap-x-14">
      <div><Image src={logoSrc} alt="AFA STORE" width={120} height={120} className="h-16 w-auto object-contain lg:h-14" unoptimized={!logoSrc.startsWith("/")} /><p className="mt-1 text-[10px] font-semibold tracking-[.18em] text-[#D4AF37]">Dari Kami</p><p className="mt-0.5 text-[13px] text-[#D8D2C5] lg:mt-1 lg:text-sm">Untuk Keluarga <Heart size={13} className="ml-1 inline text-[#D4AF37]" aria-hidden="true" /></p><div className="mt-2 flex flex-nowrap gap-2">{socials.map(({ label, href, Icon }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[rgba(212,175,55,.4)] text-[#F2EDE3] transition hover:border-[#D4AF37] hover:text-[#D4AF37]"><Icon size={14} aria-hidden="true" /></a>)}</div></div>
      <div className="mt-3 border-t border-[rgba(212,175,55,.14)] pt-3 lg:mt-0 lg:border-t-0 lg:pt-0"><h2 className="text-[11px] font-bold uppercase tracking-[.12em] text-[#D4AF37] lg:text-[13px]">Hubungi Kami</h2><div className="mt-2.5 space-y-1.5 text-[12px] leading-[1.35] text-[#D8D2C5] lg:mt-2 lg:space-y-1 lg:text-[13px]"><a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="flex gap-2 hover:text-[#D4AF37]"><MessageCircle size={16} className="mt-0.5 shrink-0 text-[#25D366]" /><span>WhatsApp<br />{waDisplay4 || waDisplay}</span></a><a href="https://afastore.online" target="_blank" rel="noopener noreferrer" aria-label="Buka website AFA STORE" className="flex items-center gap-2 hover:text-[#D4AF37] hover:underline"><Globe size={15} className="shrink-0 text-[#D4AF37]" /><span>afastore.online ↗</span></a><Link href="/mitra" aria-label="Mitra AFA Store" className="flex items-center gap-2 text-[#D8D2C5] hover:text-[#D4AF37]"><Handshake size={15} className="shrink-0 text-[#D4AF37]" />Mitra AFA Store</Link>{st.email && <a href={`mailto:${st.email}`} aria-label={`Kirim email ke ${st.email}`} className="flex items-center gap-2 hover:text-[#D4AF37] break-all"><Mail size={15} className="shrink-0 text-[#D4AF37]" /><span>{st.email}</span></a>}{st.address && <address className="not-italic flex items-start gap-2 text-[#D8D2C5]"><MapPin size={15} className="mt-0.5 shrink-0 text-[#D4AF37]" /><span>{st.address}</span></address>}</div></div>
      <div id="faq" className="mt-3 border-t border-[rgba(212,175,55,.14)] pt-3 lg:mt-0 lg:border-t-0 lg:pt-0"><button type="button" aria-expanded={faqOpen} aria-controls="premium-faq-panel" onClick={() => setFaqOpen((value) => !value)} className="flex min-h-0 w-full items-center justify-between gap-2 py-2 text-left lg:py-0"><span className="flex min-w-0 items-center gap-2 text-[13px] font-bold"><CircleHelp size={16} className="shrink-0 text-[#D4AF37]" /> <span className="shrink-0">FAQ</span> <span className="truncate font-normal text-[11px] text-[#AAA394] sm:text-xs">Pertanyaan yang sering ditanyakan</span></span><ChevronDown size={16} className={`shrink-0 text-[#D4AF37] transition-transform ${faqOpen ? "rotate-180" : ""}`} /></button><div id="premium-faq-panel" aria-hidden={!faqOpen} className={`overflow-hidden transition-all duration-200 ${faqOpen ? "mt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"}`}><div className="grid gap-1.5 sm:grid-cols-2">{faqItems.map((question, index) => <div key={question} className="border border-[rgba(212,175,55,.2)] px-3"><button type="button" className="flex w-full items-center justify-between py-2 text-left text-xs text-[#D8D2C5]" onClick={() => setOpen(open === index ? null : index)}>{question}<ChevronDown size={13} className={open === index ? "rotate-180 text-[#D4AF37]" : "text-[#AAA394]"} /></button>{open === index && <p className="pb-2 text-xs text-[#AAA394]">Ya, tim AFA STORE siap membantu kebutuhan Anda dengan kualitas premium.</p>}</div>)}</div></div><div className="mt-1.5 sm:mt-2"><FooterLocationMap mapsUrl={st.maps || undefined} /></div></div>
    </div>
    <div className="mt-2 border-t border-[rgba(212,175,55,.14)] px-2 py-2 text-[10px] text-[#D8D2C5] lg:mt-3 lg:border-[rgba(212,175,55,.2)] lg:text-[11px]">
      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-center">
        <span className="footer-admin-credit [&>button]:text-[#D8D2C5] [&>button>svg]:hidden [&>button>span]:hidden [&>button]:before:content-['©_2026_AFASTORE']"><AdminButton /></span>
        <span className="opacity-40" aria-hidden="true">·</span>
        <span>Nama usaha terdaftar: <strong className="font-medium">IRMA RATNA MARYANI</strong></span>
        <span className="opacity-40" aria-hidden="true">·</span>
        <span>NIB: 2411220051724</span>
        <span className="opacity-40" aria-hidden="true">·</span>
        <Link href="/tentang-kami" className="underline underline-offset-2 decoration-[rgba(212,175,55,.4)] hover:text-[#D4AF37]">Informasi Legal</Link>
      </div>
    </div>
  </div></footer>;
}