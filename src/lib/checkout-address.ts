/*
 * Pure, dependency-free checkout address helpers (AFA STORE checkout).
 *
 * The checkout exposes exactly THREE address modes:
 *   - `saved`    -> "Alamat Saya"  : recipient loaded from a saved account address
 *   - `dropship` -> "Dropshipper"  : recipient is the end customer, sender is the dropshipper
 *   - `other`    -> "Alamat Lain"  : recipient typed manually
 *
 * Rules enforced here:
 *  1. Switching mode is DETERMINISTIC: `dropship`/`other` always start from an
 *     EMPTY recipient block, `saved` loads the saved address. Nothing is invented
 *     when the data (or its coordinates) is missing.
 *  2. Example texts are hints only: they live in the `placeholder` attribute and
 *     are stripped by `cleanFieldValue`, so a placeholder can never be submitted.
 *  3. Coordinates keep FULL precision (never rounded/truncated) and must be
 *     finite/in-range before they may be sent to the server.
 *  4. Any location change (pin, Biteship area, formatted address) is detected
 *     through a stable signature, and stale provider responses are detectable, so
 *     a previous quote/rate can never survive a new location.
 *
 * Importable by both the checkout client and the node:test suite (no React, no
 * Next, no Prisma, no `server-only`).
 */

export type AddressMode = "saved" | "dropship" | "other";

export const ADDRESS_MODES: readonly AddressMode[] = ["saved", "dropship", "other"];

export const ADDRESS_MODE_LABELS: Record<AddressMode, string> = {
    saved: "Alamat Saya",
    dropship: "Dropshipper",
    other: "Alamat Lain",
};

/** Descriptive hint per mode. Informational copy only — never a field value. */
export const ADDRESS_MODE_HINTS: Record<AddressMode, string> = {
    saved: "Data penerima diambil dari alamat tersimpan. Pilih alamat lain bila perlu.",
    dropship: "Penerima diisi data pembeli Anda. Nama pengirim diisi identitas dropshipper.",
    other: "Isi data penerima secara manual untuk alamat ini.",
};

export const DEFAULT_ADDRESS_MODE: AddressMode = "other";

/* ==========================================================================
 * Placeholder-only hints
 * ========================================================================== */

export const RECIPIENT_NAME_PLACEHOLDER = "Contoh: Siti Nurhaliza";
export const RECIPIENT_PHONE_PLACEHOLDER = "Contoh: 0812 3456 7890";
export const ADDRESS_DETAIL_PLACEHOLDER = "Contoh: Blok C2 No. 12 RT 03/RW 05";
export const ADDRESS_NOTE_PLACEHOLDER = "Catatan pengiriman";
export const SENDER_NAME_PLACEHOLDER = "Contoh: AFA Gift";
export const SENDER_PHONE_PLACEHOLDER = "Contoh: 0812 0000 0000";

export const CHECKOUT_PLACEHOLDERS = {
    recipientName: RECIPIENT_NAME_PLACEHOLDER,
    phone: RECIPIENT_PHONE_PLACEHOLDER,
    addressDetail: ADDRESS_DETAIL_PLACEHOLDER,
    note: ADDRESS_NOTE_PLACEHOLDER,
    senderName: SENDER_NAME_PLACEHOLDER,
    senderPhone: SENDER_PHONE_PLACEHOLDER,
} as const;

const HINT_PREFIX = /^(?:contoh|cth|misal(?:nya)?|example|ex)\b[\s:.]*/i;

/** True when the text is a UI hint/example instead of real customer data. */
export function isPlaceholderText(value: unknown): boolean {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (Object.values(CHECKOUT_PLACEHOLDERS).some((hint) => hint.toLowerCase() === lower)) return true;
    return HINT_PREFIX.test(trimmed);
}

/**
 * Trim user input and drop hint/example text, so a placeholder can never be
 * submitted as a real recipient name, phone number or address.
 */
export function cleanFieldValue(value: unknown): string {
    if (typeof value !== "string") return "";
    if (isPlaceholderText(value)) return "";
    return value.trim();
}

/* ==========================================================================
 * Deterministic recipient/address fields per mode
 * ========================================================================== */

export type SavedAddressLike = {
    recipientName?: string | null;
    phone?: string | null;
    detail?: string | null;
    note?: string | null;
    /** Optional stored coordinates. Absent/null must never be invented as 0,0. */
    latitude?: unknown;
    longitude?: unknown;
};

