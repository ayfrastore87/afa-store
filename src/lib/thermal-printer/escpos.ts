// ---------------------------------------------------------------------------
// Reusable ESC/POS encoder for AFA STORE thermal printing.
//
// Framework-agnostic and transport-agnostic: produces a `Uint8Array` that can
// be sent over BLE GATT, USB/LAN (future), or any bridge. The browser fallback
// is separate (window.print + CSS) and is NOT routed through this encoder.
//
// Supported commands (kept intentionally small and widely compatible):
//   ESC @   initialize printer
//   ESC a   select justification (left/center/right)
//   ESC E   bold on/off
//   GS !    character size (width/height doubling)
//   LF      line feed
//   ESC d   feed n lines
//   GS V    cut (partial) — emitted only when `profile.enableCut` is true
// ---------------------------------------------------------------------------

import type {
    ReceiptData,
    ReceiptItem,
    TextAlign,
    ThermalPrinterProfile,
} from "./printer-types";

const ESC = 0x1b;
const GS = 0x1d;

const ALIGN: Record<TextAlign, number> = {
    left: 0x00,
    center: 0x01,
    right: 0x02,
};

// GS ! size byte: high nibble = width scale-1, low nibble = height scale-1.
const SIZE = {
    normal: 0x00,
    doubleWidth: 0x10,
    doubleHeight: 0x01,
    doubleBoth: 0x11,
} as const;

const encoder = new TextEncoder();

function encode(text: string): Uint8Array {
    return encoder.encode(text);
}

function concat(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Text layout helpers (shared by ESC/POS and any future textual transports).
// Wrapping is code-point aware so multi-byte UTF-8 (e.g. "Rp", emoji, accents)
// is counted as one cell, matching the monospace receipt grid closely.
// ---------------------------------------------------------------------------

function codePoints(text: string): string[] {
    return Array.from(text);
}

/** Wrap `text` into an array of lines no longer than `width` characters. */
export function wrapText(text: string, width: number): string[] {
    if (width <= 0) return [text];
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) return [];

    const lines: string[] = [];
    let current = "";

    for (const word of words) {
        const candidate = current === "" ? word : `${current} ${word}`;
        if (codePoints(candidate).length <= width) {
            current = candidate;
            continue;
        }
        if (current !== "") lines.push(current);
        // Hard-break words longer than the line width.
        const parts = codePoints(word);
        while (parts.length > width) {
            lines.push(parts.slice(0, width).join(""));
            parts.splice(0, width);
        }
        current = parts.join("");
    }

    if (current !== "") lines.push(current);
    return lines;
}

function pad(text: string, width: number, align: TextAlign): string {
    const cells = codePoints(text);
    if (cells.length >= width) return cells.slice(0, width).join("");
    const gap = width - cells.length;
    if (align === "left") return text + " ".repeat(gap);
    if (align === "right") return " ".repeat(gap) + text;
    const left = Math.floor(gap / 2);
    const right = gap - left;
    return " ".repeat(left) + text + " ".repeat(right);
}

/**
 * Format a single line: apply justification and truncate/pad to `width`.
 * Never overflows the printable area.
 */
export function formatReceiptLine(text: string, width: number, align: TextAlign = "left"): string {
    return pad(text, width, align);
}

/**
 * Build a two-column line (label left, value right). Long labels are wrapped
 * first so the value always stays visible on the same logical block without
 * overflowing the paper width.
 */
export function formatColumns(left: string, right: string, width: number): string[] {
    const rightCells = codePoints(right).length;
    const labelWidth = Math.max(1, width - rightCells - 1);
    const labelLines = wrapText(left, labelWidth);

    const out: string[] = [];
    labelLines.forEach((label, index) => {
        if (index === labelLines.length - 1) {
            const labelCells = codePoints(label).length;
            const gap = Math.max(1, width - labelCells - rightCells);
            out.push(label + " ".repeat(gap) + right);
        } else {
            out.push(label);
        }
    });
    return out;
}

// ---------------------------------------------------------------------------
// Low-level command helpers.
// ---------------------------------------------------------------------------

function cmdInitialize(): Uint8Array {
    return new Uint8Array([ESC, 0x40]); // ESC @
}

function cmdAlign(align: TextAlign): Uint8Array {
    return new Uint8Array([ESC, 0x61, ALIGN[align]]); // ESC a n
}

