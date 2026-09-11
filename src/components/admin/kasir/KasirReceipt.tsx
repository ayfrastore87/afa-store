"use client";

// TAHAP E: thermal receipt for kasir transactions (browser print only).
// Pure presentational + read-only. Renders nothing on screen (hidden), and is
// revealed only under `@media print` via `#kasir-receipt` in globals.css.
// It reads the already-persisted order from GET /api/admin/kasir/orders/[id]
// and never POSTs, never mutates stock/payment/order, and never re-prices items.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { formatDate, formatRupiah, paymentMethodLabel, statusLabel, type KasirOrderDetail } from "./kasir-shared";

export default function KasirReceipt({ order }: { order: KasirOrderDetail }) {
    // Portal to <body> so the receipt can be the only visible element in print,
    // independent of the admin page tree. Guarded for SSR to avoid hydration mismatch.
    const [mounted, setMounted] = useState(false);
    const [cashierName, setCashierName] = useState("");

    useEffect(() => {
        setMounted(true);
    }, []);

    // Kasir (petugas) dibaca read-only dari sesi aktif. Tanpa perubahan auth/db;
    // jika gagal, baris "Kasir" cukup tidak ditampilkan (struk tetap valid).
    useEffect(() => {
        if (!mounted) return;
        let cancelled = false;
        void fetch("/api/auth/me", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { user?: { name?: string } | null } | null) => {
                if (!cancelled && data?.user?.name) setCashierName(data.user.name);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [mounted]);

    const isTunai = order.paymentMethod === "TUNAI";

    const receipt = (
        <div id="kasir-receipt">
            <div className="receipt-sheet">
                {/* Header */}
                <div className="receipt-header">
                    <Image
                        src="/AFA LOGO.svg"
                        alt="AFA STORE"
                        width={56}
                        height={56}
                        unoptimized
                        priority
                        className="receipt-logo"
                    />
                    <p className="receipt-store">AFA STORE</p>
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
                    <Row label="Status Bayar" value={statusLabel(order.paymentStatus)} bold />
                </dl>

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
