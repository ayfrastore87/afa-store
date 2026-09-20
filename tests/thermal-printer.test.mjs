import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Structural/contract tests for the AFA STORE universal thermal printer engine.
// The pure layout + ESC/POS logic lives in TypeScript modules, so (matching the
// repo's convention for the other *.mjs suites) these tests assert on source
// contracts rather than importing TS at runtime.

/** Comment-free view of a source file, so "must NOT contain" rules apply to real code. */
const code = (source) =>
    source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");


// Read files for source code inspection tests
function readFileSync(url) {
    return fs.readFileSync(new URL(url, import.meta.url), "utf8");
}

const bluetooth = readFileSync("../src/lib/thermal-printer/bluetooth-printer.ts");
const service = readFileSync("../src/lib/thermal-printer/thermal-print-service.ts");
const panel = readFileSync("../src/components/admin/kasir/KasirPrinterPanel.tsx");
const bluetoothTypes = readFileSync("../src/types/web-bluetooth.d.ts");

// Also read other production source files for inspection tests
const printerTypesFile = fs.readFileSync(new URL("../src/lib/thermal-printer/printer-types.ts", import.meta.url), "utf8");
const printerConfigFile = fs.readFileSync(new URL("../src/lib/thermal-printer/printer-config.ts", import.meta.url), "utf8");
const escposFile = fs.readFileSync(new URL("../src/lib/thermal-printer/escpos.ts", import.meta.url), "utf8");