export type AddressFields = {
    recipientName: string;
    phone: string;
    addressDetail: string;
    note: string;
};

export const EMPTY_ADDRESS_FIELDS: AddressFields = {
    recipientName: "",
    phone: "",
    addressDetail: "",
    note: "",
};

/**
 * Deterministic recipient block for a mode:
 * - `saved`    -> loaded from the saved address (EMPTY when there is none);
 * - `dropship` -> EMPTY (the recipient is the end customer, never the account holder);
 * - `other`    -> EMPTY (typed manually).
 */
export function addressFieldsForMode(mode: AddressMode, saved: SavedAddressLike | null | undefined): AddressFields {
    if (mode !== "saved" || !saved) return { ...EMPTY_ADDRESS_FIELDS };
    return {
        recipientName: cleanFieldValue(saved.recipientName),
        phone: cleanFieldValue(saved.phone),
        addressDetail: cleanFieldValue(saved.detail),
        note: cleanFieldValue(saved.note ?? ""),
    };
}

/* ==========================================================================
 * Recipient validation (mirrors the account rules; the server stays authoritative)
 * ========================================================================== */

export const RECIPIENT_NAME_MIN_LENGTH = 2;
export const RECIPIENT_NAME_MAX_LENGTH = 120;

/** Name must be real text (>= 2 chars) — never empty and never only punctuation. */
export function isValidRecipientName(value: unknown): boolean {
    const name = cleanFieldValue(value);
    if (name.length < RECIPIENT_NAME_MIN_LENGTH || name.length > RECIPIENT_NAME_MAX_LENGTH) return false;
    return /[A-Za-z\u00C0-\u024F]/.test(name);
}

/** Indonesian phone: 0xxxxxxxxx (local) or 62xxxxxxxxx / +62xxxxxxxxx (international). */
export function isValidRecipientPhone(value: unknown): boolean {
    const cleaned = cleanFieldValue(value);
    if (!cleaned) return false;
    if (/[^0-9\s()+\-.]/.test(cleaned)) return false;
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) return false;
    return digits.startsWith("0") || digits.startsWith("62");
}

/** Canonical 62-prefixed digits (digits only), or "" when unusable. */
export function normalizeRecipientPhone(value: unknown): string {
    const digits = cleanFieldValue(value).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("62")) return digits;
    if (digits.startsWith("0")) return `62${digits.slice(1)}`;
    return digits;
}

/** Case/whitespace-insensitive comparison value for names. */
export function normalizeComparableName(value: unknown): string {
    return cleanFieldValue(value).toLowerCase().replace(/\s+/g, " ");
}

/**
 * Dropship sender identity must be present and must NOT be the recipient: the
 * dropshipper (sender printed on the parcel) and the end customer (recipient) are
 * two different parties and are never conflated.
 */
export function isDistinctDropshipSender(senderName: unknown, recipientName: unknown): boolean {
    const sender = normalizeComparableName(senderName);
    if (!sender) return false;
    const recipient = normalizeComparableName(recipientName);
    if (!recipient) return true;
    return sender !== recipient;
}

/* ==========================================================================
 * Coordinates (full precision) + location signature
 * ========================================================================== */

const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/** Full-precision latitude within [-90, 90], or null. Values are never rounded. */
export function normalizePinLatitude(value: unknown): number | null {
    const parsed = toFiniteNumber(value);
    if (parsed === null || parsed < LATITUDE_MIN || parsed > LATITUDE_MAX) return null;
    return parsed;
}

/** Full-precision longitude within [-180, 180], or null. Values are never rounded. */
export function normalizePinLongitude(value: unknown): number | null {
    const parsed = toFiniteNumber(value);
    if (parsed === null || parsed < LONGITUDE_MIN || parsed > LONGITUDE_MAX) return null;
    return parsed;
}

export type PinLike = { latitude?: unknown; longitude?: unknown };

/** A validated pin, keeping the exact submitted precision. */
export function normalizedPin(pin: PinLike | null | undefined): { latitude: number; longitude: number } | null {
    if (!pin) return null;
    const latitude = normalizePinLatitude(pin.latitude);
    const longitude = normalizePinLongitude(pin.longitude);
    if (latitude === null || longitude === null) return null;
    return { latitude, longitude };
}

/** Stable, full-precision signature of a pin ("" when it is not a usable pin). */
export function pinSignature(pin: PinLike | null | undefined): string {
    const normalized = normalizedPin(pin);
    if (!normalized) return "";
    return `${normalized.latitude}|${normalized.longitude}`;
}