function cmdBold(on: boolean): Uint8Array {
    return new Uint8Array([ESC, 0x45, on ? 1 : 0]); // ESC E n
}

function cmdSize(size: number): Uint8Array {
    return new Uint8Array([GS, 0x21, size]); // GS ! n
}

function cmdFeed(lines: number): Uint8Array {
    return new Uint8Array([ESC, 0x64, lines & 0xff]); // ESC d n
}

function cmdCut(): Uint8Array {
    // GS V 66 0 = partial cut (leaves a small tag so the paper doesn't fall).
    return new Uint8Array([GS, 0x56, 66, 0]);
}

function cmdLine(text: string): Uint8Array {
    return concat([encode(text), new Uint8Array([0x0a])]); // text + LF
}

function dividerLine(width: number): string {
    return "-".repeat(width);
}


// ---------------------------------------------------------------------------
// Receipt assembly.
// ---------------------------------------------------------------------------

/**
 * Build the full receipt as a `Uint8Array` of ESC/POS bytes. The layout mirrors
 * the existing AFA STORE browser receipt exactly:
 * store header → meta → items → totals → payment → footer.
 */
export function createReceipt(data: ReceiptData, profile: ThermalPrinterProfile): Uint8Array {
    const width = profile.charactersPerLine;
    const chunks: Uint8Array[] = [cmdInitialize()];

    // Store header (centered, double width/height).
    chunks.push(cmdAlign("center"), cmdSize(SIZE.doubleBoth));
    chunks.push(cmdLine(formatReceiptLine(data.storeName, width, "center")));
    chunks.push(cmdSize(SIZE.normal), cmdAlign("left"));

    chunks.push(cmdLine(dividerLine(width)));

    // Meta block.
    const meta: Array<[string, string]> = [
        ["Invoice", data.invoice],
        ["Tanggal", data.date],
        ["Pelanggan", data.customer || "-"],
    ];
    if (data.phone) meta.push(["WhatsApp", data.phone]);
    if (data.cashier) meta.push(["Kasir", data.cashier]);
    for (const [label, value] of meta) {
        for (const line of formatColumns(label, value, width)) {
            chunks.push(cmdLine(line));
        }
    }

    chunks.push(cmdLine(dividerLine(width)));

    // Items.
    for (const item of data.items) {
        for (const line of itemLines(item, width)) {
            chunks.push(cmdLine(line));
        }
    }

    chunks.push(cmdLine(dividerLine(width)));

    // Totals.
    for (const line of formatColumns("Subtotal", data.subtotalLabel, width)) {
        chunks.push(cmdLine(line));
    }
    chunks.push(cmdBold(true));
    for (const line of formatColumns("TOTAL", data.totalLabel, width)) {
        chunks.push(cmdLine(line));
    }
    chunks.push(cmdBold(false));

    chunks.push(cmdLine(dividerLine(width)));

    // Payment.
    const payment: Array<[string, string]> = [
        ["Metode", data.paymentMethod],
        ["Status Bayar", data.paymentStatus],
    ];
    if (data.cashReceivedLabel != null) {
        payment.splice(1, 0, ["Uang Diterima", data.cashReceivedLabel]);
    }
    if (data.changeLabel != null) {
        payment.splice(2, 0, ["Kembalian", data.changeLabel]);
    }
    for (const [label, value] of payment) {
        for (const line of formatColumns(label, value, width)) {
            chunks.push(cmdLine(line));
        }
    }

    chunks.push(cmdLine(dividerLine(width)));

    // Footer (centered).
    chunks.push(cmdAlign("center"));
    for (const line of data.footer) {
        chunks.push(cmdLine(formatReceiptLine(line, width, "center")));
    }
    chunks.push(cmdAlign("left"));

    chunks.push(cmdFeed(2));

    if (profile.enableCut) {
        chunks.push(cmdCut());
    }

    return concat(chunks);
}

function itemLines(item: ReceiptItem, width: number): string[] {
    const lines: string[] = [];

    // Product name.
    lines.push(...wrapText(item.name, width));
    if (item.size) {
        lines.push(...wrapText(item.size, width));
    }

    // Quantity x price on the left, subtotal on the right.
    const left = `${item.quantity} x ${item.priceLabel}`;
    lines.push(...formatColumns(left, item.subtotalLabel, width));

    return lines;
}

export const ESCPOS_COMMANDS = {
    ESC,
    GS,
} as const;

