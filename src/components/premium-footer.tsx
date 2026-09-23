"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, CircleHelp, Facebook, Globe, Heart, Instagram, MapPin, MessageCircle, Music2, Youtube } from "lucide-react";
import AdminButton from "@/components/AdminButton";

const faqItems = ["Tanpa tepung?", "Lama tahan?", "Bisa COD?", "Kirim seluruh Indonesia?", "Custom parcel?"];
const socials = [Instagram, Facebook, Music2, Youtube];

export default function PremiumFooter() {
  const [open, setOpen] = useState<number | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);
  return <footer id="kontak" className="premium-footer relative mt-6 overflow-hidden text-[#F2EDE3]"><div className="section-shell relative z-10 px-4 py-7 sm:px-8 lg:px-12">
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.15fr] lg:gap-8">
      <div><Image src="/AFA LOGO.svg" alt="AFA STORE" width={120} height={120} className="h-14 w-auto object-contain" /><p className="mt-1 text-[10px] font-semibold tracking-[.18em] text-[#D4AF37]">Dari Kami</p><p className="mt-1.5 text-sm text-[#D8D2C5]">Untuk Keluarga <Heart size={13} className="ml-1 inline text-[#D4AF37]" aria-hidden="true" /></p><div className="mt-3 flex gap-2">{socials.map((Icon, index) => <span key={index} aria-label="Media sosial AFA STORE" className="grid h-8 w-8 place-items-center rounded-full border border-[rgba(212,175,55,.4)] text-[#F2EDE3] transition hover:border-[#D4AF37] hover:text-[#D4AF37]"><Icon size={14} /></span>)}</div></div>
      <div><h2 className="text-[13px] font-bold uppercase tracking-[.12em] text-[#D4AF37]">Hubungi Kami</h2><div className="mt-2.5 space-y-1.5 text-[13px] leading-[1.45] text-[#D8D2C5]"><p className="flex gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-[#D4AF37]" /><span>Kel. Tamansari<br />Kec. Pulomerak<br />Kota Cilegon</span></p><a href="https://wa.me/6287770000883" target="_blank" rel="noopener noreferrer" className="flex gap-2 hover:text-[#D4AF37]"><MessageCircle size={15} className="mt-0.5 shrink-0 text-[#25D366]" /><span>WhatsApp<br />0877 7000 0883</span></a><p className="flex gap-2"><Globe size={15} className="mt-0.5 shrink-0 text-[#D4AF37]" /><span>afastore.online</span></p></div></div>
      <div id="faq"><button type="button" aria-expanded={faqOpen} aria-controls="premium-faq-panel" onClick={() => setFaqOpen((value) => !value)} className="flex min-h-[50px] w-full items-center justify-between border-t border-[rgba(212,175,55,.2)] text-left lg:border-t-0"><span className="flex items-center gap-2 text-[13px] font-bold"><CircleHelp size={16} className="text-[#D4AF37]" /> FAQ <span className="font-normal text-[#AAA394]">Pertanyaan yang sering ditanyakan</span></span><ChevronDown size={16} className={`text-[#D4AF37] transition-transform ${faqOpen ? "rotate-180" : ""}`} /></button><div id="premium-faq-panel" aria-hidden={!faqOpen} className={`overflow-hidden transition-all duration-200 ${faqOpen ? "mt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"}`}><div className="grid gap-1.5 sm:grid-cols-2">{faqItems.map((question, index) => <div key={question} className="border border-[rgba(212,175,55,.2)] px-3"><button type="button" className="flex w-full items-center justify-between py-2 text-left text-xs text-[#D8D2C5]" onClick={() => setOpen(open === index ? null : index)}>{question}<ChevronDown size={13} className={open === index ? "rotate-180 text-[#D4AF37]" : "text-[#AAA394]"} /></button>{open === index && <p className="pb-2 text-xs text-[#AAA394]">Ya, tim AFA STORE siap membantu kebutuhan Anda dengan kualitas premium.</p>}</div>)}</div></div></div>
    </div>
    <div className="mt-5 flex min-h-[46px] flex-col justify-center gap-1.5 border-t border-[rgba(212,175,55,.2)] pt-3 text-xs text-[#AAA394] sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:pt-0"><span>© 2026 AFA Store. All rights reserved.</span><Link href="/mitra" className="text-[#D8D2C5] hover:text-[#D4AF37]">Mitra AFA Store</Link><AdminButton /></div>
  </div></footer>;
}