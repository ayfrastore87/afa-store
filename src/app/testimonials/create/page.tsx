"use client";

import Link from "next/link";
import { useState } from "react";

export default function CreateTestimonialPage() {
    const [rating, setRating] = useState(5);
    const [message, setMessage] = useState("");

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage("Mengirim...");
        const formData = new FormData(event.currentTarget);
        formData.set("rating", String(rating));
        formData.set("consent", formData.get("consent") ? "true" : "false");
        const response = await fetch("/api/testimonials", { method: "POST", body: formData });
        const data = await response.json();
        setMessage(data.message || "Selesai");
        if (response.ok) event.currentTarget.reset();
    }

    return (
        <main className="min-h-screen bg-[#F8F5EE] px-4 py-10 text-[#123524]">
            <div className="mx-auto max-w-3xl rounded-[36px] border border-[#C9A45B]/25 bg-white/90 p-6 shadow-[0_28px_80px_rgba(18,53,36,.12)] md:p-10">
                <Link href="/" className="text-sm font-bold text-[#A7833A]">Kembali</Link>
                <p className="mt-6 text-xs font-black uppercase tracking-[.3em] text-[#C9A45B]">AFA Store Review Club</p>
                <h1 className="mt-3 font-display text-4xl font-black uppercase md:text-6xl">Tulis Testimoni</h1>
                <p className="mt-3 text-[#6B5A3B]">Bagikan pengalaman premium Anda. Testimoni akan tampil setelah diverifikasi admin.</p>
                <form onSubmit={submit} className="mt-8 grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <input name="name" required placeholder="Nama" className="rounded-2xl border border-[#C9A45B]/25 px-5 py-4" />
                        <input name="city" required placeholder="Kota" className="rounded-2xl border border-[#C9A45B]/25 px-5 py-4" />
                    </div>
                    <input name="whatsapp" placeholder="Nomor WhatsApp (opsional)" className="rounded-2xl border border-[#C9A45B]/25 px-5 py-4" />
                    <label className="rounded-2xl border border-dashed border-[#C9A45B]/45 bg-[#FFF8EA] p-5 font-bold">Upload Foto Profil<input name="avatar" type="file" accept="image/*" className="mt-3 block w-full text-sm" /></label>
                    <div><p className="mb-2 font-bold">Rating</p><div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setRating(n)} className={`text-4xl ${n <= rating ? "text-[#C9A45B]" : "text-[#D8D0C2]"}`}>*</button>)}</div></div>
                    <textarea name="message" required minLength={12} rows={6} placeholder="Pesan testimoni" className="rounded-2xl border border-[#C9A45B]/25 px-5 py-4" />
                    <label className="flex gap-3 text-sm text-[#6B5A3B]"><input name="consent" type="checkbox" required className="mt-1" />Saya setuju testimoni, nama, kota, dan foto profil dapat ditampilkan di website AFA Store setelah diverifikasi.</label>
                    <button className="rounded-full bg-[#123524] px-8 py-4 font-black text-white shadow-[0_18px_40px_rgba(18,53,36,.22)] hover:bg-[#C9A45B]">Kirim Testimoni</button>
                    {message && <p className="rounded-2xl bg-[#FFF8EA] p-4 font-bold text-[#8B6B3F]">{message}</p>}
                </form>
            </div>
        </main>
    );
}