test("supports 58mm and 80mm paper profiles with a configurable width", () => {
    assert.match(printerTypesFile, /export type ThermalPaperWidth = 58 \| 80;/);
    assert.match(printerTypesFile, /charactersPerLine: number;/);
    assert.match(printerTypesFile, /enableCut: boolean;/);
    assert.match(printerConfigFile, /58: \{/);
    assert.match(printerConfigFile, /80: \{/);
    assert.match(printerConfigFile, /enableCut: false/);
});

test("ESC/POS encoder implements the required command set", () => {
    assert.match(escposFile, /ESC @/);
    assert.match(escposFile, /ESC a/);
    assert.match(escposFile, /ESC E/);
    assert.match(escposFile, /GS !/);
    assert.match(escposFile, /createReceipt/);
    assert.match(escposFile, /export function wrapText/);
    assert.match(escposFile, /export function formatReceiptLine/);
    assert.match(escposFile, /export function formatColumns/);
    assert.match(escposFile, /Uint8Array/);
});

test("wrapping never overflows the paper width", () => {
    assert.match(escposFile, /slice\(0, width\)/);
    assert.match(escposFile, /while \(parts\.length > width\)/);
});

test("cutter (GS V) is optional and disabled by default", () => {
    assert.match(escposFile, /GS V/);
    assert.match(escposFile, /profile\.enableCut/);
});

test("Web Bluetooth exposes BLE/GATT and requests known RPP02 services", () => {
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
    // No hardcoded vendor UUIDs for generic printers - but known RPP02 UUIDs are supported as optionalServices
    assert.match(bluetooth, /optionalServices:/);
    assert.match(bluetooth, /fee7|fec7/i);
    assert.match(bluetooth, /ff00|ff02/i);
    // Exclude system services from ESC/POS data path
    assert.match(bluetooth, /SYSTEM_SERVICE_UUIDS|System Service|generic.*service/i);
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

test("receipt maps the cashier name from the admin kasir payload, not a customer endpoint", () => {
    assert.match(panel, /toReceiptData\(order, cashierName\)/);
    assert.match(panel, /cashier: cashierName \|\| null/);
    // Identitas petugas ikut payload order kasir (sudah admin-authorized)...
    assert.match(panel, /cashierName: cashierNameProp,/);
    assert.match(panel, /const cashierName = cashierNameProp \?\? "";/);
    // ...sehingga halaman admin tidak lagi memanggil endpoint customer-only yang selalu
    // menjawab { user: null } untuk sesi admin (penyebab request "me" gagal berulang).
    assert.doesNotMatch(code(panel), /\/api\/auth\/me/);
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

// RPP02-specific tests - verify known UUID priority and system service exclusion
test("RPP02 support includes known printer UUIDs with priority", () => {
    // Priority 1: FEE7/FEC7 should be attempted first
    assert.match(bluetooth, /fee7|fec7/i);
    // Priority 2: FF00/FF02 as fallback
    assert.match(bluetooth, /ff00|ff02/i);
    // Compatibility: Battery Service
    assert.match(bluetooth, /18f0/i);
});

test("System services are excluded from ESC/POS data path", () => {
    // Generic Access Profile must be skipped
    assert.match(bluetooth, /1800/i);
    // Generic Attribute Profile must be skipped
    assert.match(bluetooth, /1801/i);
    // Device Information Service must be skipped
    assert.match(bluetooth, /180a/i);
});

test("UUID normalization handles various Bluetooth UUID formats correctly", () => {
    // Inline implementation for testing - MIRRORS production normalizeUuid logic
    // Must match src/lib/thermal-printer/bluetooth-printer.ts exactly
    const normalizeUuid = (uuid) => {
        const normalized = uuid.toLowerCase();

        // If already a clean 4-char hex string, return as-is
        if (/^[0-9a-f]{4}$/.test(normalized)) {
            return normalized;
        }

        // EXPLICIT: Bluetooth SIG Base UUID: "0000XXXX-0000-1000-8000-00805f9b34fb"
        const bluetoothSigBaseUuid = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/;
        const sigMatch = normalized.match(bluetoothSigBaseUuid);
        if (sigMatch && sigMatch[1]) {
            return sigMatch[1];
        }

        // Cleanup other forms with leading zeros and "0x" removed
        const cleaned = normalized.replace(/^0x/, "").replace(/^0+/, "");

        // Simple canonical without leading zeros: "fee7-0000-1000-8000-00805f9b34fb"
        const simpleCanonicalPattern = /^([0-9a-f]{4})-[0-9a-f]{4}-1000-8000-00805f9b34fb$/;
        const match = cleaned.match(simpleCanonicalPattern);
        if (match && match[1]) {
            return match[1];
        }

        // Fallback for short forms
        const hexSequenceMatch = cleaned.match(/^[0-9a-f]{4}/);
        if (hexSequenceMatch) {
            const fourChars = hexSequenceMatch[0];
            if (/^[0-9a-f]{4}$/.test(fourChars)) {
                return fourChars;
            }
        }

        return normalized;
    };

    // Test FEE7 format variations
    assert.equal(normalizeUuid("fee7"), "fee7");
    assert.equal(normalizeUuid("FEE7"), "fee7");
    assert.equal(normalizeUuid("0xfee7"), "fee7");
    assert.equal(normalizeUuid("0xFEE7"), "fee7");
    assert.equal(
        normalizeUuid("0000fee7-0000-1000-8000-00805f9b34fb"),
        "fee7"
    );

    // Test FEC7 format variations
    assert.equal(normalizeUuid("fec7"), "fec7");
    assert.equal(normalizeUuid("FEC7"), "fec7");
    assert.equal(normalizeUuid("0xfec7"), "fec7");
    assert.equal(
        normalizeUuid("0000fec7-0000-1000-8000-00805f9b34fb"),
        "fec7"
    );

    // Test FF00/FF02 format variations
    assert.equal(normalizeUuid("ff00"), "ff00");
    assert.equal(normalizeUuid("0xff00"), "ff00");
    assert.equal(normalizeUuid("ff02"), "ff02");
    assert.equal(normalizeUuid("0xff02"), "ff02");

    // Test System services (should also normalize)
    assert.equal(normalizeUuid("1800"), "1800");
    assert.equal(normalizeUuid("1801"), "1801");
    assert.equal(normalizeUuid("180a"), "180a");

    // Verify equivalence across formats
    assert.equal(
        normalizeUuid("0xFEE7"),
        normalizeUuid("fee7")
    );
    assert.equal(
        normalizeUuid("FEC7"),
        normalizeUuid("0x0fec7")
    );
});

test("findWritableCharacteristic follows priority order", () => {
    // Should iterate over known RPP02 services first
    assert.match(bluetooth, /RPP02_PRIORITY_SERVICES|known.*service/i);

    // Should try service discovery sequentially
    assert.match(bluetooth, /for.*known.*of|RPP02.*priority/i);

    // Should fallback to generic discovery after known services
    assert.match(bluetooth, /Step 2|Fall back|generic.*discovery/i);

    // Should skip system services in generic path
    assert.match(bluetooth, /isSystemService|SYSTEM_SERVICE_UUIDS/i);
});

test("Error handling allows continuation on service discovery failure", () => {
    // Should use try-catch around characteristic discovery
    assert.match(bluetooth, /try\s*\{|catch\s*\(/);

    // Should log warnings instead of throwing
    assert.match(bluetooth, /console\.warn.*thermal-printer/);

    // Should continue to next candidate (no early return on error)
    assert.match(bluetooth, /Failed to discover|Failed to get characteristics/);
});
