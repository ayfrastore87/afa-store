"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertCircle,
    ArrowLeft,
    Banknote,
    Loader2,
    Printer,
    QrCode,
    Receipt,
    Smartphone,
    Wallet,
} from "lucide-react";
import {
    formatDate,
    formatRupiah,
    paymentMethodLabel,
    sourceLabel,
    statusLabel,
    type KasirOrderDetail,
} from "./kasir-shared";
import KasirReceipt from "./KasirReceipt";

// TAHAP D: detail transaksi terhubung ke GET /api/admin/kasir/orders/[id].
// TAHAP E: tombol "Cetak Struk" memicu window.print(); struk dicetak dari data
// transaksi yang sama (read-only), tanpa mutasi database.

type KasirOrderDetailResponse = { order: KasirOrderDetail } & { message?: string };

export default function KasirTransactionDetail({ id }: { id: string }) {
    const [order, setOrder] = useState<KasirOrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notFound, setNotFound] = useState(false);

    const loadDetail = useCallback(async () => {
        setLoading(true);
        setError("");
        setNotFound(false);
        try {
            const response = await fetch(`/api/admin/kasir/orders/${id}`, {
                headers: { Accept: "application/json" },
            });
            const payload = (await response.json().catch(() => null)) as KasirOrderDetailResponse | null;
            if (response.status === 404) {
                setNotFound(true);
                return;
            }
            if (!response.ok || !payload?.order) {
                throw new Error(payload?.message || "Detail transaksi gagal dimuat.");
            }
            setOrder(payload.order);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Detail transaksi gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    if (loading) {
        return (
            <Shell id={id}>
                <div className="flex items-center justify-center px-6 py-20 text-center">
                    <Loader2 size={28} className="animate-spin text-[#C9A45B]" />
                    <span className="ml-3 font-black">Memuat detail transaksi...</span>
                </div>
            </Shell>
        );
    }

    if (notFound) {
        return (
            <Shell id={id}>
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#f8f0dd] text-[#C9A45B]">
                        <Wallet size={30} />
                    </div>
                    <h3 className="mt-5 text-xl font-black">Transaksi tidak ditemukan</h3>
                    <p className="mt-2 max-w-sm text-sm text-[#184D47]/60">
                        Transaksi dengan ID ini tidak ditemukan atau bukan transaksi kasir.
                    </p>
                    <Link
                        href="/admin/kasir/riwayat"
                        className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-[#184D47] px-5 font-black text-white transition hover:brightness-110 active:scale-95"
                    >
                        <ArrowLeft size={18} />
                        Kembali ke Riwayat
                    </Link>
                </div>
            </Shell>
        );
    }

    if (error || !order) {
        return (
            <Shell id={id}>
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <AlertCircle size={30} className="text-red-600" />
                    <p className="mt-3 font-black text-red-700">{error}</p>
                    <button onClick={() => void loadDetail()} className="mt-4 min-h-12 rounded-2xl bg-[#184D47] px-5 font-black text-white">Coba Lagi</button>
                </div>
            </Shell>
        );
    }

    const isTunai = order.paymentMethod === "TUNAI";

    return (
        <>
            <KasirReceipt order={order} />
            <Shell id={id}>
            <div className="flex items-center justify-between border-b border-[#184D47]/10 p-5">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C9A45B]">Struk Transaksi</p>
                    <h2 className="text-2xl font-black">{order.invoice}</h2>
                    <p className="text-xs text-[#184D47]/60">{formatDate(order.createdAt)}</p>
                </div>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#184D47] px-4 font-black text-white transition hover:brightness-110 active:scale-95"
                >
                    <Printer size={18} />
                    <span className="hidden sm:inline">Cetak Struk</span>
                    <span className="sm:hidden">Cetak</span>
                </button>
            </div>

            <div className="space-y-5 p-5">
                <section className="grid grid-cols-2 gap-3">
                    <Info label="Pelanggan" value={order.customer || "-"} />
                    <Info label="Sumber" value={sourceLabel(order.source)} />
                    <Info label="No. WhatsApp" value={order.phone || "-"} />
                    <Info label="Status Pesanan" value={statusLabel(order.status)} />
                </section>

                <section>
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Rincian Item</p>
                    <div className="overflow-hidden rounded-2xl border border-[#184D47]/10">
                        <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-3 bg-[#184D47] px-4 py-3 text-xs font-black text-white sm:grid">
                            <span>Produk</span>
                            <span className="w-14 text-center">Qty</span>
                            <span className="w-24 text-right">Harga</span>
                            <span className="w-28 text-right">Subtotal</span>
                        </div>
                        {order.items.map((item) => (
                            <div key={item.id} className="grid grid-cols-2 gap-2 border-t border-[#184D47]/10 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                                <span className="col-span-2 font-semibold sm:col-span-1">{item.name}</span>
                                <span className="text-[#184D47]/60 sm:w-14 sm:text-center">×{item.quantity}</span>
                                <span className="text-[#184D47]/70 sm:w-24 sm:text-right">{formatRupiah(item.price)}</span>
                                <span className="font-black sm:w-28 sm:text-right">{formatRupiah(item.subtotal)}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-2 rounded-2xl bg-[#f8f6f0] p-4">
                    <Row label="Subtotal" value={formatRupiah(order.subtotal)} />
                    <Row label="Total" value={formatRupiah(order.total)} bold />
                </section>

                <section className="space-y-2 rounded-2xl bg-[#f8f6f0] p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#184D47]/60">Metode Pembayaran</span>
                        <span className="flex items-center gap-2 font-black">
                            {isTunai ? <Banknote size={16} className="text-[#C9A45B]" /> : order.paymentMethod === "QRIS" ? <QrCode size={16} className="text-[#C9A45B]" /> : <Smartphone size={16} className="text-[#C9A45B]" />}
                            {paymentMethodLabel(order.paymentMethod)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[#184D47]/60">Status Pembayaran</span>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{statusLabel(order.paymentStatus)}</span>
                    </div>
                    {isTunai && (
                        <>
                            <Row label="Uang Diterima" value={order.cashReceived != null ? formatRupiah(order.cashReceived) : "-"} />
                            <Row label="Kembalian" value={order.change != null ? formatRupiah(order.change) : "-"} bold />
                        </>
                    )}
                </section>
            </div>
            </Shell>
        </>
    );
}


function Shell({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff8df_0,#f7efd9_34%,#edf4ef_68%,#e4dcc7_100%)] pb-24 text-[#184D47]">
            <header className="sticky top-0 z-30 border-b border-[#C9A45B]/20 bg-[#F8F5EE]/90 shadow-[0_8px_28px_rgba(18,53,36,0.06)] backdrop-blur-xl">
                <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#184D47] text-[#D4AF37]">
                            <Receipt size={22} />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-black uppercase tracking-[0.28em] text-[#C9A45B]">AFA STORE</p>
                            <h1 className="truncate text-xl font-black leading-tight sm:text-2xl">Detail Transaksi</h1>
                            <p className="truncate text-xs text-[#184D47]/60">#{id}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link
                            href="/admin/kasir/riwayat"
                            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#184D47]/15 bg-white/80 px-4 font-bold text-[#184D47] transition hover:bg-white active:scale-95"
                        >
                            <ArrowLeft size={18} />
                            <span className="hidden sm:inline">Kembali</span>
                            <span className="sm:hidden">Kembali</span>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
                <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/90 shadow-xl shadow-[#184D47]/10">
                    {children}
                </div>
            </main>
        </div>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-[#f8f6f0] p-3">
            <p className="text-xs font-bold text-[#184D47]/50">{label}</p>
            <p className="mt-1 font-black">{value}</p>
        </div>
    );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#184D47]/60">{label}</span>
            <span className={bold ? "font-black" : "font-semibold"}>{value}</span>
        </div>
    );
}
