// ---------------------------------------------------------------------------
// High-level print service for AFA STORE kasir.
//
// Wires the ESC/POS encoder to the BLE transport and normalises every failure
// into a Bahasa Indonesia user message. It deliberately owns NO React state and
// NO persistence — the calling component keeps the connection only in page/session
// runtime state (never in localStorage/sessionStorage).
// ---------------------------------------------------------------------------

import {
    connectBluetoothPrinter,
    disconnectBluetoothPrinter,
    isBluetoothSupported,
    requestBluetoothPrinter,
    sendEscPos,
    type BluetoothConnection,
} from "./bluetooth-printer";
import { createReceipt } from "./escpos";
import type { ReceiptData, ThermalPaperWidth, ThermalPrinterProfile } from "./printer-types";
import { getPrinterProfile } from "./printer-config";

export type {
    BluetoothConnection,
} from "./bluetooth-printer";
export {
    chunkData,
    connectBluetoothPrinter,
    disconnectBluetoothPrinter,
    findWritableCharacteristic,
    isBluetoothSupported,
    requestBluetoothPrinter,
    sendEscPos,
} from "./bluetooth-printer";
export { createReceipt, formatColumns, formatReceiptLine, wrapText } from "./escpos";
export { getPrinterProfile, THERMAL_PRINTER_CONFIG, PAPER_WIDTHS } from "./printer-config";
export type {
    ReceiptData,
    ReceiptItem,
    TextAlign,
    ThermalPaperWidth,
    ThermalPrinterProfile,
} from "./printer-types";

export type PrintOutcome = {
    ok: boolean;
    message: string;
    canceled?: boolean;
};

const DEFAULT_FOOTER = ["Terima kasih telah berbelanja", "di AFA STORE"];

function mapError(error: unknown, fallback: string): { message: string; canceled?: boolean } {
    if (error instanceof DOMException) {
        if (error.name === "NotFoundError" || error.name === "AbortError") {
            return { message: "Pemilihan printer dibatalkan.", canceled: true };
        }
        if (error.name === "NotAllowedError" || error.name === "SecurityError") {
            return { message: "Izin Bluetooth ditolak. Aktifkan Bluetooth dan izinkan akses." };
        }
        if (error.name === "NetworkError") {
            return { message: "Printer tidak dapat terhubung." };
        }
    }
    if (error instanceof Error && error.message) {
        return { message: error.message };
    }
    return { message: fallback };
}

export function getThermalProfile(width: ThermalPaperWidth): ThermalPrinterProfile {
    return getPrinterProfile(width);
}

export function buildReceiptBytes(data: ReceiptData, width: ThermalPaperWidth): Uint8Array {
    return createReceipt(data, getPrinterProfile(width));
}

/**
 * Pick + connect a BLE printer. Called only from a user gesture.
 */
export async function pickAndConnect(): Promise<{ connection?: BluetoothConnection; message: string; canceled?: boolean }> {
    if (!isBluetoothSupported()) {
        return { message: "Browser tidak mendukung Bluetooth langsung." };
    }
    let device: BluetoothDevice | null = null;
    try {
        device = await requestBluetoothPrinter();
        if (!device) return { message: "Pemilihan printer dibatalkan.", canceled: true };

        const connection = await connectBluetoothPrinter(device);
        const name = device.name?.trim() || "EPPOS";
        return { connection, message: `${name} terhubung.` };
    } catch (error) {
        if (device?.gatt?.connected) disconnectBluetoothPrinter(device);
        const mapped = mapError(error, "Printer tidak dapat terhubung.");
        return { message: mapped.message, canceled: mapped.canceled };
    }
}

/**
 * Encode + send the receipt for the chosen paper width. Returns a user message.
 */
export async function printReceiptBluetooth(
    connection: BluetoothConnection,
    data: ReceiptData,
    width: ThermalPaperWidth,
    onProgress?: (sent: number, total: number) => void,
): Promise<PrintOutcome> {
    try {
        const profile = getPrinterProfile(width);
        const bytes = createReceipt(data, profile);
        await sendEscPos(connection, bytes, profile, onProgress);
        return { ok: true, message: "Struk berhasil dikirim ke printer." };
    } catch (error) {
        const mapped = mapError(error, "Struk gagal dikirim ke printer.");
        return { ok: false, message: mapped.message };
    }
}

export type UnifiedPrintResult =
    | { ok: true; message: string; connection?: BluetoothConnection }
    | { ok: false; allowFallback: boolean; message: string; connection?: BluetoothConnection };

/**
 * Single entry point for the kasir "Print" button.
 *
 * Decides the path automatically:
 *   - reuse an already-connected BLE printer and print immediately;
 *   - otherwise, if Web Bluetooth is available, pick + connect + print in one
 *     user gesture (the `pick` callback MUST be bound to a click);
 *   - otherwise, report a fallback opportunity (browser print) instead of
 *     pretending to support Bluetooth.
 */
export async function printReceipt(opts: {
    data: ReceiptData;
    width: ThermalPaperWidth;
    connection: BluetoothConnection | null;
    pick: () => Promise<{ connection?: BluetoothConnection; message: string; canceled?: boolean }>;
}): Promise<UnifiedPrintResult> {
    const { data, width, connection, pick } = opts;

    // 1. Reuse an existing live connection.
    if (connection && connection.device.gatt?.connected) {
        const outcome = await printReceiptBluetooth(connection, data, width);
        if (outcome.ok) return { ok: true, message: "Struk berhasil dicetak.", connection };
        return { ok: false, allowFallback: false, message: outcome.message, connection };
    }

    // 2. No Web Bluetooth -> browser fallback (never fake Bluetooth support).
    if (!isBluetoothSupported()) {
        return { ok: false, allowFallback: true, message: "Browser tidak mendukung Bluetooth langsung." };
    }

    // 3. Pick + connect, still within the click's user activation.
    const picked = await pick();
    if (picked.connection) {
        const outcome = await printReceiptBluetooth(picked.connection, data, width);
        if (outcome.ok) return { ok: true, message: "Struk berhasil dicetak.", connection: picked.connection };
        return { ok: false, allowFallback: false, message: outcome.message, connection: picked.connection };
    }

    // Canceled picker, no writable characteristic, or Classic/SPP: offer fallback.
    return { ok: false, allowFallback: true, message: picked.message };
}

export const THERMAL_FOOTER = DEFAULT_FOOTER;
