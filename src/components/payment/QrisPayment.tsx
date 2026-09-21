import Image from "next/image";
import { Download } from "lucide-react";

/**
 * Reusable QRIS payment display for AFA STORE.
 *
 * Single source of truth for every screen that needs to show a QRIS:
 * customer checkout payment page and the Kasir/POS transaction detail.
 *
 * By default it renders the official static AFA STORE QRIS image
 * (`/payment/qris-afa-store.jpg`). When Midtrans QRIS is re-enabled later,
 * pass a dynamic `imageSrc` (the Midtrans QR URL) and this same component
 * will render it — no separate markup is needed.
 *
 * The image itself already carries AFA STORE, NMID and the national QR
 * standard text, so this component deliberately keeps the surrounding copy
 * short (no repeated branding) and uses normal flex flow (no absolute
 * positioning) to guarantee nothing ever overlaps the QR or the amount.
 */

const DEFAULT_QRIS_SRC = "/payment/qris-afa-store.jpg";

const money = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);

type QrisPaymentProps = {
    /** Authoritative amount to pay (from the order/transaction total, never hardcoded). */
    total: number;
    /**
     * Optional QR image source. Defaults to the static AFA STORE QRIS.
     * Provide a Midtrans (or other provider) QR URL to render a dynamic QR.
     */
    imageSrc?: string | null;
    /** Optional, already-formatted payment expiry label shown as a small note. */
    expiryLabel?: string | null;
    /** Show the "Simpan QRIS" download button (only for the static image). Default: true. */
    showDownload?: boolean;
    /** Extra classes for the outer container. */
    className?: string;
};

export function QrisPayment({ total, imageSrc, expiryLabel, showDownload = true, className }: QrisPaymentProps) {
    const src = imageSrc && imageSrc.trim() ? imageSrc.trim() : DEFAULT_QRIS_SRC;
    const isStaticQris = src === DEFAULT_QRIS_SRC;

    return (
        <div className={`flex w-full flex-col items-center gap-4 ${className ?? ""}`}>
            <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-[#C9A45B]">
                Pembayaran QRIS
            </p>

            {/* Total — kept above the QR so the nominal can never be covered by the image or a button. */}
            <div className="w-full max-w-[340px] rounded-2xl bg-[#123524] px-5 py-4 text-center text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">Total Pembayaran</p>
                <p className="mt-1 break-words text-2xl font-black leading-tight sm:text-3xl">{money(total)}</p>
            </div>

            {/* QRIS image — object-contain + h-auto so the full QR (logo, GPN, QR code, footer) is never cropped. */}
            <div className="flex w-full max-w-[320px] justify-center overflow-hidden rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#123524]/10 sm:p-4">
                <Image
                    src={src}
                    alt="QRIS AFA STORE"
                    width={320}
                    height={320}
                    unoptimized
                    className="h-auto w-full max-w-full object-contain"
                />
            </div>

            {/* Instruction — short, no repeated branding (the image already carries it). */}
            <p className="max-w-[340px] text-center text-sm leading-relaxed text-[#6D6558]">
                Scan QRIS di atas menggunakan aplikasi bank atau e-wallet Anda.
            </p>

            {expiryLabel ? (
                <p className="text-center text-xs font-semibold text-[#8B6B3F]">Batas pembayaran: {expiryLabel}</p>
            ) : null}

            {showDownload && isStaticQris ? (
                <a
                    href={src}
                    download="qris-afa-store.jpg"
                    className="inline-flex min-h-11 w-full max-w-[340px] items-center justify-center gap-2 rounded-full border border-[#C9A45B]/40 bg-white px-5 text-sm font-bold text-[#123524] transition hover:bg-[#C9A45B]/10"
                >
                    <Download size={16} /> Simpan QRIS
                </a>
            ) : null}
        </div>
    );
}

export default QrisPayment;
