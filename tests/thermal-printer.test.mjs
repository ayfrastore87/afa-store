import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Structural/contract tests for the AFA STORE universal thermal printer engine.
// The pure layout + ESC/POS logic lives in TypeScript modules, so (matching the
// repo's convention for the other *.mjs suites) these tests assert on source
// contracts rather than importing TS at runtime.

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const printerTypes = read("../src/lib/thermal-printer/printer-types.ts");
const printerConfig = read("../src/lib/thermal-printer/printer-config.ts");
const escpos = read("../src/lib/thermal-printer/escpos.ts");
const bluetooth = read("../src/lib/thermal-printer/bluetooth-printer.ts");
const service = read("../src/lib/thermal-printer/thermal-print-service.ts");
const panel = read("../src/components/admin/kasir/KasirPrinterPanel.tsx");
const bluetoothTypes = read("../src/types/web-bluetooth.d.ts");

test("supports 58mm and 80mm paper profiles with a configurable width", () => {
    assert.match(printerTypes, /export type ThermalPaperWidth = 58 \| 80;/);
    assert.match(printerTypes, /charactersPerLine: number;/);
    assert.match(printerTypes, /enableCut: boolean;/);
    assert.match(printerConfig, /58: \{/);
    assert.match(printerConfig, /80: \{/);
    assert.match(printerConfig, /enableCut: false/);
});

test("ESC/POS encoder implements the required command set", () => {
    assert.match(escpos, /ESC @/);
    assert.match(escpos, /ESC a/);
    assert.match(escpos, /ESC E/);
    assert.match(escpos, /GS !/);
    assert.match(escpos, /createReceipt/);
    assert.match(escpos, /export function wrapText/);
    assert.match(escpos, /export function formatReceiptLine/);
    assert.match(escpos, /export function formatColumns/);
    assert.match(escpos, /Uint8Array/);
});

test("wrapping never overflows the paper width", () => {
    assert.match(escpos, /slice\(0, width\)/);
    assert.match(escpos, /while \(parts\.length > width\)/);
});

test("cutter (GS V) is optional and disabled by default", () => {
    assert.match(escpos, /GS V/);
    assert.match(escpos, /profile\.enableCut/);
});

test("Web Bluetooth exposes BLE/GATT only and does not hardcode UUIDs", () => {
    assert.match(bluetooth, /isBluetoothSupported/);
    assert.match(bluetooth, /requestBluetoothPrinter/);
    assert.match(bluetooth, /connectBluetoothPrinter/);
    assert.match(bluetooth, /disconnectBluetoothPrinter/);
    assert.match(bluetooth, /findWritableCharacteristic/);
    assert.match(bluetooth, /sendEscPos/);
    assert.match(bluetooth, /acceptAllDevices: true/);
    assert.match(bluetooth, /getPrimaryServices\(\)/);
    assert.match(bluetooth, /getCharacteristics\(\)/);
    assert.match(bluetooth, /properties\.write/);
    assert.match(bluetooth, /writeWithoutResponse/);
    // No hardcoded vendor UUIDs.
    assert.doesNotMatch(bluetooth, /0xFFE0|0000FFE0|18F0|ff00/i);
});

test("chunking splits ESC/POS bytes sequentially with a configurable size", () => {
    assert.match(bluetooth, /export function chunkData/);
    assert.match(bluetooth, /chunkSize/);
    assert.match(bluetooth, /data\.slice\(offset/);
});

test("error messages are in Bahasa Indonesia", () => {
    assert.match(bluetooth, /Browser tidak mendukung Bluetooth langsung\./);
    assert.match(bluetooth, /Printer Bluetooth Classic\/SPP tidak bisa dicetak langsung dari browser\./);
    assert.match(bluetooth, /Printer Bluetooth ini tidak mendukung koneksi BLE langsung dari browser\./);
    assert.match(service, /Pemilihan printer dibatalkan\./);
    assert.match(service, /Printer tidak dapat terhubung\./);
    assert.match(service, /Struk berhasil dicetak\./);
});

test("diagnostics log identifiers but never tokens or passwords", () => {
    assert.match(bluetooth, /printerName/);
    assert.match(bluetooth, /printerId/);
    assert.match(bluetooth, /serviceUuid/);
    assert.match(bluetooth, /characteristicUuid/);
    // The diagnostic payload must never include credentials.
    assert.doesNotMatch(bluetooth, /password:\s|access_token:\s|refresh_token:\s|token:/i);
});

test("connection is never persisted to storage", () => {
    assert.doesNotMatch(bluetooth + panel, /localStorage|sessionStorage/);
});

test("UI exposes a single print entry point with no separate buttons", () => {
    assert.match(panel, /printReceipt/);
    assert.match(panel, /window\.print\(\)/);
    assert.match(panel, /DEFAULT_PAPER_WIDTH/);
    // Exactly one visible button (the unified "Print").
    assert.equal((panel.match(/<button\b/g) || []).length, 1);
    assert.match(panel, />\s*Print\s*</);
    // No separate control buttons remain on the page.
    assert.doesNotMatch(panel, /Hubungkan Bluetooth/);
    assert.doesNotMatch(panel, /Cetak via Bluetooth/);
    assert.doesNotMatch(panel, /Putuskan Bluetooth/);
    assert.doesNotMatch(panel, /PAPER_WIDTHS/);
});

test("single print entry point orchestrates BLE then browser fallback", () => {
    assert.match(service, /export async function printReceipt/);
    assert.match(service, /isBluetoothSupported\(\)/);
    assert.match(service, /printReceiptBluetooth\(/);
    assert.match(service, /allowFallback/);
    assert.match(service, /Struk berhasil dicetak\./);
});

test("receipt maps the cashier name from the active session", () => {
    assert.match(panel, /toReceiptData\(order, cashierName\)/);
    assert.match(panel, /cashier: cashierName \|\| null/);
    assert.match(panel, /\/api\/auth\/me/);
});

test("classic/SPP and non-BLE errors are surfaced as fallbacks, not faked", () => {
    assert.match(bluetooth + service, /Bluetooth Classic/);
    assert.match(bluetooth + service, /SPP/);
    assert.match(bluetooth + service, /jembatan \(bridge\)/);
    assert.match(bluetooth, /tidak mendukung koneksi BLE langsung dari browser\./);
});

test("Web Bluetooth type declarations cover the GATT API", () => {
    assert.match(bluetoothTypes, /interface Navigator/);
    assert.match(bluetoothTypes, /interface BluetoothDevice/);
    assert.match(bluetoothTypes, /interface BluetoothRemoteGATTServer/);
    assert.match(bluetoothTypes, /interface BluetoothRemoteGATTService/);
    assert.match(bluetoothTypes, /interface BluetoothRemoteGATTCharacteristic/);
});
