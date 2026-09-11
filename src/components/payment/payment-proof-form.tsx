"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock, QrCode, ShieldCheck, ShoppingBag } from "lucide-react";
import { getPaymentStatusPresentation } from "@/lib/payment-status";

type Props = {
    invoice: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    qrisSrc: string;
    expiredAt?: string | null;
};

const money = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const SUPPORTED_METHODS = ["GoPay", "OVO", "DANA", "ShopeePay", "Mobile Banking", "QRIS Lainnya"];

export function PaymentProofForm({ invoice, total, paymentMethod, paymentStatus, qrisSrc, expiredAt }: Props) {
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

    return (
        <div>
            <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#C9A45B]">Pembayaran Pesanan</p>
                <h1 className="mt-2 font-display text-3xl font-bold text-[#123524] md:text-4xl">{presentation.heading}</h1>
                <p className="mx-auto mt-3 max-w-xl text-sm text-[#6D6558] md:text-base">
                    {presentation.isPending
                        ? "Pesanan Anda berhasil dibuat. Silakan selesaikan pembayaran sesuai nominal di bawah ini."
                        : presentation.description}
                </p>
            </div>

            <div className="mt-6 rounded-[28px] border border-[#C9A45B]/20 bg-white/85 p-5 shadow-[0_24px_70px_rgba(18,53,36,0.08)] backdrop-blur md:p-8">
                <div className="grid grid-cols-1 gap-4 rounded-2xl bg-[#F8F5EE]/80 p-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[#C9A45B]/15">
                    <Summary label="Nomor Invoice" value={invoice} />
                    <Summary label="Total Pembayaran" value={money(total)} strong />
                    <Summary label="Status" value={statusLabel} tone={statusTone} />
                </div>

                {showQris && (
                    <div className="mt-7">
                        <div className="flex items-center gap-2.5">
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#123524] text-[#E4C982]">
                                <QrCode size={18} />
                            </span>
                            <h2 className="font-display text-xl font-bold text-[#123524] md:text-2xl">Lakukan Pembayaran</h2>
                        </div>
                        <p className="mt-2 text-sm text-[#6D6558]">Scan kode QRIS di bawah ini menggunakan aplikasi pembayaran favorit Anda.</p>

                        {qrisSrc && (
                            <div className="mt-4 flex justify-center">
                                <div className="w-full max-w-[200px] overflow-hidden rounded-2xl bg-white p-3 shadow-[0_18px_45px_rgba(18,53,36,0.10)] ring-1 ring-[#C9A45B]/20 sm:max-w-[232px] sm:p-4">
                                    <Image src={qrisSrc} alt="QRIS pembayaran" width={640} height={640} unoptimized className="h-auto w-full" />
                                </div>
                            </div>
                        )}

                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {SUPPORTED_METHODS.map((method) => (
                                <span key={method} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#123524] ring-1 ring-[#C9A45B]/20">
                                    {method}
                                </span>
                            ))}
                        </div>

                        {expiryText && (
                            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#8B6B3F]">
                                <Clock size={14} /> Batas pembayaran: {expiryText}
                            </p>
                        )}
                    </div>
                )}

                {!presentation.isPending && (
                    <p className="mt-6 flex items-center gap-2 rounded-2xl bg-[#F8F5EE] px-4 py-3 text-sm font-semibold text-[#6D6558]">
                        <ShieldCheck size={16} className="text-[#C9A45B]" /> Status ini berasal dari payment authority dan tidak dapat diubah pelanggan.
                    </p>
                )}

                <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs font-semibold text-[#6D6558]">
                    <CheckCircle2 size={15} className="shrink-0 text-[#C9A45B]" />
                    Setelah pembayaran berhasil, status pesanan akan diperbarui otomatis.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Link
                        href={`/order/${invoice}`}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#123524] px-6 py-3 font-bold text-white shadow-[0_14px_32px_rgba(18,53,36,0.22)] transition hover:-translate-y-0.5 hover:bg-[#0F4C45]"
                    >
                        <ShoppingBag size={18} /> Lihat Detail Pesanan
                    </Link>
                    <Link
                        href="/"
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#C9A45B]/40 bg-white/70 px-6 py-3 font-bold text-[#123524] transition hover:-translate-y-0.5 hover:bg-[#C9A45B]/10"
                    >
                        Lanjut Belanja <ArrowRight size={18} />
                    </Link>
                </div>
            </div>
        </div>
    );
}

function Summary({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
    return (
        <div className="px-2 text-center sm:px-4 sm:text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B6B3F]">{label}</p>
            {tone ? (
                <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{value}</span>
            ) : (
                <p className={`mt-1 break-all text-sm ${strong ? "font-display text-xl font-bold text-[#123524]" : "font-semibold text-[#123524]"}`}>
                    {value}
                </p>
            )}
        </div>
    );
}
