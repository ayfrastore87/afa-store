"use client";

// TAHAP E: thermal receipt for kasir transactions (browser print only).
// Pure presentational + read-only. Renders nothing on screen (hidden), and is
// revealed only under `@media print` via `#kasir-receipt` in globals.css.
// It reads the already-persisted order from GET /api/admin/kasir/orders/[id]
// and never POSTs, never mutates stock/payment/order, and never re-prices items.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { kasirOrderTypeLabel } from "@/lib/kasir-delivery";
import {
    formatDate,
    formatRupiah,
    paymentMethodLabel,
    sourceLabel,
    statusLabel,
    type KasirOrderDetail,
} from "./kasir-shared";

export default function KasirReceipt({
    order,
    cashierName,
}: {
    order: KasirOrderDetail;
    /** Nama petugas aktif dari respons server kasir (admin-authorized). */
    cashierName?: string | null;
}) {
    // Portal to <body> so the receipt can be the only visible element in print,
    // independent of the admin page tree. Guarded for SSR to avoid hydration mismatch.
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Kasir (petugas) TIDAK dibaca dari /api/auth/me: endpoint itu customer-only dan
    // selalu menjawab { user: null } untuk sesi admin, sehingga halaman kasir memicu
    // request gagal berulang. Identitas petugas kini ikut payload order dari
    // GET /api/admin/kasir/orders/[id] (sudah diverifikasi server-side).
    // Bila nama tidak tersedia, baris "Kasir" cukup tidak ditampilkan.

    const isTunai = order.paymentMethod === "TUNAI";
    // PENGIRIMAN block: present for a delivery order only (null for pickup).
    const delivery = order.delivery;

    const receipt = (
        <div id="kasir-receipt">
            <div className="receipt-sheet">
                {/* Header */}
                <div className="receipt-header">
                    <p className="receipt-store">AFA_STORE</p>
                    <p className="receipt-contact">WA 087770000883</p>
                    <p className="receipt-contact">afastore.online</p>
                </div>

                <Divider />

                {/* Meta */}
                <dl className="receipt-meta">
                    <Row label="Invoice" value={order.invoice} />
                    <Row label="Tanggal" value={formatDate(order.createdAt)} />
                    <Row label="Pelanggan" value={order.customer || "-"} />
                    {order.phone ? <Row label="WhatsApp" value={order.phone} /> : null}
                    {cashierName ? <Row label="Kasir" value={cashierName} /> : null}
                </dl>

                <Divider />

                {/* Items */}
                <div className="receipt-items">
                    {order.items.map((item) => (
                        <div key={item.id} className="receipt-item">
                            <p className="receipt-item-name">{item.name}</p>
                            {item.size ? <p className="receipt-item-size">{item.size}</p> : null}
                            <div className="receipt-item-row">
                                <span>{item.quantity} x {formatRupiah(item.price)}</span>
                                <span>{formatRupiah(item.subtotal)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <Divider />

                {/* Totals */}
                <dl className="receipt-meta">
                    <Row label="Subtotal" value={formatRupiah(order.subtotal)} />
                    {delivery && delivery.shipping > 0 ? (
                        <Row label="Ongkir" value={formatRupiah(delivery.shipping)} />
                    ) : null}
                    <div className="receipt-total">
                        <span>TOTAL</span>
                        <span>{formatRupiah(order.total)}</span>
                    </div>
                </dl>

                <Divider />

                {/* Payment */}
                <dl className="receipt-meta">
                    <Row label="Metode" value={paymentMethodLabel(order.paymentMethod)} />
                    {isTunai ? (
                        <>
                            <Row label="Uang Diterima" value={order.cashReceived != null ? formatRupiah(order.cashReceived) : "-"} />
                            <Row label="Kembalian" value={order.change != null ? formatRupiah(order.change) : "-"} />
                        </>
                    ) : null}
                    <Row label="Sumber" value={sourceLabel(order.source)} />
                    <Row label="Status Bayar" value={statusLabel(order.paymentStatus)} bold />
                </dl>

                {/* PENGIRIMAN — delivery orders only. Public data only: no Biteship area id,
                    quote ref, provider order id, coordinate or secret is ever rendered here. */}
                {delivery ? (
                    <>
                        <Divider />
                        <p className="receipt-section-title">PENGIRIMAN</p>
                        <dl className="receipt-meta">
                            <Row label="Jenis" value={kasirOrderTypeLabel(order.orderType)} />
                            <Row label="Nama Penerima" value={delivery.recipientName || "-"} />
                            <Row label="No. WhatsApp" value={delivery.recipientPhone || "-"} />
                            {delivery.courier ? <Row label="Kurir" value={delivery.courier} /> : null}
                            {delivery.service ? <Row label="Layanan" value={delivery.service} /> : null}
                            <Row label="Ongkir" value={formatRupiah(delivery.shipping)} />
                            {/* Status dari data PERSISTED terbaru: cetak ulang setelah
                                pembaruan status pengiriman selalu menampilkan status terkini. */}
                            <Row label="Status Pengiriman" value={delivery.status.label} />
                            {delivery.trackingId ? <Row label="No. Resi / Tracking" value={delivery.trackingId} /> : null}
                        </dl>
                        <p className="receipt-address-label">Alamat Pengiriman</p>
                        <p className="receipt-address">{delivery.address || "-"}</p>
                        {delivery.note ? <p className="receipt-address-note">Catatan: {delivery.note}</p> : null}
                    </>
                ) : null}

                <Divider />

                {/* Footer */}
                <footer className="receipt-footer">
                    <p>Terima kasih telah berbelanja</p>
                    <p>di AFA STORE</p>
                </footer>
            </div>
        </div>
    );

    if (!mounted) return null;
    return createPortal(receipt, document.body);
}

function Divider() {
    return <div className="receipt-divider" />;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className={bold ? "receipt-row receipt-row-bold" : "receipt-row"}>
            <dt className="receipt-row-label">{label}</dt>
            <dd className="receipt-row-value">{value}</dd>
        </div>
    );
}
