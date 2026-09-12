// Client-safe WhatsApp phone-number normalization helpers. Used across admin
// and storefront UIs to turn stored phone numbers (which may be formatted
// inconsistently, e.g. "0812-3456-7890", "+62 812 3456 7890", or "6281234567890")
// into a canonical E.164-style digits-only string for wa.me links.

// Strips every non-digit character from the input.
export function normalizeWhatsAppDigits(value: string | null | undefined): string {
    if (!value) return "";
    return value.replace(/\D/g, "");
}

// Normalizes an Indonesian phone number to the international "62…" form
// (already without the leading "+"). Handles the common local "08xx" and the
// bare international "62xx" forms. Returns "" for empty/invalid input.
export function normalizeWhatsAppNumber(value: string | null | undefined): string {
    const digits = normalizeWhatsAppDigits(value);
    if (!digits) return "";

    // Local Indonesian mobile numbers start with 0 and are 10-13 digits after
    // stripping the leading 0 (e.g. "081234567890" → "6281234567890").
    if (digits.startsWith("0")) {
        return `62${digits.slice(1)}`;
    }

    // Already international (starts with 62), keep as-is.
    if (digits.startsWith("62")) {
        return digits;
    }

    // No recognizable prefix; return the digits unchanged so wa.me still gets a
    // usable number for non-ID formats.
    return digits;
}

// Builds a wa.me URL for the given number with an optional pre-filled message.
export function whatsappLink(value: string | null | undefined, message?: string): string | null {
    const number = normalizeWhatsAppNumber(value);
    if (!number) return null;
    return message ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : `https://wa.me/${number}`;
}
