"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, MapPin } from "lucide-react";

import { partnerStatusLabels, partnerTypeLabels } from "@/lib/partner";

type Location = {
    id: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    source: string;
    consent: boolean;
    recordedAt: string;
};

type Response = {
    partner: { id: string; partnerCode: string; name: string; partnerType: string; status: string };
    location: Location | null;
};

type Props = {
    partnerId: string;
    partnerName: string;
    partnerCode: string;
    partnerStatus: string;
};

const wib = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
});

function formatWib(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : `${wib.format(date)} WIB`;
}

export function PartnerLocationPanel({ partnerId, partnerName, partnerCode, partnerStatus }: Props) {
    const [data, setData] = useState<Response | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/partners/${partnerId}/location`, { headers: { Accept: "application/json" } });
            const payload = (await response.json().catch(() => null)) as (Response & { message?: string }) | null;
            if (!response.ok) throw new Error(payload?.message || "Lokasi mitra gagal dimuat.");
            setData(payload as Response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Lokasi mitra gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [partnerId]);

    useEffect(() => {
        void load();
    }, [load]);

    const location = data?.location ?? null;

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/mitra" className="text-sm font-bold text-[#184C3A]">← Kembali ke Mitra</Link>
                <header className="mt-4 mb-6 flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                        <MapPin size={24} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-black text-[#123d2d]">{partnerName}</h1>
                        <p className="text-sm text-[#69736d]">
                            {partnerCode} · <span className="font-bold">{partnerStatusLabels[partnerStatus] || partnerStatus}</span>
                        </p>
                    </div>
                </header>

                {loading ? (
                    <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat lokasi mitra..." />
                ) : error ? (
                    <State icon={<MapPin size={28} />} text={error} />
                ) : !location ? (
                    <State icon={<MapPin size={28} />} text="Mitra belum menyimpan lokasi." />
                ) : (
                    <section className="rounded-2xl border border-[#ded9cc] bg-white p-5 shadow-sm">
                        <h2 className="mb-4 text-lg font-black text-[#123d2d]">Lokasi Terakhir</h2>
                        <dl className="grid gap-3 sm:grid-cols-2">
                            <Field label="Nama Mitra" value={data?.partner.name ?? "-"} />
                            <Field label="Jenis Mitra" value={partnerTypeLabels[data?.partner.partnerType ?? ""] || (data?.partner.partnerType ?? "-")} />
                            <Field label="Latitude" value={String(location.latitude)} />
                            <Field label="Longitude" value={String(location.longitude)} />
                            <Field label="Akurasi" value={location.accuracy != null ? `±${Math.round(location.accuracy)} meter` : "-"} />
                            <Field label="Terakhir Diperbarui" value={formatWib(location.recordedAt)} />
                            <Field label="Sumber" value={location.source} />
                            <Field label="Consent" value={location.consent ? "Disetujui" : "Tidak"} />
                        </dl>

                        <a
                            href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#184C3A] px-4 text-sm font-bold text-white hover:bg-[#123a36]"
                        >
                            <ExternalLink size={15} /> Lihat di Peta
                        </a>
                    </section>
                )}
            </div>
        </main>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-[#f7f4ec] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-[#123d2d]">{value}</p>
        </div>
    );
}

function State({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 px-4 py-12 text-center">
            <span className="text-[#D4AF37]">{icon}</span>
            <p className="text-sm font-semibold text-[#69736d]">{text}</p>
        </div>
    );
}
