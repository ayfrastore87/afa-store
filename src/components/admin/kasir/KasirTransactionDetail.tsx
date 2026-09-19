"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import {
    AlertCircle,
    ArrowLeft,
    Banknote,
    Clock,
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
    deliveryStatusBadgeClass,
    paymentMethodLabel,
    sourceLabel,
    statusLabel,
    type KasirOrderDetail,
    type KasirShipmentSyncResponse,
    isMidtransQrImageUrl,
} from "./kasir-shared";
import {
    KASIR_DELIVERY_AUTO_REFRESH_MS,
    kasirOrderTypeLabel,
    shouldAutoRefreshKasirDeliveryStatus,
} from "@/lib/kasir-delivery";
import KasirReceipt from "./KasirReceipt";
import KasirPrinterPanel from "./KasirPrinterPanel";
import KasirShipmentActions from "./KasirShipmentActions";
import KasirDeliveryTimeline from "./KasirDeliveryTimeline";
import { QrisManualConfirmButton } from "./qris-manual-confirm-button";

// TAHAP D: detail transaksi terhubung ke GET /api/admin/kasir/orders/[id].
// TAHAP E: satu tombol "Print" menjalankan alur cetak terpadu (BLE via
// printReceipt, atau window.print() sebagai fallback). Struk dicetak dari data
// transaksi yang sama (read-only), tanpa mutasi database.
//
// TAHAP F (tracking): halaman ini juga menampilkan status pengiriman terbaru yang
// TERSIMPAN (status provider mentah + label normalisasi + resi + "Terakhir
// Diperbarui") dan menyinkronkannya lewat route admin yang sudah ada
// (GET /api/admin/orders/[id]/biteship). Sinkronisasi itu hanya MEMBACA pengiriman
// yang sudah ada — tidak pernah membuat pengiriman baru, tidak menyentuh
// pembayaran/stok/total, dan tidak pernah memanggil Biteship dari browser.
//
// PERFORMA: data pengiriman TERSIMPAN langsung tampil dari satu pembacaan transaksi.
// Sinkronisasi provider berjalan di latar belakang dan HANYA memperbarui kartu
// PENGIRIMAN dari respons tersanitasi (status, timeline, resi, label, waktu perbarui) —
// tidak ada pembacaan ulang seluruh transaksi dan tidak ada router.refresh() setiap
// polling. Satu permintaan sinkronisasi saja yang boleh berjalan (single-flight), jadi
// auto-refresh dan tombol PERBARUI STATUS tidak pernah bertumpuk.

type KasirOrderDetailResponse = {
    order: KasirOrderDetail;
    /** Identitas petugas aktif, dihitung server-side oleh route kasir (admin). */
    cashier?: { name?: string | null } | null;
    message?: string;
};

