"use client";

// TAHAP E: thermal receipt for kasir transactions (browser print only).
// Pure presentational + read-only. Renders nothing on screen (hidden), and is
// revealed only under `@media print` via `#kasir-receipt` in globals.css.
// It reads the already-persisted order from GET /api/admin/kasir/orders/[id]
// and never POSTs, never mutates stock/payment/order, and never re-prices items.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { formatDate, formatRupiah, paymentMethodLabel, sourceLabel, type KasirOrderDetail } from "./kasir-shared";

export default function KasirReceipt({ order }: { order: KasirOrderDetail }) {
    // Portal to <body> so the receipt can be the only visible element in print,
    // independent of the admin page tree. Guarded for SSR to avoid hydration mismatch.
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const isTunai = order.paymentMethod === "TUNAI";

    const receipt = (
        <div id="kasir-receipt" className="text-black">
            <div className="mx-auto w-[58mm] px-[4mm] py-[4mm] font-mono text-[11px] leading-snug">
                {/* Header */}
                <div className="text-center">
                    <Image
                        src="/AFA LOGO.svg"
                        alt="AFA STORE"
                        width={48}
                        height={48}
                        unoptimized
                        priority
                        className="mx-auto h-12 w-auto object-contain grayscale"
                    />
                    <p className="mt-1 text-base font-black leading-none">AFA STORE</p>
                </div>

                <Divider />

                {/* Meta */}
                <dl className="space-y-0.5">
                    <Row label="Invoice" value={order.invoice} />
                    <Row label="Tanggal" value={formatDate(order.createdAt)} />
                    <Row label="Pelanggan" value={order.customer || "-"} />
                    {order.phone ? <Row label="WhatsApp" value={order.phone} /> : null}
                    <Row label="Sumber" value={sourceLabel(order.source)} />
                </dl>

                <Divider />

                {/* Items */}
                <div className="space-y-1.5">
                    {order.items.map((item) => (
                        <div key={item.id}>
                            <p className="font-bold leading-tight">{item.name}</p>
                            {item.size ? <p className="text-[10px] leading-tight">{item.size}</p> : null}
                            <div className="flex justify-between">
                                <span>{item.quantity} x {formatRupiah(item.price)}</span>
                                <span>{formatRupiah(item.subtotal)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <Divider />

                {/* Totals */}
                <dl className="space-y-0.5">
                    <Row label="Subtotal" value={formatRupiah(order.subtotal)} />
                    <div className="flex justify-between text-[13px] font-black">
                        <span>TOTAL</span>
                        <span>{formatRupiah(order.total)}</span>
                    </div>
                </dl>

                <Divider />

                {/* Payment */}
                <dl className="space-y-0.5">
                    <Row label="Metode Pembayaran" value={paymentMethodLabel(order.paymentMethod)} />
                    {isTunai ? (
                        <>
                            <Row label="Uang Diterima" value={order.cashReceived != null ? formatRupiah(order.cashReceived) : "-"} />
                            <Row label="Kembalian" value={order.change != null ? formatRupiah(order.change) : "-"} />
                        </>
                    ) : null}
                    <div className="flex justify-between font-black">
                        <span>Status</span>
                        <span>LUNAS</span>
                    </div>
                </dl>

                <Divider />

                {/* Footer */}
                <footer className="pt-1 text-center">
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
    return <div className="my-1.5 border-t border-dashed border-black" />;
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-2">
            <dt className="shrink-0">{label}</dt>
            <dd className="text-right">{value}</dd>
        </div>
    );
}
