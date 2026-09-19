"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { getPaymentStatusPresentation } from "@/lib/payment-status";

type Props = {
    invoice: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    expiredAt?: string | null;
};

const money = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function ManualQrisPaymentDisplay({ invoice, total, paymentMethod, paymentStatus, expiredAt }: Props) {
    const [status, setStatus] = useState(paymentStatus);
    const presentation = getPaymentStatusPresentation(status);
    const showQris = presentation.isPending && paymentMethod === "QRIS";
    const statusLabel = presentation.isPending ? "Menunggu Pembayaran" : presentation.label;
    const statusTone = presentation.isPending
        ? "bg-[#F7EEDC] text-[#8B6B3F] ring-1 ring-[#C9A45B]/40"
        : presentation.tone;

    useEffect(() => {
        if (!getPaymentStatusPresentation(status).isPending) return;
        const refresh = async () => {
            if (document.visibilityState !== "visible") return;
            const response = await fetch(`/api/payments/${encodeURIComponent(invoice)}`, { cache: "no-store" });
            if (!response.ok) return;
            const data = (await response.json()) as { status?: string };
            if (data.status) setStatus(data.status);
        };
        const interval = window.setInterval(() => void refresh(), 10000);
        return () => window.clearInterval(interval);
    }, [invoice, status]);

    const expiryText = expiredAt
        ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(
              new Date(expiredAt),
          )
        : null;

    if (!showQris) {
        return null;
    }

    return (
        <div className="mt-7 rounded-[2rem] border border-[#C9A45B]/30 bg-gradient-to-br from-white to-[#F8F5EE] p-6 shadow-[0_24px_70px_rgba(18,53,36,0.08)] backdrop-blur-lg">
            <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#184D47] shadow-lg">
                    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
                <h2 className="text-xl font-black text-[#184D47]">Bayar dengan QRIS</h2>
                <p className="mt-1 text-sm text-[#184D47]/70">AFA STORE</p>
            </div>

            <div className="mx-auto mb-6 flex max-w-sm flex-col items-center">
                <div className="relative mb-4 flex h-72 w-full max-w-[300px] items-center justify-center rounded-[2rem] bg-[#184D47]/5 p-4 shadow-inner">
                    <Image src="/payment/qris-afa-store.jpg" alt="QRIS AFA STORE" width={300} height={300} className="h-auto w-full rounded-xl" unoptimized />
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#184D47]/60">Scan menggunakan aplikasi bank atau e-wallet Anda</p>
            </div>

            <div className="mb-6 rounded-2xl border border-[#F59E0B]/30 bg-[#FFF7ED]/90 p-4">
                <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
                    <div className="flex-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#F59E0B]">Penting</p>
                        <p className="mt-1 text-sm text-[#92400E]">Total pembayaran tertulis di bawah ini. Pastikan nominal yang dibayarkan sesuai.</p>
                    </div>
                </div>
            </div>

            <div className="mb-6 rounded-2xl bg-[#184D47] p-5 text-white shadow-lg">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#184D47]/70">TOTAL PEMBAYARAN</p>
                <p className="mt-2 text-3xl font-black">{money(total)}</p>
                <p className="mt-2 text-xs text-[#184D47]/70">Nominal otoritatif dari database</p>
            </div>

            <div className="mb-6 rounded-2xl bg-white/60 p-5 shadow-inner">
                <div className="mb-3 flex items-center gap-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>
                        {presentation.isPending && <Clock className="h-3.5 w-3.5" />}
                        {statusLabel}
                    </span>
                </div>
                <div className="rounded-xl bg-[#F8F5EE]/80 p-4 text-sm">
                    <p className="font-semibold text-[#184D47]">Verifikasi Admin</p>
                    <p className="mt-1 text-xs text-[#184D47]/70">Setelah melakukan pembayaran, tim AFA STORE akan memverifikasi transaksi Anda secara manual.</p>
                </div>
            </div>
        </div>
    );
}
