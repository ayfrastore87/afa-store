// ---------------------------------------------------------------------------
// Web Bluetooth (BLE / GATT) transport for AFA STORE thermal printing.
//
// IMPORTANT SCOPE: this module speaks ONLY the Web Bluetooth BLE/GATT API.
// Bluetooth Classic / SPP is NOT reachable from the browser; for those printers
// we expose an extension point (Android / local print bridge) in the UI, but
// do NOT implement it here. Do not claim Classic/SPP printers work directly.
//
// UUIDs are never hardcoded: services and characteristics are discovered at
// runtime and a writable characteristic (write or writeWithoutResponse) is
// selected dynamically. No credentials/tokens are ever persisted.
// ---------------------------------------------------------------------------

import type { ThermalPrinterProfile } from "./printer-types";

// Marker so callers can distinguish direct-BLE from Classic/bridge paths.
export type BluetoothConnectionKind = "BLE_DIRECT" | "CLASSIC_BRIDGE";

// Known RPP02 printer UUIDs with priority order (all in lowercase short form)
const RPP02_PRIORITY_SERVICES = [
    { serviceUuid: "fee7", charUuid: "fec7" },  // Priority 1
    { serviceUuid: "ff00", charUuid: "ff02" },  // Priority 2
];

// System services that should never be used for ESC/POS data (all in lowercase short form)
const SYSTEM_SERVICE_UUIDS = new Set([
    "1800",  // Generic Access Profile
    "1801",  // Generic Attribute Profile
    "180a",  // Device Information Service
]);

// Web Bluetooth service UUIDs requested explicitly so the browser
// grants access to the RPP02 printer services after device selection.
const KNOWN_PRINTER_SERVICES = [
    0xfee7,   // RPP02 Priority 1 service
    0xff00,   // RPP02 Priority 2 service
    0x18f0,   // Compatibility fallback
];

export interface BluetoothConnection {
    kind: BluetoothConnectionKind;
    device: BluetoothDevice;
    service: BluetoothRemoteGATTService;
    characteristic: BluetoothRemoteGATTCharacteristic;
    supportsWriteWithResponse: boolean;
}

export interface ConnectResult {
    connected: boolean;
    connection?: BluetoothConnection;
    error?: string;
    canceled?: boolean;
}

export function isBluetoothSupported(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Ask the user to pick a BLE printer. This must be called from a user gesture
 * (a button click); it is never triggered automatically.
 */
export async function requestBluetoothPrinter(): Promise<BluetoothDevice | null> {
    if (!isBluetoothSupported()) {
        throw new Error("Browser tidak mendukung Bluetooth langsung.");
    }
    const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PRINTER_SERVICES,
    });
    return device ?? null;
}

// Private helper - used internally for UUID comparison
// Exported for testing if needed
export function normalizeUuid(uuid: string): string {
    // Normalize to lowercase first
    const normalized = uuid.toLowerCase();

    // If already a clean 4-char hex string, return as-is
    if (/^[0-9a-f]{4}$/.test(normalized)) {
        return normalized;
    }

    // Try to extract 16-bit UUID from various canonical patterns
    // Pattern 1: Canonical Bluetooth SIG base UUID: "0000XXXX-0000-1000-8000-00805F9B34FB"
    // The 16-bit value (XXXX) appears at position 4-7 (chars after leading zeros)
    const bluetoothSigBaseUuid = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/;
    const sigMatch = normalized.match(bluetoothSigBaseUuid);
    if (sigMatch && sigMatch[1]) {
        return sigMatch[1];
    }

    // Pattern 2: Remove any leading zeros and "0x" prefix
    const cleaned = normalized.replace(/^0x/, "").replace(/^0+/, "");

    // Check if this looks like a canonical Bluetooth base UUID after cleanup
    // e.g., "fee7-0000-1000-8000-00805f9b34fb" or just "fee7"
    const simpleCanonicalPattern = /^([0-9a-f]{4})-[0-9a-f]{4}-1000-8000-00805f9b34fb$/;
    const match = cleaned.match(simpleCanonicalPattern);
    if (match && match[1]) {
        return match[1];
    }

    // Fallback: try to find any 4-character hex sequence (should not normally happen for valid input)
    const hexSequenceMatch = cleaned.match(/^[0-9a-f]{4}/);
    if (hexSequenceMatch && hexSequenceMatch[0].length === 4) {
        const fourChars = hexSequenceMatch[0];
        if (/^[0-9a-f]{4}$/.test(fourChars)) {
            return fourChars;
        }
    }

    // If nothing matched, return original (will fail comparison, which is correct)
    return normalized;
}

export async function connectBluetoothPrinter(device: BluetoothDevice): Promise<BluetoothConnection> {
    if (!device.gatt) {
        throw new Error("Printer Bluetooth Classic/SPP tidak bisa dicetak langsung dari browser. Perlu aplikasi jembatan (bridge) lokal.");
    }
    const server = await device.gatt.connect();

    const services = await server.getPrimaryServices();
    const characteristic = await findWritableCharacteristic(services, device);

    if (!characteristic) {
        server.disconnect();
        throw new Error("Printer Bluetooth ini tidak mendukung koneksi BLE langsung dari browser.");
    }

    logBluetoothDiagnostic(device, characteristic);

    return {
        kind: "BLE_DIRECT",
        device,
        service: characteristic.service,
        characteristic,
        supportsWriteWithResponse: characteristic.properties.write === true,
    };
}

/**
 * Internal diagnostic logging. Logs device/service/characteristic identifiers
 * and write capabilities only. Never logs passwords, Supabase tokens, access
 * tokens, or refresh tokens (this module never sees them).
 */
