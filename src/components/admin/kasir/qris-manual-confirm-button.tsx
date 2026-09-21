"use client";

import { useState } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";

type Props = {
    orderId: string;
    invoice: string;
    onConfirm: () => void;
};

export function QrisManualConfirmButton({ orderId, invoice, onConfirm }: Props) {
    const [confirming, setConfirming] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = async () => {
        if (!window.confirm(
            `Pastikan pembayaran benar-benar sudah masuk ke akun merchant AFA STORE.\n\nOrder: ${invoice}\n\nSetelah dikonfirmasi, status pembayaran akan diubah menjadi PAID.`
        )) {
            return;
        }

        setConfirming(true);
        setError(null);

        try {
            const response = await fetch(`/api/admin/kasir/orders/${orderId}/confirm-qris-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || "Gagal mengonfirmasi pembayaran.");
            }

            setSuccess(true);
            onConfirm();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
        } finally {
            setConfirming(false);
        }
    };

    return (
        <div className="rounded-2xl border border-[#184D47]/20 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
                <div>
                    <p className="font-bold text-[#184D47]">QRIS Manual — Menunggu Verifikasi</p>
                    <p className="text-xs text-[#184D47]/70">Pembayaran manual perlu diverifikasi oleh admin</p>
                </div>
            </div>

            {success ? (
                <div className="flex items-center gap-2 rounded-xl bg-[#ECFDF5] px-3 py-2 text-sm font-semibold text-[#065F46]">
                    <CheckCircle className="h-4 w-4" /> Pembayaran Terverifikasi
                </div>
            ) : error ? (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            ) : (
                <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#184D47] px-4 py-2.5 font-bold text-white transition hover:bg-[#14403a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {confirming ? (
                        <>Memproses...</>
                    ) : (
                        <>
                            <CheckCircle className="h-4 w-4" />
                            KONFIRMASI PEMBAYARAN
                        </>
                    )}
                </button>
            )}

            <p className="mt-2 text-xs text-[#184D47]/60">
                Invoice #{invoice} • Status: {success ? "Terverifikasi" : "Menunggu Verifikasi"}
            </p>
        </div>
    );
}
