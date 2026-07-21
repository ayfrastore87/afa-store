export const CHECKOUT_COOKIE = "afa_checkout";
export const SHIPPING_COST = 15000;

export type CheckoutItem = {
    id: string;
    name: string;
    price: number;
    image: string;
    qty: number;
};

export function isCheckoutItem(value: unknown): value is CheckoutItem {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Partial<CheckoutItem>;
    return typeof item.id === "string" && typeof item.name === "string" && typeof item.price === "number" && typeof item.image === "string" && typeof item.qty === "number" && item.qty > 0;
}

export function encodeCheckoutItems(items: CheckoutItem[]) {
    return Buffer.from(JSON.stringify(items), "utf8").toString("base64url");
}

export function decodeCheckoutItems(value?: string): CheckoutItem[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        return Array.isArray(parsed) ? parsed.filter(isCheckoutItem) : [];
    } catch {
        return [];
    }
}

export function checkoutSubtotal(items: CheckoutItem[]) {
    return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}
