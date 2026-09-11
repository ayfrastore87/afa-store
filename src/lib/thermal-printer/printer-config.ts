// ---------------------------------------------------------------------------
// Thermal printer profiles for the two supported paper widths.
//
// `charactersPerLine` uses the most common configuration: font A (12x24 dots)
// at 203 dpi (~8 dots/mm) with a typical printable margin. These are sensible
// starting points and can be tuned per printer/font — they are intentionally
// NOT treated as universal truth (no two printers print identical widths):
//   58mm -> ~48mm printable = 384 dots = 32 chars
//   80mm -> ~72mm printable = 576 dots = 48 chars
// ---------------------------------------------------------------------------

import type { ThermalPaperWidth, ThermalPrinterProfile } from "./printer-types";

export const THERMAL_PRINTER_CONFIG: Record<ThermalPaperWidth, ThermalPrinterProfile> = {
    58: {
        name: "Thermal 58mm",
        paperWidthMm: 58,
        charactersPerLine: 32,
        encoding: "UTF-8",
        chunkSize: 64,
        enableCut: false,
    },
    80: {
        name: "Thermal 80mm",
        paperWidthMm: 80,
        charactersPerLine: 48,
        encoding: "UTF-8",
        chunkSize: 64,
        enableCut: false,
    },
};

export const PAPER_WIDTHS: ThermalPaperWidth[] = [58, 80];

export function getPrinterProfile(width: ThermalPaperWidth): ThermalPrinterProfile {
    return THERMAL_PRINTER_CONFIG[width];
}
