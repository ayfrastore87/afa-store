"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Gift, Send } from "lucide-react";
import { formatRupiah } from "@/lib/products";
import { fetchParcelPackages, type ParcelPackage } from "@/lib/parcels";

export default function CustomParcelPage() {
    const [options, setOptions] = useState<ParcelPackage[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => { fetchParcelPackages().then(setOptions).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)); }, []);
    const total = useMemo(() => options.filter((item) => selected.includes(item.name)).reduce((sum, item) => sum + item.price, 0), [options, selected]);
    const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "6287770000883";
    const message = `Halo AFA STORE

Saya ingin custom parcel:
${selected.map((item) => `• ${item}`).join("\n")}

Total : ${formatRupiah(total)}

Nama :
Alamat :
Catatan :`;

    return <main className="min-h-screen bg-[#fffaf0] px-4 py-10 text-[#102116]"><div className="mx-auto max-w-6xl"><Link href="/" className="text-[#14532d]">Kembali ke AFA STORE</Link><h1 className="mt-6 text-5xl font-bold text-[#14532d]">Custom Parcel Premium</h1><p className="mt-3 max-w-2xl text-lg">Pilih sendiri isi hampers, lihat preview langsung, dan checkout via WhatsApp.</p><div className="mt-10 grid gap-8 md:grid-cols-[1fr_420px]"><section className="glass rounded-4xl p-6"><h2 className="mb-5 text-2xl font-bold">Pilih Isi Parcel</h2>{loading ? <p>Memuat parcel...</p> : error ? <p className="font-bold text-red-600">Gagal memuat parcel: {error}</p> : options.length ? <div className="grid gap-3 md:grid-cols-2">{options.map((item) => <label key={item.id} className="flex cursor-pointer items-center justify-between rounded-2xl border border-[#d4af37]/30 bg-white/70 p-4"><span><b>{item.name}</b><p>{formatRupiah(item.price)}</p></span><input type="checkbox" checked={selected.includes(item.name)} onChange={() => setSelected((items) => items.includes(item.name) ? items.filter((i) => i !== item.name) : [...items, item.name])} /></label>)}</div> : <p>Belum ada paket parcel yang tersedia.</p>}</section><aside className="glass sticky top-8 rounded-4xl p-6"><div className="grid h-56 place-items-center rounded-3xl bg-linear-to-br from-[#14532d] to-[#d4af37] text-white"><Gift size={80} /><p className="text-2xl font-bold">Preview Parcel</p></div><div className="mt-5 space-y-2">{selected.map((item) => <p key={item} className="flex gap-2"><CheckCircle2 className="text-[#d4af37]" />{item}</p>)}</div><h3 className="mt-6 text-3xl font-bold">{formatRupiah(total)}</h3><a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`} className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-[#14532d] px-5 py-4 font-bold text-white"><Send /> Checkout WhatsApp</a></aside></div></div></main>;
}