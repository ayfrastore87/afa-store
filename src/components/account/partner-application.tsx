"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Handshake, Loader2, Store, XCircle } from "lucide-react";

import { partnerStatusLabels, partnerTypeLabels, PARTNER_TYPES } from "@/lib/partner";

type Partner = {
    id: string;
    partnerCode: string;
    partnerType: string;
    status: string;
    displayName: string;
    businessName: string | null;
    phone: string | null;
    address: string | null;
    village: string | null;
    district: string | null;
    city: string | null;
    postalCode: string | null;
    createdAt?: string | Date | null;
};

type User = { id: string; name: string; phone: string | null };

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

const statusTone: Record<string, string> = {
    PENDING: "bg-[#fff2d6] text-[#8b5e00]",
    ACTIVE: "bg-[#e8f3e3] text-[#29621a]",
    REJECTED: "bg-[#f7e9e6] text-[#8c2e25]",
    SUSPENDED: "bg-[#f5ebd8] text-[#76551d]",
};

function StatusIcon({ status }: { status: string }) {
    if (status === "ACTIVE") return <CheckCircle2 className="text-[#1f7a4d]" size={40} />;
    if (status === "REJECTED") return <XCircle className="text-[#b33a2b]" size={40} />;
    if (status === "SUSPENDED") return <Store className="text-[#99742e]" size={40} />;
    return <Clock className="text-[#b18a3d]" size={40} />;
}

export function PartnerApplication({ initialUser, initialPartner }: { initialUser: User; initialPartner: Partner | null }) {
    const [form, setForm] = useState({ ...emptyForm, displayName: initialUser.name || "", phone: initialUser.phone || "" });
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [partner, setPartner] = useState<Partner | null>(initialPartner);

    const isIndividual = form.partnerType === "INDIVIDUAL";
    const existingStatus = partner?.status;

    const update = (field: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

    const field = (name: keyof typeof emptyForm, label: string, type = "text") => (
        <label className="block text-sm font-bold">
            {label}
            <input
                name={name}
                type={type}
                value={form[name]}
                onChange={(event) => update(name, event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#184C3A]/15 bg-white/80 px-4 py-3 outline-none focus:ring-2 focus:ring-[#D4AF37]"
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
            const data = (await response.json().catch(() => null)) as { message?: string; partner?: Partner } | null;

            if (response.ok) {
                setMessage(data?.message || "Pengajuan mitra berhasil dikirim.");
                if (data?.partner) setPartner(data.partner);
            } else {
                setError(data?.message || "Pengajuan gagal. Silakan coba lagi.");
                if (data?.partner) setPartner(data.partner);
            }
        } catch {
            setError("Pengajuan gagal. Silakan coba lagi.");
        } finally {
            setSubmitting(false);
        }
    };

    const header = useMemo(
        () => (
            <header className="mb-8 text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                    <Handshake size={30} />
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#D4AF37]">AFA STORE MITRA</p>
                <h1 className="mt-3 font-display text-3xl font-black text-[#184C3A] md:text-4xl">Jadilah Mitra AFA STORE</h1>
                <p className="mt-2 text-sm text-[#69736d]">Kembangkan usaha Anda bersama AFA STORE.</p>
            </header>
        ),
        []
    );

    if (existingStatus) {
        const label = partnerStatusLabels[existingStatus] || existingStatus;
        const statusTitle =
            existingStatus === "PENDING"
                ? "Pengajuan sedang ditinjau"
                : existingStatus === "ACTIVE"
                    ? "Anda adalah Mitra AFA STORE"
                    : existingStatus === "REJECTED"
                        ? "Pengajuan belum disetujui"
                        : "Akun mitra sedang ditangguhkan";

        return (
            <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7df,#f7ead0_45%,#ffffff)] px-4 py-12 text-[#102116]">
                <div className="mx-auto max-w-xl">
                    <Link href="/account" className="text-sm font-bold text-[#184C3A]">← Kembali ke Akun</Link>
                    {header}
                    <section className="rounded-4xl border border-white/70 bg-white/80 p-8 text-center shadow-2xl backdrop-blur">
                        <StatusIcon status={existingStatus} />
                        <h2 className="mt-4 text-2xl font-bold text-[#184C3A]">{statusTitle}</h2>
                        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${statusTone[existingStatus] || "bg-gray-100"}`}>{label}</span>
                        {partner?.partnerCode && <p className="mt-4 text-sm text-[#69736d]">Kode Mitra: <b className="text-[#184C3A]">{partner.partnerCode}</b></p>}
                        {existingStatus === "ACTIVE" && (
                            <Link
                                href="/partner"
                                className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#184C3A] px-6 py-4 font-bold text-white shadow-xl transition hover:brightness-110 active:scale-[0.99]"
                            >
                                Buka Dashboard Mitra
                            </Link>
                        )}
                        {existingStatus === "REJECTED" && (
                            <p className="mt-4 text-sm text-[#69736d]">Untuk informasi lebih lanjut, silakan hubungi admin AFA STORE.</p>
                        )}
                    </section>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7df,#f7ead0_45%,#ffffff)] px-4 py-12 text-[#102116]">
            <div className="mx-auto max-w-xl">
                <Link href="/account" className="text-sm font-bold text-[#184C3A]">← Kembali ke Akun</Link>
                {header}
                <form onSubmit={submit} className="rounded-4xl border border-white/70 bg-white/70 p-6 shadow-2xl backdrop-blur md:p-8">
                    <div className="grid gap-4">
                        {field("displayName", "Nama Tampilan")}
                        <label className="block text-sm font-bold">
                            Jenis Mitra
                            <select
                                value={form.partnerType}
                                onChange={(event) => update("partnerType", event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-[#184C3A]/15 bg-white/80 px-4 py-3 outline-none focus:ring-2 focus:ring-[#D4AF37]"
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

                    {message && <p className="mt-5 rounded-2xl bg-[#184C3A]/10 p-4 text-sm font-bold text-[#184C3A] wrap-break-word">{message}</p>}
                    {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 wrap-break-word">{error}</p>}

                    <button
                        disabled={submitting}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#184C3A] px-6 py-4 font-bold text-white shadow-xl transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {submitting && <Loader2 className="animate-spin" size={18} />}
                        {submitting ? "Mengirim..." : "Ajukan Menjadi Mitra"}
                    </button>
                </form>
            </div>
        </main>
    );
}
