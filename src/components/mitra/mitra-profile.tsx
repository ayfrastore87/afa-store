"use client";

import { useEffect, useState } from "react";
import { Loader2, Receipt, User, LogOut, Handshake, ChevronRight } from "lucide-react";

import { partnerStatusLabels, partnerTypeLabels } from "@/lib/partner";
import { MITRA_CARD } from "@/components/mitra/mitra-theme";

// AFA MITRA — profile view (Tahap 14). Read-only from /api/account/partner.
// No fake edit API is rendered because none exists for the partner profile.

type PartnerProfile = {
    displayName: string;
    businessName: string | null;
    partnerCode: string;
    partnerType: string;
    status: string;
    phone: string | null;
    address: string | null;
    village: string | null;
    district: string | null;
    city: string | null;
};

export function MitraProfile() {
    const [profile, setProfile] = useState<PartnerProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/account/partner", { headers: { Accept: "application/json" } })
            .then(async (response) => {
                const data = (await response.json().catch(() => null)) as { partner?: PartnerProfile | null } | null;
                if (!response.ok) throw new Error();
                if (!cancelled) setProfile(data?.partner ?? null);
            })
            .catch(() => {
                if (!cancelled) setMessage("Profil gagal dimuat.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const logout = async () => {
        const r = await fetch("/api/auth/logout", { method: "POST" });
        if (r.ok) window.location.href = "/";
        else setMessage("Logout gagal. Silakan coba lagi.");
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-[#184D47]/50">
                <Loader2 size={18} className="animate-spin" /> Memuat profil…
            </div>
        );
    }
    if (!profile) {
        return <State text={message || "Belum ada data profil."} />;
    }

    const address = [profile.address, profile.village, profile.district, profile.city].filter(Boolean).join(", ");

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-3xl bg-[#184D47] p-5 text-white shadow-lg">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-[#D4AF37]"><User size={26} /></span>
                <div className="min-w-0">
                    <p className="truncate text-lg font-black">{profile.businessName || profile.displayName}</p>
                    <p className="text-sm text-white/70">Kode: {profile.partnerCode}</p>
                </div>
            </div>

            <div className={`${MITRA_CARD} p-4`}>
                <h2 className="mb-3 text-base font-black">Informasi Mitra</h2>
                <dl className="space-y-2 text-sm">
                    <Row label="Nama Mitra" value={profile.displayName} />
                    <Row label="Nama Usaha" value={profile.businessName || "-"} />
                    <Row label="Kode Mitra" value={profile.partnerCode} />
                    <Row label="Jenis Mitra" value={partnerTypeLabels[profile.partnerType] ?? profile.partnerType} />
                    <Row label="Status" value={partnerStatusLabels[profile.status] ?? profile.status} />
                    <Row label="WhatsApp" value={profile.phone || "-"} />
                    <Row label="Alamat" value={address || "-"} />
                </dl>
            </div>

            <div className={`${MITRA_CARD} overflow-hidden`}>
                <a href="/mitra/lokasi" className="flex items-center gap-3 p-4 transition hover:bg-white/60">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#184D47]/8 text-[#C9A45B]"><Handshake size={20} /></span>
                    <span className="flex-1"><b className="block text-sm text-[#184D47]">Live Location</b><small className="text-xs text-[#184D47]/50">Bagikan lokasi operasional</small></span>
                    <ChevronRight size={18} className="text-[#184D47]/40" />
                </a>
                <a href="/mitra/penjualan" className="flex items-center gap-3 border-t border-[#184D47]/10 p-4 transition hover:bg-white/60">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#184D47]/8 text-[#C9A45B]"><Receipt size={20} /></span>
                    <span className="flex-1"><b className="block text-sm text-[#184D47]">Riwayat Penjualan</b><small className="text-xs text-[#184D47]/50">Lihat transaksi Anda</small></span>
                    <ChevronRight size={18} className="text-[#184D47]/40" />
                </a>
            </div>

            {message ? <p className="rounded-2xl bg-[#f7e9e6] p-3 text-sm font-bold text-[#8c2e25]">{message}</p> : null}

            <button type="button" onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#8c2e25]/20 bg-white/70 py-3 text-sm font-black text-[#8c2e25] transition hover:bg-white active:scale-[0.99]">
                <LogOut size={18} /> Keluar
            </button>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <dt className="text-[#184D47]/50">{label}</dt>
            <dd className="text-right font-bold text-[#184D47]">{value}</dd>
        </div>
    );
}

function State({ text }: { text: string }) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#184D47]/15 bg-white/50 px-4 py-12 text-center">
            <Receipt size={28} className="text-[#C9A45B]" />
            <p className="text-sm font-semibold text-[#184D47]/60">{text}</p>
        </div>
    );
}
