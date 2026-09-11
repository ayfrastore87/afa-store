"use client";

// ---------------------------------------------------------------------------
// PRINTER panel for the kasir transaction detail page.
//
// - "Cetak Browser" keeps the existing window.print() 58mm CSS flow untouched.
// - "Cetak Bluetooth" encodes the SAME receipt data via ESC/POS and sends it
//   over BLE. Paper size (58/80mm) only selects the ESC/POS profile; it never
//   mutates the order or the database.
// - Connection lives only in this component's runtime state; no credentials,
//   tokens, or Bluetooth handles are persisted anywhere.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bluetooth, Cable, CheckCircle2, Loader2, Printer, Settings2, Unplug } from "lucide-react";
import {
    isBluetoothSupported,
    pickAndConnect,
    printReceiptBluetooth,
    disconnectBluetoothPrinter,
    PAPER_WIDTHS,
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

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export default function KasirPrinterPanel({ order }: { order: KasirOrderDetail }) {
    const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(58);
    const [connection, setConnection] = useState<BluetoothConnection | null>(null);
    const [status, setStatus] = useState<ConnectionStatus>("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [printing, setPrinting] = useState(false);
    const [printMessage, setPrintMessage] = useState("");
    const [bleSupported] = useState<boolean>(() => (typeof window !== "undefined" ? isBluetoothSupported() : false));

    const deviceName = connection?.device.name?.trim() || "EPPOS";

    const receiptData: ReceiptData = useMemo(() => toReceiptData(order), [order]);

    const handleConnect = useCallback(async () => {
        setStatus("connecting");
        setStatusMessage("Menghubungkan printer...");
        const result = await pickAndConnect();
        if (result.connection) {
            setConnection(result.connection);
            setStatus("connected");
            setStatusMessage(result.message);
        } else {
            setConnection(null);
            setStatus("error");
            setStatusMessage(result.message);
        }
    }, []);

    const handleDisconnect = useCallback(() => {
        disconnectBluetoothPrinter(connection?.device);
        setConnection(null);
        setStatus("idle");
        setStatusMessage("");
        setPrintMessage("");
    }, [connection]);

    const handlePrintBluetooth = useCallback(async () => {
        if (!connection) return;
        setPrinting(true);
        setPrintMessage("");
        const outcome = await printReceiptBluetooth(connection, receiptData, paperWidth);
        setPrintMessage(outcome.message);
        setPrinting(false);
    }, [connection, receiptData, paperWidth]);

    // Warn if the printer was disconnected behind our back (e.g. powered off).
    useEffect(() => {
        if (connection && typeof connection.device.gatt !== "undefined") {
            const onDisconnect = () => {
                setConnection(null);
                setStatus("error");
                setStatusMessage("Printer terputus.");
            };
            connection.device.addEventListener("gattserverdisconnected", onDisconnect);
            return () => connection.device.removeEventListener("gattserverdisconnected", onDisconnect);
        }
    }, [connection]);

    const connected = status === "connected" && connection != null;

    return (
        <section className="rounded-2xl border border-[#184D47]/10 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Printer size={18} className="text-[#C9A45B]" />
                    <h3 className="text-sm font-black uppercase tracking-[0.15em] text-[#184D47]/70">Printer</h3>
                </div>
            </div>

            {/* Pilih printer (user gesture — never auto-scans). */}
            <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={!bleSupported || status === "connecting"}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#184D47]/15 bg-white px-4 font-bold text-[#184D47] transition hover:bg-white/80 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
                {status === "connecting" ? <Loader2 size={16} className="animate-spin" /> : <Settings2 size={16} />}
                {connected ? "Ganti Printer" : "Pilih Printer"}
            </button>

            {/* Paper size selector (profile only). */}
            <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-bold text-[#184D47]/60">Paper:</span>
                <select
                    value={paperWidth}
                    onChange={(e) => setPaperWidth(Number(e.target.value) as ThermalPaperWidth)}
                    className="rounded-lg border border-[#184D47]/15 bg-[#f8f6f0] px-2 py-1.5 text-sm font-bold text-[#184D47]"
                >
                    {PAPER_WIDTHS.map((w) => (
                        <option key={w} value={w}>
                            {w} mm
                        </option>
                    ))}
                </select>
            </div>

            {/* Connection status. */}
            <div className="mt-3 rounded-xl bg-[#f8f6f0] px-3 py-2.5 text-sm">
                {connected ? (
                    <p className="flex items-center gap-2 font-bold text-emerald-700">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        {deviceName}
                        <span className="text-[#184D47]/60">· Bluetooth Connected</span>
                    </p>
                ) : (
                    <p className="flex items-center gap-2 font-bold text-[#184D47]/60">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                        Belum terhubung
                    </p>
                )}
                {statusMessage ? <p className="mt-1 text-xs text-[#184D47]/70">{statusMessage}</p> : null}
            </div>

            {/* Transport distinction (BLE direct vs Classic/bridge). */}
            <div className="mt-2 flex items-center gap-2 text-xs text-[#184D47]/50">
                <Bluetooth size={13} />
                <span>BLE Direct (GATT)</span>
                <span className="text-[#184D47]/30">·</span>
                <Cable size={13} />
                <span>Bluetooth Classic → Bridge</span>
            </div>

            {/* Actions. */}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={() => void handlePrintBluetooth()}
                    disabled={!connected || printing}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#184D47] px-4 font-black text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {printing ? <Loader2 size={16} className="animate-spin" /> : <Bluetooth size={16} />}
                    Cetak Bluetooth
                </button>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#184D47]/15 bg-white px-4 font-bold text-[#184D47] transition hover:bg-white/80 active:scale-[0.99]"
                >
                    <Printer size={16} />
                    Cetak Browser
                </button>
            </div>

            {connected ? (
                <button
                    type="button"
                    onClick={handleDisconnect}
                    className="mt-2 inline-flex h-9 items-center gap-2 px-2 text-xs font-bold text-red-600 transition hover:underline"
                >
                    <Unplug size={14} />
                    Putuskan koneksi
                </button>
            ) : null}

            {printMessage ? (
                <p className={`mt-2 flex items-center gap-2 text-sm font-bold ${printMessage.includes("berhasil") ? "text-emerald-700" : "text-amber-700"}`}>
                    <CheckCircle2 size={15} />
                    {printMessage}
                </p>
            ) : null}

            {!bleSupported ? (
                <p className="mt-3 text-xs font-semibold text-amber-700">
                    Browser tidak mendukung Bluetooth langsung. Gunakan Chrome/Edge di desktop atau Android.
                </p>
            ) : null}
        </section>
    );
}


function toReceiptData(order: KasirOrderDetail): ReceiptData {
    const isTunai = order.paymentMethod === "TUNAI";
    return {
        storeName: "AFA STORE",
        invoice: order.invoice,
        date: formatDate(order.createdAt),
        customer: order.customer || "-",
        phone: order.phone || null,
        cashier: null, // read separately by the browser receipt; kept null here
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
        footer: ["Terima kasih telah berbelanja", "di AFA STORE"],
    };
}