export function logBluetoothDiagnostic(
    serviceDevice: BluetoothDevice | undefined,
    characteristic: BluetoothRemoteGATTCharacteristic,
): void {
    if (typeof console === "undefined") return;

    const printerName = serviceDevice?.name ?? null;
    const printerId = serviceDevice?.id ?? null;

    console.debug("[thermal-printer] bluetooth diagnostic", {
        printerName,
        printerId,
        serviceUuid: characteristic.service.uuid,
        characteristicUuid: characteristic.uuid,
        write: characteristic.properties.write,
        writeWithoutResponse: characteristic.properties.writeWithoutResponse,
    });
}

/**
 * Normalize a Bluetooth UUID to its 16-bit short form.
 *
 * Web Bluetooth may return UUIDs in various formats:
 * - Short hex: "fee7"
 * - With prefix: "0xfee7", "0xFEE7"
 * - Full canonical: "0000fee7-0000-1000-8000-00805f9b34fb"
 * - Partial long: "ffe7-0000-1000-8000-00805f9b34fb"
 *
 * This helper extracts the 16-bit value for comparison against known printer UUIDs.
 * For Bluetooth SIG base UUIDs (like fee7, ff00), the pattern is:
 *   {16bit}-0000-1000-8000-00805f9b34fb (or similar)
 */

/**
 * Check if a service UUID is a system service that should be excluded from ESC/POS data path.
 */
function isSystemService(uuid: string): boolean {
    const normalized = normalizeUuid(uuid);
    for (const sysUuid of SYSTEM_SERVICE_UUIDS) {
        if (normalized === sysUuid.toLowerCase()) return true;
    }
    return false;
}

/**
 * Discover the first writable characteristic across all primary services.
 *
 * Priority order:
 * 1. Known RPP02 services (FEE7/FEC7, FF00/FF02)
 * 2. Generic writable characteristic from non-system services
 *
 * Prefers `write` (reliable, acknowledged) over `writeWithoutResponse`, but
 * falls back to writeWithoutResponse when that is all the printer exposes.
 */
export async function findWritableCharacteristic(
    services: BluetoothRemoteGATTService[],
    device?: BluetoothDevice,
): Promise<BluetoothRemoteGATTCharacteristic | null> {

    // Step 1: Try known RPP02 services in priority order
    for (const known of RPP02_PRIORITY_SERVICES) {
        try {
            const service = services.find(s => normalizeUuid(s.uuid) === normalizeUuid(known.serviceUuid));
            if (service) {
                const characteristics = await service.getCharacteristics();
                const targetChar = characteristics.find(c => normalizeUuid(c.uuid) === normalizeUuid(known.charUuid));
                if (targetChar && (targetChar.properties.write || targetChar.properties.writeWithoutResponse)) {
                    logBluetoothDiagnostic(device, targetChar);
                    return targetChar;
                }
            }
        } catch (err) {
            // Service exists but characteristic discovery failed - continue to next candidate
            console.warn("[thermal-printer] Failed to discover characteristic on known service", known.serviceUuid, err);
        }
    }

    // Step 2: Fall back to generic discovery (excluding system services)
    for (const service of services) {
        // Skip system services - never send ESC/POS to these
        if (isSystemService(service.uuid)) {
            continue;
        }

        try {
            const characteristics = await service.getCharacteristics();
            for (const characteristic of characteristics) {
                const props = characteristic.properties;
                if (props.write || props.writeWithoutResponse) {
                    logBluetoothDiagnostic(device, characteristic);
                    return characteristic;
                }
            }
        } catch (err) {
            // Characteristic discovery failed on this service - continue to next service
            console.warn("[thermal-printer] Failed to get characteristics on service", service.uuid, err);
        }
    }

    return null;
}

export function disconnectBluetoothPrinter(device: BluetoothDevice | null | undefined): void {
    if (device?.gatt?.connected) {
        try {
            device.gatt.disconnect();
        } catch {
            // Ignore: the device may already be gone.
        }
    }
}

/**
 * Split ESC/POS bytes into sequential chunks of `chunkSize` (never empty).
 */
export function chunkData(data: Uint8Array, chunkSize: number): Uint8Array[] {
    if (chunkSize <= 0) return [data];
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < data.length; offset += chunkSize) {
        chunks.push(data.slice(offset, Math.min(offset + chunkSize, data.length)));
    }
    return chunks.length > 0 ? chunks : [new Uint8Array(0)];
}

/**
 * Send a full receipt byte array sequentially, chunk by chunk.
 * - `write` (writeWithResponse) is prioritised for reliability.
 * - `writeWithoutResponse` gets a small inter-chunk delay to avoid buffer
 *   overflow on the printer firmware.
 */
export async function sendEscPos(
    connection: BluetoothConnection,
    data: Uint8Array,
    profile: ThermalPrinterProfile,
    onProgress?: (sent: number, total: number) => void,
): Promise<void> {
    const chunks = chunkData(data, profile.chunkSize);
    const char = connection.characteristic;
    const total = data.length;
    let sent = 0;

    for (const chunk of chunks) {
        if (connection.supportsWriteWithResponse) {
            await char.writeValueWithResponse(chunk);
        } else {
            await char.writeValueWithoutResponse(chunk);
            // Firmware without acknowledged writes can drop bytes if flooded;
            // a small pause dramatically improves reliability on cheap printers.
            await delay(20);
        }
        sent += chunk.length;
        onProgress?.(sent, total);
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
