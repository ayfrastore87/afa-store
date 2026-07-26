export type CartItem = {
    id: string;
    name: string;
    price: number;
    image: string;
    qty: number;
};

export type ProductInput = Omit<CartItem, "qty">;

export type CartResponse = {
    items: CartItem[];
    subtotal: number;
    totalItems: number;
    grandTotal: number;
};

export const CART_STORAGE_KEY = "afa-cart";

export function normalizeCartItems(items: CartItem[]) {
    const grouped = new Map<string, CartItem>();

    items.forEach((item) => {
        if (!item.id || item.qty <= 0) return;
        const existing = grouped.get(item.id);
        grouped.set(item.id, existing ? { ...existing, qty: existing.qty + item.qty } : item);
    });

    return Array.from(grouped.values());
}

export function calculateSubtotal(items: CartItem[]) {
    return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function calculateTotalItems(items: CartItem[]) {
    return items.reduce((sum, item) => sum + item.qty, 0);
}

export function buildCartResponse(items: CartItem[], extraCost = 0, discount = 0): CartResponse {
    const normalized = normalizeCartItems(items);
    const subtotal = calculateSubtotal(normalized);

    return {
        items: normalized,
        subtotal,
        totalItems: calculateTotalItems(normalized),
        grandTotal: subtotal + extraCost - discount,
    };
}