"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Loader2, Upload } from "lucide-react";

type Props = {
    invoice: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    qrisSrc: string;
};

const statusLabel: Record<string, string> = {
    WAITING_PAYMENT: "Menunggu Pembayaran",
    WAITING_CONFIRMATION: "Menunggu Verifikasi",
    PAID: "Lunas",
};

export function PaymentProofForm({ invoice, total, paymentMethod, paymentStatus, qrisSrc }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const statusText = statusLabel[paymentStatus] || paymentStatus;

    const proofName = useMemo(() => file?.name || "", [file]);

    const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] || null;
        setFile(selected);
        if (selected) {
            setPreview(URL.createObjectURL(selected));
        } else {
            setPreview("");
        }
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!file) return setMessage("Pilih bukti pembayaran terlebih dahulu.");
        setLoading(true);
        setMessage("");

        const formData = new FormData();
        formData.append("invoice", invoice);
        formData.append("paymentMethod", paymentMethod);
        formData.append("paymentProof", file);

        const response = await fetch("/api/payment/upload", { method: "POST", body: formData });
        const data = await response.json();
        setLoading(false);
        if (!response.ok) return setMessage(data.message || "Upload gagal.");
        setMessage(data.message || "Bukti pembayaran berhasil dikirim.");
    };

    return <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]"><div className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_20px_60px_rgba(18,53,36,0.10)] backdrop-blur md:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#C9A45B]">Metode Pembayaran</p><h2 className="mt-1 text-2xl font-bold text-[#123524]">{paymentMethod}</h2></div><span className="rounded-full bg-[#123524] px-4 py-2 text-sm font-bold text-white">{statusText}</span></div><div className="mt-5 rounded-[24px] bg-[#F8F5EE] p-4"><p className="text-sm font-semibold text-[#6D6558]">Scan QRIS menggunakan:</p><ul className="mt-3 grid grid-cols-2 gap-2 text-sm font-medium text-[#123524] md:grid-cols-3"><li>GoPay</li><li>OVO</li><li>DANA</li><li>ShopeePay</li><li>Mobile Banking</li><li>Aplikasi QRIS lainnya</li></ul></div><div className="mt-5 grid gap-3"><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#123524]">Upload Bukti Pembayaran</p><label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[#C9A45B]/50 bg-white px-4 py-4 text-sm font-bold text-[#123524] transition hover:bg-[#F8F5EE]"><Upload size={18} />{proofName || "Pilih gambar bukti pembayaran"}<input type="file" accept="image/*" onChange={onFileChange} className="hidden" /></label>{preview && <div className="overflow-hidden rounded-[24px] border border-[#123524]/10 bg-white shadow-xl"><Image src={preview} alt="Preview bukti pembayaran" width={1200} height={900} className="h-auto w-full object-cover" unoptimized /></div>}</div>{message && <p className="rounded-2xl bg-[#123524]/10 p-3 text-sm font-medium text-[#123524]">{message}</p>}<button type="submit" disabled={loading} className="inline-flex h-[58px] items-center justify-center rounded-xl bg-[#C9A45B] px-6 font-bold text-white shadow-[0_18px_40px_rgba(201,164,91,0.28)] transition hover:bg-[#A9853F] disabled:opacity-60">{loading ? <Loader2 className="mr-2 animate-spin" size={18} /> : null}Saya Sudah Bayar</button></div><aside className="rounded-[24px] bg-[#123524] p-5 text-white shadow-[0_24px_60px_rgba(18,53,36,0.22)]"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#EAD8AB]">Total Pembayaran</p><p className="mt-2 text-3xl font-bold text-white">Rp {total.toLocaleString("id-ID")}</p><div className="mt-5 grid gap-3 rounded-[20px] bg-white/10 p-4 text-sm"><div className="flex items-center justify-between"><span>Invoice</span><span className="font-semibold">{invoice}</span></div><div className="flex items-center justify-between"><span>Metode</span><span className="font-semibold">{paymentMethod}</span></div><div className="flex items-center justify-between"><span>Status</span><span className="font-semibold">{statusText}</span></div></div><div className="mt-5 rounded-[24px] bg-white p-3 shadow-inner"><Image src={qrisSrc} alt="QRIS AFA Store" width={640} height={640} className="h-auto w-full rounded-[24px] object-contain" priority /></div></aside></form>;
}