export default function KasirTransactionDetail({ id }: { id: string }) {
    const [order, setOrder] = useState<KasirOrderDetail | null>(null);
    const [cashierName, setCashierName] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notFound, setNotFound] = useState(false);
    const [confirmingCodPayment, setConfirmingCodPayment] = useState(false);
    const [retryingQris, setRetryingQris] = useState(false);

    // Identitas petugas ikut payload order, jadi halaman kasir TIDAK memanggil
    // /api/auth/me (customer-only, selalu menjawab { user: null } untuk admin).
    const applyDetail = useCallback((payload: KasirOrderDetailResponse) => {
        if (!payload.order) return;
        setOrder(payload.order);
        setCashierName(payload.cashier?.name ?? "");
    }, []);

    const readDetail = useCallback(async () => {
        const response = await fetch(`/api/admin/kasir/orders/${id}`, {
            headers: { Accept: "application/json" },
            // Today's transaction (and its latest persisted shipment/tracking data) is
            // always read fresh, so a reprint never uses stale client state.
            cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as KasirOrderDetailResponse | null;
        return { response, payload };
    }, [id]);

    /** True once the transaction has been read, so a later reload never blanks the page. */
    const loadedRef = useRef(false);

    const loadDetail = useCallback(async () => {
        if (!loadedRef.current) setLoading(true);
        setError("");
        setNotFound(false);
        try {
            const { response, payload } = await readDetail();
            if (response.status === 404) {
                setNotFound(true);
                return;
            }
            if (!response.ok || !payload?.order) {
                throw new Error(payload?.message || "Detail transaksi gagal dimuat.");
            }
            applyDetail(payload);
        } catch (err) {
            setError(getUserFacingMessage(err, "Detail transaksi gagal dimuat."));
        } finally {
            loadedRef.current = true;
            setLoading(false);
        }
    }, [applyDetail, readDetail]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    // Auto-refresh KONSERVATIF: hanya selagi halaman detail ini terbuka DAN pengiriman
    // masih aktif. Ia memakai GET (baca pengiriman yang sudah ada) sehingga tidak pernah
    // membuat pengiriman kedua, dan berhenti sendiri untuk status terminal
    // (Terkirim / Dibatalkan-Gagal) maupun saat tab tidak terlihat.
    //
    // Satu permintaan saja per siklus: respons tersinkron sudah berisi keadaan pengiriman
    // tersanitasi, jadi transaksi TIDAK dibaca ulang dan halaman tidak dimuat ulang.

    /** Kunci single-flight bersama: dipakai auto-refresh DAN tombol PERBARUI STATUS. */
    const syncLockRef = useRef(false);

    /**
     * Menerapkan keadaan pengiriman hasil sinkronisasi ke kartu PENGIRIMAN yang sudah
     * tampil. Hanya field pengiriman yang diganti — item, pembayaran, dan total transaksi
     * tidak pernah disentuh dari sini.
     */
    const applyShipmentSync = useCallback((payload: KasirShipmentSyncResponse) => {
        const synced = payload?.delivery;
        if (!synced) return;
        setOrder((current) => (current?.delivery ? { ...current, delivery: { ...current.delivery, ...synced } } : current));
    }, []);

    const syncShipmentStatus = useCallback(async () => {
        // Sudah ada sinkronisasi berjalan (otomatis atau manual): lewati siklus ini,
        // jangan pernah mengantrekan permintaan Biteship kedua.
        if (syncLockRef.current) return;
        syncLockRef.current = true;
        try {
            const response = await fetch(`/api/admin/orders/${id}/biteship`, {
                method: "GET",
                headers: { Accept: "application/json" },
            });
            // Gagal/timeout: status tersimpan terakhir tetap tampil apa adanya.
            if (!response.ok) return;
            const payload = (await response.json().catch(() => null)) as KasirShipmentSyncResponse | null;
            if (payload) applyShipmentSync(payload);
        } catch {
            // Senyap: kegagalan pembaruan otomatis tidak mengganggu kasir.
        } finally {
            syncLockRef.current = false;
        }
    }, [applyShipmentSync, id]);

    /**
     * COD payment confirmation (Kasir DELIVERY + TUNAI pending): the admin
     * confirms receipt of cash, and the server atomically marks Payment and Order.paymentStatus as
     * PAID. This client does not modify totals/inventory at all — it just
     * calls the confirmation route and reloads the transaction afterward.
     */
    const confirmCodPayment = useCallback(async () => {
        setConfirmingCodPayment(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/orders/${id}/payment/confirm`, {
                method: "POST",
                headers: { Accept: "application/json" },
            });
            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { message?: string } | null;
                throw new Error(payload?.message || "Konfirmasi pembayaran COD gagal.");
            }
            // Reload the transaction to get the updated payment status.
            await loadDetail();
        } catch (caught) {
            setError(getUserFacingMessage(caught, "Konfirmasi pembayaran COD gagal."));
        } finally {
            setConfirmingCodPayment(false);
        }
    }, [id, loadDetail]);

    const retryQrisLockRef = useRef(false);

    const retryQris = useCallback(async () => {
        if (retryQrisLockRef.current) return;
        setRetryingQris(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/kasir/orders/${id}/qris/retry`, { method: "POST", headers: { Accept: "application/json" } });
            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { message?: string } | null;
                throw new Error(payload?.message || "Inisialisasi QRIS gagal.");
            }
            await loadDetail();
        } catch (caught) {
            setError(getUserFacingMessage(caught, "Inisialisasi QRIS gagal."));
        } finally {
            retryQrisLockRef.current = false;
            setRetryingQris(false);
        }
    }, [id, loadDetail]);
    const hasActiveShipment =
        Boolean(order?.delivery) &&
        shouldAutoRefreshKasirDeliveryStatus({
            hasShipment: order?.delivery?.hasShipment,
            statusKey: order?.delivery?.status.key,
        });

    useEffect(() => {
        if (!hasActiveShipment) return;
        const timer = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            void syncShipmentStatus();
        }, KASIR_DELIVERY_AUTO_REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [hasActiveShipment, syncShipmentStatus]);
    const qrisPending = order?.paymentMethod === "QRIS" && ["PENDING", "WAITING_PAYMENT"].includes(order?.paymentStatus ?? "");
    const shouldPollQris = qrisPending && !loading;

    // Single-flight lock for QRIS polling (prevents overlapping fetch requests).
    const qrisPollLockRef = useRef(false);

    useEffect(() => {
        if (!shouldPollQris || document.visibilityState !== "visible") return;
        const refresh = async () => {
            if (qrisPollLockRef.current) return;
            qrisPollLockRef.current = true;
            try {
                const response = await fetch(`/api/admin/kasir/orders/${id}`, { cache: "no-store" });
                if (!response.ok) return;
                const payload = (await response.json()) as KasirOrderDetailResponse | null;
                if (payload?.order) applyDetail(payload);
            } catch {
                // Fail silently: preserve current QR display and payment status.
            } finally {
                qrisPollLockRef.current = false;
            }
        };
        void refresh();
        const timer = window.setInterval(refresh, 10000);
        return () => window.clearInterval(timer);
    }, [shouldPollQris, id, loading, applyDetail]);

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
    const isDeliveryOrder = order.orderType === "DELIVERY";
    const isPendingCOD = isTunai && isDeliveryOrder && ["PENDING", "WAITING_PAYMENT"].includes(order.paymentStatus);
    // PENGIRIMAN block: present for a delivery order only.
    const delivery = order.delivery;

    return (
        <>
            <KasirReceipt order={order} cashierName={cashierName} />
            <Shell id={id}>
            <div className="flex items-center justify-between border-b border-[#184D47]/10 p-5">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C9A45B]">Struk Transaksi</p>
                    <h2 className="text-2xl font-black">{order.invoice}</h2>
                    <p className="text-xs text-[#184D47]/60">{formatDate(order.createdAt)}</p>
                </div>
                <KasirPrinterPanel order={order} cashierName={cashierName} />
            </div>

            <div className="space-y-5 p-5">
                <section className="grid grid-cols-2 gap-3">
                    <Info label="Pelanggan" value={order.customer || "-"} />
                    <Info label="Sumber" value={sourceLabel(order.source)} />
                    <Info label="No. WhatsApp" value={order.phone || "-"} />
                    <Info label="Status Pesanan" value={statusLabel(order.status)} />
                    <Info label="Jenis Pesanan" value={kasirOrderTypeLabel(order.orderType)} />
                    {delivery ? (
                        <div className="rounded-2xl bg-[#f8f6f0] p-3">
                            <p className="text-xs font-bold text-[#184D47]/50">Status Pengiriman</p>
                            <p className="mt-1">
                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${deliveryStatusBadgeClass(delivery.status.key)}`}>
                                    {delivery.status.label}
                                </span>
                            </p>
                            {delivery.status.raw ? (
                                <p className="mt-1 text-[11px] font-semibold text-[#184D47]/50">Status provider: {delivery.status.raw}</p>
                            ) : null}
                        </div>
                    ) : null}
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
                    {delivery ? <Row label="Ongkir" value={formatRupiah(order.shipping)} /> : null}
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
                        {isPendingCOD ? (
                            <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-800">Menunggu Pembayaran COD</span>
                        ) : (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{statusLabel(order.paymentStatus)}</span>
                        )}
                    </div>
                    {isPendingCOD && (
                        <button
                            type="button"
                            onClick={() => void confirmCodPayment()}
                            disabled={confirmingCodPayment}
                            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#184D47] px-4 text-sm font-bold text-white transition hover:bg-[#123c37] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {confirmingCodPayment ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
                            {confirmingCodPayment ? "Memproses…" : "Pembayaran COD Diterima"}
                        </button>
                    )}
                    {/* QRIS Payment Card */}
                    {order.paymentMethod === "QRIS" && !isPendingCOD && (
                        <div className="mt-4 rounded-xl border border-[#C9A45B]/20 bg-white p-4">
                            {order.payment?.status === "PAID" ? (
                                <div className="text-center">
                                    <p className="rounded-lg bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Lunas</p>
                                    {order.payment.expiredAt && (
                                        <p className="mt-2 text-xs text-[#6D6558]">Dikonfirmasi pada {formatDate(order.payment.expiredAt)}</p>
                                    )}
                                </div>
                            ) : order.qrisProvider === "MANUAL" &&
                               ["PENDING", "WAITING_PAYMENT"].includes(order.paymentStatus) &&
                               !order.payment?.transactionId ? (
                                // Manual QRIS card - simplified and clean layout
                                <div className="rounded-xl bg-white p-4">
                                    <div className="text-center text-xs font-bold uppercase tracking-wide text-[#F59E0B]">
                                        QRIS AFA STORE
                                    </div>

                                    {/* QR Image */}
                                    <div className="mx-auto my-3 flex h-80 w-full max-w-[320px] items-center justify-center rounded-lg bg-white p-4 shadow-sm ring-1 ring-[#184D47]/10">
                                        <Image
                                            src="/payment/qris-afa-store.jpg"
                                            alt="QRIS AFA STORE"
                                            width={300}
                                            height={300}
                                            className="h-auto w-full rounded object-contain"
                                            unoptimized
                                        />
                                    </div>

                                    {/* Warning info */}
                                    <p className="mb-3 text-center text-xs text-[#184D47]/70">
                                        Scan QRIS menggunakan aplikasi bank atau e-wallet Anda.
                                    </p>

                                    {/* Total payment */}
                                    <div className="mb-4 rounded-xl bg-[#FFF7ED] p-4 text-center">
                                        <p className="text-xs font-bold uppercase tracking-wide text-[#92400E]">Total Pembayaran</p>
                                        <p className="mt-1 text-2xl font-black text-[#92400E]">{formatRupiah(order.total)}</p>
                                        <p className="mt-1 text-xs text-[#92400E]/70">Pastikan nominal pembayaran sesuai.</p>
                                    </div>

                                    {/* Verification status */}
                                    <div className="mb-4 rounded-xl border border-[#F59E0B]/20 bg-[#FFFDF7] p-3">
                                        <p className="text-xs font-bold text-[#92400E]">
                                            ⚠ QRIS Manual — Menunggu Verifikasi
                                        </p>
                                        <p className="mt-1 text-xs text-[#92400E]/70">
                                            Konfirmasi setelah pembayaran benar-benar diterima.
                                        </p>
                                    </div>

                                    {/* Confirmation button */}
                                    <QrisManualConfirmButton
                                        orderId={order.id}
                                        invoice={order.invoice}
                                        onConfirm={() => loadDetail()}
                                    />
                                </div>
                            ) : (
                                // Midtrans QRIS - show QR code or retry button
                                <div className="text-center">
                                    <p className="mb-3 text-sm font-bold text-[#184D47]">Menunggu Pembayaran QRIS</p>
                                    {order.payment?.qrisUrl && isMidtransQrImageUrl(order.payment.qrisUrl) ? (
                                        <>
                                            <Image src={order.payment.qrisUrl} alt="QRIS pembayaran" width={256} height={256} unoptimized className="mx-auto max-w-[256px]" />
                                            {order.payment.expiredAt && (
                                                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#8B6B3F]">
                                                    <Clock size={14} /> Batas pembayaran: {formatDate(order.payment.expiredAt)}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => void retryQris()}
                                            disabled={retryingQris}
                                            className="mt-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#184D47] px-4 text-sm font-bold text-white transition hover:bg-[#123c37] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {retryingQris ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                                            {retryingQris ? "Inisialisasi…" : "Inisialisasi QRIS"}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {isTunai && (
                        <>
                            <Row label="Uang Diterima" value={order.cashReceived != null ? formatRupiah(order.cashReceived) : "-"} />
                            <Row label="Kembalian" value={order.change != null ? formatRupiah(order.change) : "-"} bold />
                        </>
                    )}
                </section>

                {delivery ? (
                    <section className="space-y-3 rounded-2xl border border-[#184D47]/10 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Pengiriman</p>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${deliveryStatusBadgeClass(delivery.status.key)}`}>
                                {delivery.status.label}
                            </span>
                        </div>
                        {/* Timeline tahapan pengiriman: murni dari status provider yang
                            tersimpan di server (tidak dihitung ulang di browser). */}
                        <KasirDeliveryTimeline timeline={delivery.timeline} />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Row label="Nama Penerima" value={delivery.recipientName || "-"} />
                            <Row label="No. WhatsApp" value={delivery.recipientPhone || "-"} />
                            <Row label="Kurir" value={delivery.courier || "-"} />
                            <Row label="Layanan" value={delivery.service || "-"} />
                            <Row label="Ongkir" value={formatRupiah(delivery.shipping)} />
                            <Row label="No. Resi / Tracking" value={delivery.trackingId || "Belum tersedia"} />
                            {/* Status provider mentah apa adanya (tidak pernah diterjemahkan ulang),
                                ditambah kapan keadaan pengiriman terakhir tersimpan. */}
                            <Row label="Status Provider" value={delivery.status.raw || "-"} />
                            <Row
                                label="Terakhir Diperbarui"
                                value={delivery.lastUpdatedAt ? formatDate(delivery.lastUpdatedAt) : "-"}
                            />
                        </div>
                        <div className="rounded-2xl bg-[#f8f6f0] p-3">
                            <p className="text-xs font-bold text-[#184D47]/50">Alamat Pengiriman</p>
                            <p className="mt-1 whitespace-pre-wrap break-words font-semibold">{delivery.address || "-"}</p>
                            {delivery.note ? (
                                <p className="mt-2 text-xs font-semibold text-[#184D47]/60">Catatan: {delivery.note}</p>
                            ) : null}
                        </div>
                        {delivery.labelUrl ? (
                            <a
                                href={delivery.labelUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#184D47]/20 bg-white px-3 text-xs font-black text-[#184D47] transition hover:bg-[#EAF1ED]"
                            >
                                Buka Label Biteship
                            </a>
                        ) : null}
                        <KasirShipmentActions
                            orderId={order.id}
                            canCreate={delivery.shipmentAction.canCreate}
                            canRefresh={delivery.shipmentAction.canRefresh}
                            hint={delivery.shipmentAction.hint}
                            syncLock={syncLockRef}
                            onShipmentSynced={applyShipmentSync}
                            onUpdated={loadDetail}
                        />
                        {hasActiveShipment ? (
                            <p className="text-[11px] font-semibold text-[#184D47]/50">
                                Status pengiriman juga diperbarui otomatis tiap 60 detik selama halaman ini terbuka dan
                                pengiriman masih aktif.
                            </p>
                        ) : null}
                    </section>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[#184D47]/50">
                        Cetak ulang struk selalu memakai data transaksi dan pengiriman terbaru yang tersimpan.
                    </p>
                    {/* Cetak ulang memakai jalur browser 58mm yang sama (#kasir-receipt, portal
                        dari KasirReceipt) sehingga struk berisi status & resi tersimpan terbaru. */}
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#184D47]/20 bg-white px-3 text-xs font-black text-[#184D47] transition hover:bg-[#EAF1ED] active:scale-95"
                    >
                        <Printer size={14} />
                        CETAK ULANG STRUK
                    </button>
                </div>
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
