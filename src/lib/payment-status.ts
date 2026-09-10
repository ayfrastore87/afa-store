export type PaymentStatusPresentation = {
    label: string;
    heading: string;
    description: string;
    tone: string;
    isPending: boolean;
    canPay: boolean;
};

const PRESENTATIONS: Record<string, PaymentStatusPresentation> = {
    PENDING: {
        label: "Belum Dibayar",
        heading: "Menunggu Pembayaran",
        description: "Silakan selesaikan pembayaran untuk pesanan ini.",
        tone: "bg-amber-100 text-amber-900 ring-1 ring-amber-300/60",
        isPending: true,
        canPay: true,
    },
    WAITING_PAYMENT: {
        label: "Menunggu Pembayaran",
        heading: "Menunggu Pembayaran",
        description: "Silakan selesaikan pembayaran untuk pesanan ini.",
        tone: "bg-amber-100 text-amber-900 ring-1 ring-amber-300/60",
        isPending: true,
        canPay: true,
    },
    PAID: {
        label: "Sudah Dibayar",
        heading: "Pembayaran Berhasil",
        description: "Pembayaran untuk pesanan ini telah diterima.",
        tone: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/60",
        isPending: false,
        canPay: false,
    },
    SETTLEMENT: {
        label: "Sudah Dibayar",
        heading: "Pembayaran Berhasil",
        description: "Pembayaran untuk pesanan ini telah diterima.",
        tone: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/60",
        isPending: false,
        canPay: false,
    },
    EXPIRED: {
        label: "Kedaluwarsa",
        heading: "Pembayaran Kedaluwarsa",
        description: "Waktu pembayaran telah berakhir.",
        tone: "bg-slate-200 text-slate-800 ring-1 ring-slate-300/70",
        isPending: false,
        canPay: false,
    },
    CANCELLED: {
        label: "Dibatalkan",
        heading: "Pembayaran Dibatalkan",
        description: "Pembayaran untuk pesanan ini telah dibatalkan.",
        tone: "bg-red-100 text-red-900 ring-1 ring-red-300/60",
        isPending: false,
        canPay: false,
    },
};

const UNKNOWN: PaymentStatusPresentation = {
    label: "Status Tidak Tersedia",
    heading: "Status Pembayaran Tidak Tersedia",
    description: "Status pembayaran belum dapat ditampilkan. Silakan hubungi dukungan.",
    tone: "bg-slate-200 text-slate-800 ring-1 ring-slate-300/70",
    isPending: false,
    canPay: false,
};

export function getPaymentStatusPresentation(status: string | null | undefined) {
    return PRESENTATIONS[status?.toUpperCase() ?? ""] ?? UNKNOWN;
}