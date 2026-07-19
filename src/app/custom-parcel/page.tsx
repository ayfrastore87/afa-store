"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Gift, Send } from "lucide-react";
import { formatRupiah } from "@/lib/data";

const options = [
    ["Bawang Goreng Original", 18000],
    ["Bawang Goreng Pedas", 20000],
    ["Bawang Goreng Daun Jeruk", 20000],
    ["Sambal Premium", 25000],
    ["Kerupuk", 15000],
    ["Kartu Ucapan", 5000],
    ["Pita Premium", 10000],
    ["Box Eksklusif", 35000],
] as const;

export default function CustomParcelPage() {
    const [selected, setSelected] = useState<string[]>(["Box Eksklusif", "Pita Premium"]);
    const total = useMemo(() => options.filter(([name]) => selected.includes(name)).reduce((sum, [, price]) => sum + price, 0), [selected]);
    const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "6287770000883";
    const message = `Halo AFA STORE

Saya ingin custom parcel:
${selected.map((item) => `• ${item}`).join("\n")}

Total : ${formatRupiah(total)}

Nama :
Alamat :
Catatan :`;

    return <main className="min-h-screen bg-[#fffaf0] px-4 py-10 text-[#102116]"><div className="mx-auto max-w-6xl"><Link href="/" className="text-[#14532d]">Kembali ke AFA STORE</Link><h1 className="mt-6 text-5xl font-bold text-[#14532d]">Custom Parcel Premium</h1><p className="mt-3 max-w-2xl text-lg">Pilih sendiri isi hampers, lihat preview langsung, dan checkout via WhatsApp.</p><div className="mt-10 grid gap-8 md:grid-cols-[1fr_420px]"><section className="glass rounded-[2rem] p-6"><h2 className="mb-5 text-2xl font-bold">Pilih Isi Parcel</h2><div className="grid gap-3 md:grid-cols-2">{options.map(([name, price]) => <label key={name} className="flex cursor-pointer items-center justify-between rounded-2xl border border-[#d4af37]/30 bg-white/70 p-4"><span><b>{name}</b><p>{formatRupiah(price)}</p></span><input type="checkbox" checked={selected.includes(name)} onChange={() => setSelected((items) => items.includes(name) ? items.filter((i) => i !== name) : [...items, name])} /></label>)}</div></section><aside className="glass sticky top-8 rounded-[2rem] p-6"><div className="grid h-56 place-items-center rounded-[1.5rem] bg-gradient-to-br from-[#14532d] to-[#d4af37] text-white"><Gift size={80} /><p className="text-2xl font-bold">Preview Parcel</p></div><div className="mt-5 space-y-2">{selected.map((item) => <p key={item} className="flex gap-2"><CheckCircle2 className="text-[#d4af37]" />{item}</p>)}</div><h3 className="mt-6 text-3xl font-bold">{formatRupiah(total)}</h3><a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`} className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-[#14532d] px-5 py-4 font-bold text-white"><Send /> Checkout WhatsApp</a></aside></div></div></main>;
}