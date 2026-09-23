"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, CircleHelp, Facebook, Handshake, Instagram, MapPin, Music2, Youtube } from "lucide-react";

const faqItems = ["Tanpa tepung?", "Lama tahan?", "Bisa COD?", "Kirim seluruh Indonesia?", "Custom parcel?"];
const faqAnswer = "Ya, tim AFA STORE siap membantu kebutuhan Anda dengan kualitas premium.";
const socials = [
  { label: "Instagram", Icon: Instagram },
  { label: "Facebook", Icon: Facebook },
  { label: "TikTok", Icon: Music2 },
  { label: "YouTube", Icon: Youtube },
];

export default function PremiumFooter() {
  const [open, setOpen] = useState<number | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);

  return (
    <footer id="kontak" className="premium-footer relative mt-12 overflow-hidden text-[#F8F5EE]">
      <span aria-hidden="true" className="premium-footer-orb premium-footer-orb-left" />
      <span aria-hidden="true" className="premium-footer-orb premium-footer-orb-right" />
      <span aria-hidden="true" className="premium-footer-curve" />
      <div className="premium-footer-content section-shell relative z-10 grid gap-10 px-4 py-12 sm:px-8 md:grid-cols-2 md:gap-x-12 md:gap-y-10 md:py-14 lg:grid-cols-[1fr_1.05fr_1fr] lg:gap-12 lg:px-12 lg:py-14 xl:px-16">
        <div className="premium-footer-contact min-w-0">
          <Image src="/AFA LOGO.svg" alt="AFA STORE" width={120} height={120} className="h-[72px] w-auto object-contain sm:h-[82px]" />
          <p className="mt-3 text-[10px] tracking-[.16em] text-[rgba(248,245,238,.65)]">BELANJA MUDAH, HIDUP LEBIH HANGAT</p>
          <div className="mt-5 h-px w-[110px] bg-gradient-to-r from-[#D4AF37] to-[rgba(212,175,55,.08)]" />
          <div className="mt-5 space-y-3 text-[13px]">
            <p className="flex items-start gap-2.5"><MapPin size={16} className="mt-0.5 shrink-0 text-[#D4AF37]" /><span><span className="block text-[#F8F5EE]">Cilegon, Banten</span><span className="text-[#A7B0A8]">Indonesia</span></span></p>
            <a href="https://wa.me/6287770000883" target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 transition hover:text-[#D4AF37]"><span aria-hidden="true" className="mt-0.5 text-[#25D366]">◉</span><span><b className="block text-[#F8F5EE]">WhatsApp</b><span className="text-[#A7B0A8]">0877 7000 0883 · Chat dengan kami</span></span></a>
          </div>
          <div className="mt-6 flex gap-2.5">{socials.map(({ label, Icon }) => <span key={label} title={`${label} belum dikonfigurasi`} aria-label={`${label} belum dikonfigurasi`} className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(212,175,55,.45)] text-[#F8F5EE] transition hover:-translate-y-0.5 hover:border-[#D4AF37] hover:bg-[rgba(212,175,55,.06)] hover:text-[#D4AF37]"><Icon size={16} /></span>)}</div>
        </div>
        <div className="premium-footer-message flex flex-col items-center justify-center px-2 text-center md:col-span-2 lg:col-span-1">
          <div aria-hidden="true" className="flex items-center gap-3 text-[#D4AF37]"><span className="h-px w-10 bg-[rgba(212,175,55,.20)]" /><span className="inline-block h-2.5 w-2.5 rotate-45 border border-[#D4AF37]" /><span className="h-px w-10 bg-[rgba(212,175,55,.20)]" /></div>
          <div className="mt-5 font-display text-[clamp(32px,3vw,46px)] font-semibold italic leading-[1.05]"><span className="block text-[#D4AF37]">Dari Kami</span><span className="block text-[#F8F5EE]">untuk Keluarga</span></div>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-6 h-4 w-4 fill-none stroke-[#D4AF37]" strokeWidth="1.5"><path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.3 4.3 0 0 1 12 6.7a4.3 4.3 0 0 1 8.8 2.1Z" /></svg>
          <p className="mt-4 max-w-[220px] text-xs leading-[1.5] text-[rgba(248,245,238,.55)]">Lebih dari sekadar produk, ini tentang kebersamaan.</p>
        </div>
        <div className="premium-footer-faq-column min-w-0 md:col-span-1 lg:col-span-1">
          <button type="button" aria-expanded={faqOpen} aria-controls="premium-faq-panel" onClick={() => setFaqOpen((current) => !current)} className="flex w-full items-center justify-between border-0 bg-transparent py-2 text-left text-[15px] font-bold text-[#F8F5EE]"><span className="flex items-center gap-2"><CircleHelp size={16} className="text-[#D4AF37]" /> FAQ</span><ChevronDown size={15} className={`text-[#D4AF37] transition-transform duration-200 ease-in-out ${faqOpen ? "rotate-180" : ""}`} /></button>
          <p className="text-[11px] text-[#A7B0A8]">Pertanyaan yang sering ditanyakan</p>
          <div id="premium-faq-panel" aria-hidden={!faqOpen} className={`overflow-hidden transition-[max-height,opacity,transform] duration-200 ease-in-out ${faqOpen ? "mt-4 max-h-[440px] translate-y-0 opacity-100" : "pointer-events-none max-h-0 -translate-y-1 opacity-0"}`}><div className="space-y-1.5">{faqItems.map((question, index) => { const itemOpen = open === index; return <div key={question} className="rounded-[10px] border border-[rgba(212,175,55,.22)] bg-[rgba(7,31,23,.35)]"><button type="button" aria-expanded={itemOpen} aria-controls={`premium-faq-${index}`} onClick={() => setOpen(itemOpen ? null : index)} className="flex min-h-[42px] w-full items-center justify-between px-3 py-2 text-left text-[13px] font-semibold text-[#F8F5EE]"><span>{question}</span><span aria-hidden="true" className="ml-3 text-base font-normal text-[#D4AF37]">{itemOpen ? "−" : "+"}</span></button><div id={`premium-faq-${index}`} aria-hidden={!itemOpen} className={`overflow-hidden px-3 text-xs leading-[1.5] text-[#A7B0A8] transition-[max-height,opacity,transform,padding] duration-200 ease-in-out ${itemOpen ? "max-h-24 translate-y-0 pb-2.5 opacity-100" : "max-h-0 -translate-y-1 pb-0 opacity-0"}`}>{faqAnswer}</div></div>; })}</div></div>
        </div>
      </div>
      <div className="premium-footer-legal section-shell relative z-10 flex flex-col gap-2 border-t border-[rgba(212,175,55,.24)] px-4 py-3.5 text-[11px] text-[#A7B0A8] sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12 xl:px-16"><span>© {new Date().getFullYear()} AFA STORE. All rights reserved.</span><span className="flex gap-2"><span>Kebijakan Privasi</span><span>|</span><span>Syarat &amp; Ketentuan</span></span><Link href="/mitra" className="group inline-flex items-center gap-2 py-1 text-[#F8F5EE] transition hover:text-[#D4AF37]"><Handshake size={16} className="text-[#D4AF37]" /><span><b className="block text-[12px]">MITRA AFA_store <span className="text-[#D4AF37]">→</span></b><small className="block text-[9px] text-[#A7B0A8]">Bersama tumbuh lebih besar</small></span></Link></div>
    </footer>
  );
}