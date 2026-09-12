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
    // No filters: we accept any BLE device and discover its GATT services
    // afterwards, because printer UUIDs differ widely between vendors.
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
    return device ?? null;
}

export async function connectBluetoothPrinter(device: BluetoothDevice): Promise<BluetoothConnection> {
    if (!device.gatt) {
        throw new Error("Printer Bluetooth Classic/SPP tidak bisa dicetak langsung dari browser. Perlu aplikasi jembatan (bridge) lokal.");
    }
    const server = await device.gatt.connect();

    const services = await server.getPrimaryServices();
    const characteristic = await findWritableCharacteristic(services);

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
    device: BluetoothDevice,
    characteristic: BluetoothRemoteGATTCharacteristic,
): void {
    if (typeof console === "undefined") return;
    console.debug("[thermal-printer] bluetooth diagnostic", {
        printerName: device.name ?? null,
        printerId: device.id,
        serviceUuid: characteristic.service.uuid,
        characteristicUuid: characteristic.uuid,
        write: characteristic.properties.write,
        writeWithoutResponse: characteristic.properties.writeWithoutResponse,
    });
}

/**
 * Discover the first writable characteristic across all primary services.
 * Prefers `write` (reliable, acknowledged) over `writeWithoutResponse`, but
 * falls back to writeWithoutResponse when that is all the printer exposes.
 * UUIDs are discovered at runtime — none are hardcoded.
 */
export async function findWritableCharacteristic(
    services: BluetoothRemoteGATTService[],
): Promise<BluetoothRemoteGATTCharacteristic | null> {
    for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const characteristic of characteristics) {
            const props = characteristic.properties;
            if (props.write || props.writeWithoutResponse) {
                return characteristic;
            }
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
