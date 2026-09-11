// ---------------------------------------------------------------------------
// Core types for the AFA STORE universal thermal printer engine.
//
// Framework-agnostic: no React, no Supabase, no database access. Pure data
// contracts so the same encoder can back BLE, USB/LAN (future), and the browser
// fallback without coupling to a transport.
// ---------------------------------------------------------------------------

export type ThermalPaperWidth = 58 | 80;

export interface ThermalPrinterProfile {
    name: string;
    paperWidthMm: ThermalPaperWidth;
    // Number of monospace (font A) characters that fit one line at this width.
    // These are TUNING DEFAULTS, not a physical guarantee: printers vary by DPI
    // (203 vs 384), font, and printable margin. Adjust per device/font as needed.
    charactersPerLine: number;
    // Code page hint for text bytes. The encoder currently emits UTF-8 (the
    // de-facto default for modern BLE thermal printers). Kept as a profile
    // field so a code-page table can be swapped in without changing callers.
    encoding: string;
    // Max bytes per GATT write chunk. Configurable per printer firmware.
    chunkSize: number;
    // Auto-cutter (GS V). Disabled by default: many thermal printers have no
    // cutter, and cutting by default would emit an unsupported command on them.
    enableCut: boolean;
}

export type TextAlign = "left" | "center" | "right";

// One line item on a receipt. Currency is provided pre-formatted as labels by
// the caller so the engine stays purely about layout, not monetary formatting.
export interface ReceiptItem {
    name: string;
    size?: string | null;
    quantity: number;
    priceLabel: string;
    subtotalLabel: string;
}

// Neutral receipt payload. The engine never hardcodes a transaction; the kasir
// UI maps its currently open order onto this shape. Field names mirror the
// existing AFA STORE receipt so output stays identical.
export interface ReceiptData {
    storeName: string;
    invoice: string;
    date: string;
    customer: string;
    phone?: string | null;
    cashier?: string | null;
    items: ReceiptItem[];
    subtotalLabel: string;
    totalLabel: string;
    paymentMethod: string;
    paymentStatus: string;
    cashReceivedLabel?: string | null;
    changeLabel?: string | null;
    footer: string[];
}
