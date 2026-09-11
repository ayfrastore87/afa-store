// ---------------------------------------------------------------------------
// Minimal Web Bluetooth type declarations for AFA STORE thermal printing.
//
// TypeScript's bundled `dom` lib does not include the Web Bluetooth API, and we
// deliberately avoid pulling in a large typing-only dependency. This global
// augmentation covers the BLE/GATT subset we actually use so that
// `navigator.bluetooth`, `BluetoothDevice`, `BluetoothRemoteGATTServer`,
// `BluetoothRemoteGATTService`, and `BluetoothRemoteGATTCharacteristic` type
// check cleanly.
// ---------------------------------------------------------------------------

type BluetoothServiceUUID = number | string;

interface RequestDeviceOptions {
    filters?: { services?: BluetoothServiceUUID[]; name?: string; namePrefix?: string }[];
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
}

interface BluetoothCharacteristicProperties {
    broadcast: boolean;
    read: boolean;
    writeWithoutResponse: boolean;
    write: boolean;
    notify: boolean;
    indicate: boolean;
    authenticatedSignedWrites: boolean;
    reliableWrite: boolean;
    writableAuxiliaries: boolean;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    readonly service: BluetoothRemoteGATTService;
    readonly uuid: string;
    readonly properties: BluetoothCharacteristicProperties;
    readonly value?: DataView;
    readValue(): Promise<DataView>;
    writeValue(value: Uint8Array): Promise<void>;
    writeValueWithResponse(value: Uint8Array): Promise<void>;
    writeValueWithoutResponse(value: Uint8Array): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTService {
    readonly device: BluetoothDevice;
    readonly uuid: string;
    readonly isPrimary: boolean;
    getCharacteristic(characteristic: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic>;
    getCharacteristics(characteristic?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic[]>;
    getIncludedService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
    getIncludedServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothRemoteGATTServer {
    readonly device: BluetoothDevice;
    readonly connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
    getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice extends EventTarget {
    readonly id: string;
    readonly name?: string;
    readonly gatt?: BluetoothRemoteGATTServer;
}

interface Bluetooth {
    getAvailability(): Promise<boolean>;
    requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
    getDevices(): Promise<BluetoothDevice[]>;
}

interface Navigator {
    readonly bluetooth: Bluetooth;
}
