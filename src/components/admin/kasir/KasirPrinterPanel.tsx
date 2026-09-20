"use client";

// ---------------------------------------------------------------------------
// UNIFIED PRINT for the kasir transaction detail page.
//
// A single "Print" button drives the whole flow:
//   1. Reuse an already-connected BLE printer -> send ESC/POS immediately.
//   2. No connection but Web Bluetooth available -> open the device picker,
//      connect, encode, and send in the same user gesture.
//   3. Web Bluetooth unsupported / picker canceled / no BLE writable
//      characteristic / Bluetooth Classic (SPP) -> offer the browser print
//      fallback via a simple confirm dialog.
//
// The orchestration entry point is printReceipt() in thermal-print-service.ts.
// This component only owns runtime state; the Bluetooth connection lives in
// memory and is never persisted to any browser storage.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import {
    pickAndConnect,
    printReceipt,
    type BluetoothConnection,
    type ReceiptData,
    type ThermalPaperWidth,
} from "@/lib/thermal-printer/thermal-print-service";
import {
    formatDate,
    formatRupiah,
    paymentMethodLabel,
    statusLabel,
    type KasirOrderDetail,
} from "./kasir-shared";

// Single source of truth for paper width. No on-page selector: the kasir flow
// keeps one clean button. Change this to 80 to switch the ESC/POS profile.
const DEFAULT_PAPER_WIDTH: ThermalPaperWidth = 58;

export default function KasirPrinterPanel({
    order,
    cashierName: cashierNameProp,
}: {
    order: KasirOrderDetail;
    /** Nama petugas aktif dari respons server kasir (admin-authorized). */
    cashierName?: string | null;
}) {
    const [connection, setConnection] = useState<BluetoothConnection | null>(null);
    const [printing, setPrinting] = useState(false);
    const [message, setMessage] = useState("");

    // Kasir (petugas) untuk baris "Kasir" pada struk. Identitasnya datang bersama payload
    // order dari GET /api/admin/kasir/orders/[id]. Endpoint /api/auth/me TIDAK dipakai lagi:
    // ia customer-only dan selalu menjawab { user: null } untuk sesi admin, sehingga halaman
    // kasir memicu request gagal berulang tanpa manfaat.
    const cashierName = cashierNameProp ?? "";

    const receiptData: ReceiptData = useMemo(() => toReceiptData(order, cashierName), [order, cashierName]);

    const handlePrint = useCallback(async () => {
        if (printing) return;
        setPrinting(true);
        setMessage("");
        try {
            const result = await printReceipt({
                data: receiptData,
                width: DEFAULT_PAPER_WIDTH,
                connection,
                pick: pickAndConnect,
            });
            if (result.connection) setConnection(result.connection);
            if (result.ok) {
                setMessage(result.message);
                return;
            }
            if (result.allowFallback) {
                const useBrowser = window.confirm(
                    result.message + "\n\nGunakan Cetak Browser sebagai gantinya?",
                );
                if (useBrowser) {
                    setMessage("");
                    window.print();
                    return;
                }
            }
            setMessage(result.message);
        } finally {
            setPrinting(false);
        }
    }, [connection, printing, receiptData]);

    // Clear a stale connection if the printer drops behind our back.
    useEffect(() => {
        if (connection && typeof connection.device.gatt !== "undefined") {
            const onDisconnect = () => setConnection(null);
            connection.device.addEventListener("gattserverdisconnected", onDisconnect);
            return () => connection.device.removeEventListener("gattserverdisconnected", onDisconnect);
        }
        return undefined;
    }, [connection]);

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={printing}
                aria-label="Print"
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#184D47] px-4 font-black text-white transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {printing ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                <span>Print</span>
            </button>
            {message ? (
                <p className="max-w-[220px] text-right text-xs font-semibold leading-snug text-[#184D47]/70">
                    {message}
                </p>
            ) : null}
        </div>
    );
}


function toReceiptData(order: KasirOrderDetail, cashierName: string): ReceiptData {
    const isTunai = order.paymentMethod === "TUNAI";
    // PENGIRIMAN block: delivery orders only. It is built from the SAME server payload
    // that already excludes internal identifiers (area id / quote ref / provider order id).
    const delivery = order.delivery;
    return {
        storeName: "AFA STORE",
        invoice: order.invoice,
        date: formatDate(order.createdAt),
        customer: order.customer || "-",
        phone: order.phone || null,
        cashier: cashierName || null,
        items: order.items.map((item) => ({
            name: item.name,
            size: item.size,
            quantity: item.quantity,
            priceLabel: formatRupiah(item.price),
            subtotalLabel: formatRupiah(item.subtotal),
        })),
        subtotalLabel: formatRupiah(order.subtotal),
        totalLabel: formatRupiah(order.total),
        paymentMethod: paymentMethodLabel(order.paymentMethod),
        paymentStatus: statusLabel(order.paymentStatus),
        cashReceivedLabel: isTunai && order.cashReceived != null ? formatRupiah(order.cashReceived) : null,
        changeLabel: isTunai && order.change != null ? formatRupiah(order.change) : null,
        // Ongkir only exists on a delivery order (a pickup order has no shipping row).
        shippingLabel: delivery && delivery.shipping > 0 ? formatRupiah(delivery.shipping) : null,
        delivery: delivery
            ? {
                recipientName: delivery.recipientName || "-",
                recipientPhone: delivery.recipientPhone || "-",
                address: delivery.address || "-",
                courier: delivery.courier,
                service: delivery.service,
                // Printed only when the integration really returned a resi / tracking id.
                trackingId: delivery.trackingId,
                shippingLabel: formatRupiah(delivery.shipping),
                // Latest PERSISTED normalized status, so a reprint after a tracking
                // update carries the current state and never a stale one.
                status: delivery.status.label,
            }
            : null,
        footer: ["Terima kasih telah berbelanja", "di AFA STORE"],
        storeAddress: [
            "AFA STORE",
            "",
            "WA 087770000883",
            "afastore.online",
        ],
    };
}