/** True when a response/address no longer belongs to the latest confirmed pin. */
export function isStalePin(responsePin: PinLike | null | undefined, currentPin: PinLike | null | undefined): boolean {
    const response = pinSignature(responsePin);
    if (!response) return true;
    return response !== pinSignature(currentPin);
}

/** True when a response belongs to a superseded request and must be discarded. */
export function isStaleResponse(currentRequestId: number, responseRequestId: number): boolean {
    return currentRequestId !== responseRequestId;
}

export type DeliveryLocation = {
    formattedAddress?: string | null;
    latitude?: unknown;
    longitude?: unknown;
    destinationAreaId?: string | null;
};

/** Everything a shipping quote depends on. Changing any part invalidates the quote. */
export function locationSignature(location: DeliveryLocation | null | undefined): string {
    if (!location) return "";
    const pin = pinSignature(location);
    const areaId = cleanFieldValue(location.destinationAreaId);
    const address = cleanFieldValue(location.formattedAddress).toLowerCase().replace(/\s+/g, " ");
    if (!pin && !areaId && !address) return "";
    return [pin, areaId, address].join("|");
}

/** True when the shipping rates/quoteRef from `previousSignature` must be dropped. */
export function mustInvalidateShipping(previousSignature: string, nextSignature: string): boolean {
    return previousSignature !== nextSignature;
}

export const MIN_FORMATTED_ADDRESS_LENGTH = 5;

/**
 * A destination may only be used for checkout when it has a formatted address
 * and a valid Biteship destinationAreaId. Coordinates are optional metadata.
 */
export function isValidDeliveryLocation(location: DeliveryLocation | null | undefined): boolean {
    if (!location) return false;
    // Only require one of: valid pin OR valid areaId (areaId-only is acceptable for manual entry)
    const hasPin = pinSignature(location);
    const hasAreaId = cleanFieldValue(location.destinationAreaId);
    if (!hasPin && !hasAreaId) return false;
    return cleanFieldValue(location.formattedAddress).length >= MIN_FORMATTED_ADDRESS_LENGTH;
}

/* ==========================================================================
 * Address composition (geocoded base address + user-entered detail)
 * ========================================================================== */

export type DeliveryAddressParts = {
    /** Reverse-geocoded street (jalan + nomor). Never overwrites user detail. */
    streetLine?: string | null;
    /** User-entered detail: blok / RT / RW / patokan. */
    detail?: string | null;
    village?: string | null;
    district?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
};

/** Join address parts into a single display string (deduplicated, capped). */
export function joinAddressParts(parts: Array<string | null | undefined>, maxLength = 800): string {
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const part of parts) {
        const value = cleanFieldValue(part);
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        clean.push(value);
    }
    return clean.join(", ").slice(0, maxLength);
}

/** Street-level address only (what the server stores as the street address). */
export function streetLevelAddress(parts: DeliveryAddressParts): string {
    return joinAddressParts([parts.streetLine, parts.detail], 500);
}

/** Full destination address: street detail first, then the administrative components. */
export function formatDeliveryAddress(parts: DeliveryAddressParts): string {
    return joinAddressParts([parts.streetLine, parts.detail, parts.village, parts.district, parts.city, parts.province, parts.postalCode]);
}

/* ==========================================================================
 * Saved-address coordinates (map sync without fabrication)
 * ========================================================================== */

/** Stored coordinates of a saved address, or null when it really has none. */
export function savedAddressPin(saved: SavedAddressLike | null | undefined): { latitude: number; longitude: number } | null {
    if (!saved) return null;
    return normalizedPin({ latitude: saved.latitude, longitude: saved.longitude });
}

/**
 * Center used when opening the map picker: the already confirmed pin wins, then a
 * saved address that really has coordinates, then the provided fallback. Missing
 * coordinates are NEVER fabricated from the address text.
 */
export function resolvePickerCenter(
    confirmedPin: PinLike | null | undefined,
    saved: SavedAddressLike | null | undefined,
    fallback: { latitude: number; longitude: number },
): { latitude: number; longitude: number } {
    const confirmed = normalizedPin(confirmedPin);
    if (confirmed) return confirmed;
    const stored = savedAddressPin(saved);
    if (stored) return stored;
    return { latitude: fallback.latitude, longitude: fallback.longitude };
}
