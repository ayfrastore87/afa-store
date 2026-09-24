export const CUSTOM_ITEM_TYPES = ["PRODUCT", "CUSTOM_PRODUCT", "SERVICE"] as const;
export type CustomItemType = (typeof CUSTOM_ITEM_TYPES)[number];

export type ManualOrderItemInput = {
    itemType: "CUSTOM_PRODUCT" | "SERVICE";
    name: string;
    description?: string;
    notes?: string;
    quantity: number;
    unitPrice: number;
};

export function validateManualItem(value: unknown): ManualOrderItemInput {
    if (!value || typeof value !== "object") throw new Error("Format item manual tidak valid.");
    const item = value as Record<string, unknown>;
    const itemType = item.itemType;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const quantity = item.quantity;
    const unitPrice = item.unitPrice;
    if (itemType !== "CUSTOM_PRODUCT" && itemType !== "SERVICE") throw new Error("Jenis item manual tidak valid.");
    if (!name || name.length > 200) throw new Error("Nama item wajib diisi dan maksimal 200 karakter.");
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 999) throw new Error("quantity harus bilangan bulat lebih dari 0.");
    if (!Number.isInteger(unitPrice) || (unitPrice as number) < 0 || (unitPrice as number) > 2_000_000_000) throw new Error("Harga item tidak valid.");
    return {
        itemType,
        name,
        description: typeof item.description === "string" ? item.description.trim().slice(0, 1000) : undefined,
        notes: typeof item.notes === "string" ? item.notes.trim().slice(0, 1000) : undefined,
        quantity: quantity as number,
        unitPrice: unitPrice as number,
    };
}

export function calculateOrderTotals(items: Array<{ quantity: number; unitPrice: number }>, discount = 0, shipping = 0) {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const safeDiscount = Math.max(0, Math.min(discount, subtotal));
    const safeShipping = Math.max(0, shipping);
    return { subtotal, discount: safeDiscount, shipping: safeShipping, total: subtotal - safeDiscount + safeShipping };
}