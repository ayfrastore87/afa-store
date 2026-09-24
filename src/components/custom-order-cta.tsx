"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

const WHATSAPP_NUMBER = "6287770000883";
const ORDER_TYPES = ["Hampers", "Parcel", "Makanan", "Dessert", "Minuman", "Produk Lain", "Lainnya"] as const;

export default function CustomOrderCta() {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: "", phone: "", type: "Hampers", description: "", budget: "" });

    const send = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const message = [
            "Halo AFA STORE 👋",
            "",
            "Saya ingin membuat PESANAN CUSTOM.",
            "",
            `Nama: ${form.name.trim()}`,
            `Nomor WhatsApp: ${form.phone.trim()}`,
            `Jenis Pesanan: ${form.type}`,
            "",
            `Kebutuhan: ${form.description.trim()}`,
            `Budget: ${form.budget.trim() || "Belum ditentukan"}`,
            "",
            "Mohon dibantu untuk konsultasi dan estimasi harganya.",
            "",
            "Terima kasih.",
        ].join("\n");
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        setOpen(false);
    };

    return <>
        <section className="mx-auto my-8 max-w-7xl px-4 sm:px-6 xl:px-8">
            <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-[#C9A45B]/30 bg-[var(--card)] p-5 shadow-sm sm:flex-row sm:items-center sm:p-7">
                <div><p className="text-xs font-bold uppercase tracking-[.22em] text-[#A7833A]">Butuh sesuatu yang spesial?</p><h2 className="mt-2 font-display text-2xl font-bold text-[var(--dark-text)] sm:text-3xl">Pesan Custom</h2><p className="mt-2 max-w-xl text-sm text-[var(--muted)]">Punya permintaan khusus? Ceritakan kebutuhanmu, kami bantu siapkan.</p></div>
                <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#123524] px-6 py-3 font-bold text-white shadow-lg transition hover:bg-[#1c5138]"><MessageCircle size={18} /> Pesan Custom</button>
            </div>
        </section>
        {open && <div role="dialog" aria-modal="true" aria-labelledby="custom-order-title" className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
            <form onSubmit={send} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 text-[var(--dark-text)] shadow-2xl sm:rounded-3xl sm:p-7">
                <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#A7833A]">Konsultasi kebutuhan</p><h2 id="custom-order-title" className="mt-1 font-display text-2xl font-bold">Pesan Custom</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Tutup Pesan Custom" className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)]"><X size={19} /></button></div>
                <div className="grid gap-4"><label className="grid gap-1.5 text-sm font-semibold">Nama<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-input,var(--card))] px-3" /></label><label className="grid gap-1.5 text-sm font-semibold">Nomor WhatsApp<input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-input,var(--card))] px-3" /></label><label className="grid gap-1.5 text-sm font-semibold">Jenis Pesanan<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-input,var(--card))] px-3">{ORDER_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label className="grid gap-1.5 text-sm font-semibold">Kebutuhan / Deskripsi<textarea required rows={4} placeholder="Contoh: Hampers ulang tahun untuk anak usia 13 tahun, budget sekitar Rp250.000." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl border border-[var(--border)] bg-[var(--surface-input,var(--card))] p-3" /></label><label className="grid gap-1.5 text-sm font-semibold">Budget <span className="font-normal text-[var(--muted)]">(opsional, bukan harga final)</span><input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-input,var(--card))] px-3" /></label></div>
                <button type="submit" className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#123524] px-5 font-bold text-white"><MessageCircle size={18} /> Kirim ke WhatsApp</button>
            </form>
        </div>}
    </>;
}