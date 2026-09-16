/*
 * Pure, dependency-free Biteship failure taxonomy.
 *
 * Checkout must never translate a provider/account problem (for example
 * "No sufficient balance to call rates API") into "alamat tidak didukung".
 * The four internal kinds are kept distinct so the routes can log sanitized
 * upstream fields and still answer the customer with a safe message.
 *
 * Importable by both the server routes and the node:test suite (no `server-only`,
 * no Prisma, no React, no Next imports).
 */

export type BiteshipFailureKind = "invalid_destination" | "no_rates" | "unavailable" | "provider";

/** Customer-safe messages only — never raw upstream text, keys or env names. */
export const BITESHIP_FAILURE_MESSAGES: Record<BiteshipFailureKind, string> = {
    invalid_destination: "Tujuan pengiriman tidak valid. Pilih kembali alamat tujuan.",
    no_rates: "Belum ada layanan pengiriman untuk tujuan ini.",
    unavailable: "Layanan pengiriman sedang mengalami gangguan. Silakan coba lagi.",
    provider: "Tarif pengiriman belum dapat dimuat. Silakan coba lagi.",
};

/** Sanitized upstream error fields (the same subset the existing logger stores). */
export type BiteshipErrorFields = { code?: string | number; error?: string; message?: string };

// Account / provider level wording. These describe OUR Biteship account or the
// provider itself — never the customer's destination — so they must not be
// reported as "no service for this address".
const PROVIDER_FAILURE_PATTERN = /\binsufficient\b|\bbalance\b|\bquota\b|\bcredit\b|\btop\s?up\b|\bunauthoriz|\bunauthorised\b|\bunauthorized\b|\bforbidden\b|\bapi\s?key\b|\bpayment\s+required\b|\brate\s?limit\b|\btoo\s+many\s+requests\b/;

/**
 * True when a non-2xx Biteship response is an account/provider failure rather
 * than a customer-side (destination/courier) failure. Auth/quota HTTP codes are
 * treated as provider failures as well, so the customer still gets the safe
 * "try again" message instead of a misleading destination error.
 */
export function isBiteshipProviderFailure(status: number, fields: BiteshipErrorFields = {}): boolean {
    if (status === 401 || status === 402 || status === 403 || status === 429) return true;
    const text = [fields.error, fields.message]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .toLowerCase();
    return text.length > 0 && PROVIDER_FAILURE_PATTERN.test(text);
}
