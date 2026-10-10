"use client";

// Browser-print receipt for ONE pre-order payment (DP / cicilan / pelunasan).
// Renders a neutral ReceiptData through the SAME #kasir-receipt print CSS used
// by KasirReceipt, so the paper layout is identical. Pure presentational: it
// reads already-persisted data and never mutates anything.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Printer } from "lucide-react";
import { pickAndConnect, printReceipt, type BluetoothConnection, type ReceiptData } from "@/lib/thermal-printer/thermal-print-service";
import { toPreOrderReceiptData, type PreOrderPaymentView, type PreOrderView } from "./pre-order-shared";

export function PreOrderReceiptSheet({ data }: { data: ReceiptData }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const sheet = (
        <div id="kasir-receipt">
            <div className="receipt-sheet">
                <div className="receipt-header">
                    <p className="receipt-store">{data.storeName}</p>
                    {(data.storeAddress ?? []).map((line) => <p key={line} className="receipt-contact">{line}</p>)}
                    {data.title ? <p className="receipt-contact" style={{ fontWeight: 700 }}>{data.title}</p> : null}
                </div>
                <div className="receipt-divider" />
                <dl className="receipt-meta">
                    <Row label="No. PO" value={data.invoice} />
                    <Row label="Tanggal" value={data.date} />
                    <Row label="Pelanggan" value={data.customer} />
                    {data.phone ? <Row label="WhatsApp" value={data.phone} /> : null}
                    {data.cashier ? <Row label="Kasir" value={data.cashier} /> : null}
                </dl>
                <div className="receipt-divider" />
                <div className="receipt-items">
                    {data.items.map((item, index) => (
                        <div key={`${item.name}-${index}`} className="receipt-item">
                            <p className="receipt-item-name">{item.name}</p>
                            {item.size ? <p className="receipt-item-size">Catatan: {item.size}</p> : null}
                            <div className="receipt-item-row"><span>{item.quantity} x {item.priceLabel}</span><span>{item.subtotalLabel}</span></div>
                        </div>
                    ))}
                </div>
                <div className="receipt-divider" />
                <dl className="receipt-meta">
                    <Row label="Subtotal" value={data.subtotalLabel} />
                    <div className="receipt-total"><span>TOTAL PO</span><span>{data.totalLabel}</span></div>
                </dl>
                <div className="receipt-divider" />
                <dl className="receipt-meta">
                    <Row label="Metode" value={data.paymentMethod} />
                    {data.cashReceivedLabel ? <Row label="Uang Diterima" value={data.cashReceivedLabel} /> : null}
                    {data.changeLabel ? <Row label="Kembalian" value={data.changeLabel} /> : null}
                    {(data.extraPaymentRows ?? []).map(([label, value]) => <Row key={label} label={label} value={value} bold={label === "Sisa Tagihan"} />)}
                    <Row label="Status Bayar" value={data.paymentStatus} bold />
                </dl>
                <div className="receipt-divider" />
                <footer className="receipt-footer">{data.footer.map((line) => <p key={line}>{line}</p>)}</footer>
            </div>
        </div>
    );
    if (!mounted) return null;
    return createPortal(sheet, document.body);
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className={bold ? "receipt-row receipt-row-bold" : "receipt-row"}>
            <dt className="receipt-row-label">{label}</dt>
            <dd className="receipt-row-value">{value}</dd>
        </div>
    );
}

/** Print button (BLE thermal -> browser fallback), same orchestration as KasirPrinterPanel. */
export default function PreOrderPrintButton({
    preOrder,
    payment,
    cashierName,
    compact,
}: {
    preOrder: PreOrderView;
    payment: PreOrderPaymentView;
    cashierName?: string | null;
    compact?: boolean;
}) {
    const [connection, setConnection] = useState<BluetoothConnection | null>(null);
    const [printing, setPrinting] = useState(false);
    const [message, setMessage] = useState("");
    const data = useMemo(() => toPreOrderReceiptData(preOrder, payment, cashierName), [preOrder, payment, cashierName]);

    const handlePrint = useCallback(async () => {
        if (printing) return;
        setPrinting(true);
        setMessage("");
        try {
            const result = await printReceipt({ data, width: 58, connection, pick: pickAndConnect });
            if (result.connection) setConnection(result.connection);
            if (result.ok) {
                setMessage(result.message);
                return;
            }
            if (result.allowFallback && !compact && window.confirm(result.message + "\n\nGunakan Cetak Browser sebagai gantinya?")) {
                window.print();
                return;
            }
            setMessage(result.message);
        } finally {
            setPrinting(false);
        }
    }, [compact, connection, data, printing]);

    const buttonClass = compact
        ? "inline-flex h-9 items-center gap-1 rounded-lg border border-[#184D47]/30 px-3 text-xs font-bold text-[#184D47] hover:bg-[#184D47]/5 disabled:opacity-60"
        : "inline-flex h-12 items-center gap-2 rounded-2xl bg-[#184D47] px-4 font-black text-white hover:brightness-110 active:scale-95 disabled:opacity-60";

    // Only the primary (non-compact) button owns the single #kasir-receipt print
    // sheet; compact per-row buttons print via BLE only and never duplicate the id.
    return (
        <div className="flex flex-col items-end gap-1">
            {!compact ? <PreOrderReceiptSheet data={data} /> : null}
            <button type="button" onClick={() => void handlePrint()} disabled={printing} aria-label="Cetak struk pre-order" className={buttonClass}>
                {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                <span>Cetak Struk</span>
            </button>
            {message ? <p className="max-w-[220px] text-right text-xs font-semibold text-[#184D47]/70">{message}</p> : null}
        </div>
    );
}
