// Shared types/constants for the guest Pre-Order form (client-side only).
// Limits mirror src/lib/pre-order-guest.ts so the UI blocks what the server rejects.

export type GuestLine = { productId: string; quantity: number; notes: string };

export const GUEST_FORM_MAX_QTY = 200;
export const GUEST_FORM_MAX_ITEMS = 20;
export const GUEST_FORM_MAX_PICKUP_DAYS = 90;

export function isoDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
}

export function clampQty(qty: number) {
    return Math.min(Math.max(Number.isFinite(qty) ? Math.trunc(qty) : 1, 1), GUEST_FORM_MAX_QTY);
}

/** Builds the exact JSON body the guest endpoint accepts. */
export function buildGuestPayload(input: {
    customer: string;
    phone: string;
    pickupDate: string;
    note: string;
    lines: GuestLine[];
    startedAt: number;
    website: string;
}) {
    return {
        customer: input.customer.trim(),
        phone: input.phone.replace(/\D/g, ""),
        pickupDate: input.pickupDate || undefined,
        note: input.note.trim() || undefined,
        items: input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, notes: l.notes.trim() || undefined })),
        startedAt: input.startedAt,
        website: input.website,
    };
}

export function canSubmitGuest(input: { busy: boolean; lines: GuestLine[]; customer: string; phone: string }) {
    const digits = input.phone.replace(/\D/g, "");
    return !input.busy && input.lines.length > 0 && input.customer.trim().length >= 2 && digits.length >= 9 && digits.length <= 15;
}
