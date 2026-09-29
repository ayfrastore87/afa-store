// AFA STORE — Guest Cart local storage (client-only)
//
// This module owns the ONLY client-side representation of a guest cart.
// It is intentionally NOT imported by CartProvider until the FASE-2.5x
// guest-checkout feature flag is flipped on — the current CartProvider
// deliberately stays authenticated-only so that GUEST_CHECKOUT_ENABLED=false
// produces byte-identical browser behaviour to today.
//
// Trust boundary:
//   • Only { productId, qty } is persisted to localStorage.
//   • Price, name, image, subtotal, discount, total are NEVER persisted here
//     and NEVER trusted from the client. The server re-authorises everything
//     on every request via product-authority.ts.
//   • Anything malformed in localStorage is silently dropped — never coerced.

export const GUEST_CART_STORAGE_KEY = "afa_guest_cart_v1";

export type GuestCartEntry = { productId: string; qty: number };

function safeLocalStorage(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage;
    } catch {
        // localStorage can throw (private mode, disabled cookies, etc.).
        // Silent null return keeps callers on a safe empty-cart fallback.
        return null;
    }
}

function normalizeEntry(value: unknown): GuestCartEntry | null {
    if (!value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    if (typeof entry.productId !== "string") return null;
    const productId = entry.productId.trim();
    if (!productId) return null;
    if (typeof entry.qty !== "number" || !Number.isInteger(entry.qty) || entry.qty < 1) return null;
    return { productId, qty: entry.qty };
}

/** Reads the guest cart. Returns [] on any error (missing key, malformed JSON,
 *  disabled storage, unexpected shape). Never throws. */
export function readGuestCart(): GuestCartEntry[] {
    const storage = safeLocalStorage();
    if (!storage) return [];
    try {
        const raw = storage.getItem(GUEST_CART_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        // Merge duplicate productIds by summing qty — matches server-side
        // grouping in product-authority.authorizeProductItems.
        const grouped = new Map<string, number>();
        for (const item of parsed) {
            const entry = normalizeEntry(item);
            if (!entry) continue;
            grouped.set(entry.productId, (grouped.get(entry.productId) ?? 0) + entry.qty);
        }
        return [...grouped].map(([productId, qty]) => ({ productId, qty }));
    } catch {
        return [];
    }
}

/** Writes the guest cart. Silently no-ops when storage is unavailable. */
export function writeGuestCart(entries: GuestCartEntry[]): void {
    const storage = safeLocalStorage();
    if (!storage) return;
    const grouped = new Map<string, number>();
    for (const item of entries) {
        const entry = normalizeEntry(item);
        if (!entry) continue;
        grouped.set(entry.productId, (grouped.get(entry.productId) ?? 0) + entry.qty);
    }
    const payload = [...grouped].map(([productId, qty]) => ({ productId, qty }));
    try {
        storage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Quota errors / disabled storage — silently drop, do not surface to UI.
    }
}

export function addToGuestCart(productId: string, qty: number = 1): GuestCartEntry[] {
    const existing = readGuestCart();
    const clean = normalizeEntry({ productId, qty });
    if (!clean) return existing;
    const grouped = new Map(existing.map((entry) => [entry.productId, entry.qty]));
    grouped.set(clean.productId, (grouped.get(clean.productId) ?? 0) + clean.qty);
    const next: GuestCartEntry[] = [...grouped].map(([id, q]) => ({ productId: id, qty: q }));
    writeGuestCart(next);
    return next;
}

export function updateGuestCartQty(productId: string, qty: number): GuestCartEntry[] {
    const existing = readGuestCart();
    if (!Number.isInteger(qty) || qty < 1) return existing;
    const grouped = new Map(existing.map((entry) => [entry.productId, entry.qty]));
    if (!grouped.has(productId)) return existing;
    grouped.set(productId, qty);
    const next: GuestCartEntry[] = [...grouped].map(([id, q]) => ({ productId: id, qty: q }));
    writeGuestCart(next);
    return next;
}

export function removeFromGuestCart(productId: string): GuestCartEntry[] {
    const existing = readGuestCart();
    const next = existing.filter((entry) => entry.productId !== productId);
    writeGuestCart(next);
    return next;
}

export function clearGuestCart(): void {
    const storage = safeLocalStorage();
    if (!storage) return;
    try {
        storage.removeItem(GUEST_CART_STORAGE_KEY);
    } catch {
        // no-op
    }
}
