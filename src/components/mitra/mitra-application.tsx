"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Clock, Handshake, Loader2, Store, XCircle } from "lucide-react";

import { partnerTypeLabels, PARTNER_TYPES } from "@/lib/partner";
import { MITRA_BG, MITRA_INPUT, MITRA_PRIMARY_BTN } from "@/components/mitra/mitra-theme";

// AFA MITRA — partner application form (Tahap 4). Reuses the existing
// POST /api/account/partner/apply endpoint verbatim; fields map 1:1 to the
// existing schema/API.

type Applicant = { name: string | null; phone: string | null };

const emptyForm = {
    partnerType: "INDIVIDUAL",
    displayName: "",
    businessName: "",
    phone: "",
    address: "",
    village: "",
    district: "",
    city: "",
    postalCode: "",
};

export function MitraApplication({ applicant }: { applicant: Applicant }) {
    const [form, setForm] = useState({
        ...emptyForm,
        displayName: applicant.name || "",
        phone: applicant.phone || "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const isIndividual = form.partnerType === "INDIVIDUAL";
    const update = (field: keyof typeof emptyForm, value: string) => setForm((c) => ({ ...c, [field]: value }));

    const field = (name: keyof typeof emptyForm, label: string, type = "text") => (
        <label className="block text-sm font-bold">
            {label}
            <input
                name={name}
                type={type}
                value={form[name]}
                onChange={(e) => update(name, e.target.value)}
                className={MITRA_INPUT}
            />
        </label>
    );

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setMessage("");
        setError("");
        try {
            const response = await fetch("/api/account/partner/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = (await response.json().catch(() => null)) as { message?: string; partner?: { status?: string } } | null;

            if (response.ok) {
                setMessage(data?.message || "Pengajuan mitra berhasil dikirim.");
                window.setTimeout(() => (window.location.href = "/mitra/pengajuan"), 1200);
            } else {
                setError(data?.message || "Pengajuan gagal. Silakan coba lagi.");
            }
        } catch {
            setError("Pengajuan gagal. Silakan coba lagi.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className={`min-h-screen ${MITRA_BG} px-4 py-10 text-[#184D47]`}>
            <div className="mx-auto max-w-xl">
                <Link href="/mitra" className="text-sm font-bold text-[#184D47]/70">← Kembali ke AFA MITRA</Link>

                <header className="mt-6 mb-8 text-center">
                    <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[#184D47] text-[#D4AF37]">
                        <Handshake size={30} />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.35em] text-[#C9A45B]">AFA MITRA</p>
                    <h1 className="mt-2 text-2xl font-black">Daftar Jadi Mitra</h1>
                    <p className="mt-2 text-sm text-[#184D47]/60">Gunakan akun AFA STORE Anda. Data di bawah memakai field yang sama dengan sistem mitra AFA STORE.</p>
                </header>

                <form onSubmit={submit} className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-xl backdrop-blur">
                    <div className="grid gap-4">
                        {field("displayName", "Nama Mitra / Toko")}
                        <label className="block text-sm font-bold">
                            Jenis Mitra
                            <select
                                value={form.partnerType}
                                onChange={(e) => update("partnerType", e.target.value)}
                                className={MITRA_INPUT}
                            >
                                {PARTNER_TYPES.map((type) => (
                                    <option key={type} value={type}>{partnerTypeLabels[type]}</option>
                                ))}
                            </select>
                        </label>
                        {!isIndividual && field("businessName", "Nama Usaha")}
                        {field("phone", "Nomor WhatsApp")}
                        {field("address", "Alamat")}
                        {field("village", "Kelurahan")}
                        {field("district", "Kecamatan")}
                        {field("city", "Kota")}
                        {field("postalCode", "Kode Pos")}
                    </div>

                    {message ? (
                        <p className="mt-5 flex items-center gap-2 rounded-2xl bg-[#e8f3e3] p-4 text-sm font-bold text-[#29621a]">
                            <CheckCircle2 size={18} /> {message}
                        </p>
                    ) : null}
                    {error ? <p className="mt-5 rounded-2xl bg-[#f7e9e6] p-4 text-sm font-bold text-[#8c2e25]">{error}</p> : null}

                    <button type="submit" disabled={submitting} className={`${MITRA_PRIMARY_BTN} mt-6 w-full`}>
                        {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
                        {submitting ? "Mengirim..." : "Ajukan Menjadi Mitra"}
                    </button>
                </form>
            </div>
        </main>
    );
}

// Reusable status presentation for the /pengajuan route (Tahap 5). Active is
// never rendered here — the server redirects ACTIVE partners to /mitra/dashboard.
type StatusProps = { status: string; partnerCode?: string | null };

const STATUS_COPY: Record<string, { icon: typeof Clock; title: string; text: string; tone: string }> = {
    PENDING: {
        icon: Clock,
        title: "Pengajuan Sedang Ditinjau",
        text: "Admin AFA STORE sedang memeriksa pengajuan Anda. Anda akan diarahkan ke dashboard begitu pengajuan disetujui.",
        tone: "bg-[#fff2d6] text-[#8b5e00]",
    },
    REJECTED: {
        icon: XCircle,
        title: "Pengajuan Belum Disetujui",
        text: "Pengajuan Anda belum disetujui. Silakan hubungi admin AFA STORE untuk informasi lebih lanjut.",
        tone: "bg-[#f7e9e6] text-[#8c2e25]",
    },
    SUSPENDED: {
        icon: Store,
        title: "Akun Mitra Ditangguhkan",
        text: "Akses operasional Anda sedang ditangguhkan oleh admin AFA STORE. Fitur penjualan, stok, dan laporan tidak tersedia untuk sementara.",
        tone: "bg-[#f5ebd8] text-[#76551d]",
    },
};

export function MitraStatus({ status, partnerCode }: StatusProps) {
    const copy = STATUS_COPY[status] ?? STATUS_COPY.PENDING;
    return (
        <main className={`min-h-screen ${MITRA_BG} px-4 py-16 text-[#184D47]`}>
            <div className="mx-auto max-w-md text-center">
                <div className={`mx-auto grid h-20 w-20 place-items-center rounded-3xl ${copy.tone}`}>
                    <copy.icon size={40} />
                </div>
                <h1 className="mt-6 text-2xl font-black">{copy.title}</h1>
                <p className="mt-3 text-[#184D47]/65">{copy.text}</p>
                {partnerCode ? (
                    <p className="mt-6 text-sm text-[#184D47]/60">
                        Kode Mitra: <b className="text-[#184D47]">{partnerCode}</b>
                    </p>
                ) : null}
                <div className="mt-8 flex flex-col gap-3">
                    <Link href="/mitra" className="text-sm font-bold text-[#184D47]/70">Kembali ke AFA MITRA</Link>
                </div>
            </div>
        </main>
    );
}
