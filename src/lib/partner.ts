import { randomInt } from "node:crypto";

// String-based enums, consistent with User.role / Order.source (no risky
// Prisma enum migration).
export const PARTNER_TYPES = ["INDIVIDUAL", "RESELLER", "WARUNG", "TOKO", "AGEN"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "SUSPENDED"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const partnerStatusLabels: Record<string, string> = {
    PENDING: "Ditinjau",
    ACTIVE: "Aktif",
    REJECTED: "Ditolak",
    SUSPENDED: "Ditangguhkan",
};

export const partnerTypeLabels: Record<string, string> = {
    INDIVIDUAL: "Orang Pribadi",
    RESELLER: "Reseller",
    WARUNG: "Warung",
    TOKO: "Toko",
    AGEN: "Agen",
};

export function isPartnerType(value: unknown): value is PartnerType {
    return typeof value === "string" && (PARTNER_TYPES as readonly string[]).includes(value);
}

export function isPartnerStatus(value: unknown): value is PartnerStatus {
    return typeof value === "string" && (PARTNER_STATUSES as readonly string[]).includes(value);
}

const PARTNER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PARTNER_CODE_SUFFIX_LENGTH = 6;

// Safe partner code: unique, not derived from the full phone number, and does
// not expose personal data. Format: MITRA-XXXXXX.
function generatePartnerCodeSuffix() {
    let suffix = "";
    for (let index = 0; index < PARTNER_CODE_SUFFIX_LENGTH; index += 1) {
        suffix += PARTNER_CODE_ALPHABET[randomInt(0, PARTNER_CODE_ALPHABET.length)];
    }
    return suffix;
}

export function generatePartnerCode() {
    return `MITRA-${generatePartnerCodeSuffix()}`;
}
