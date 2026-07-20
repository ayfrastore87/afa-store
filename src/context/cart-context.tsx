"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = { id: string; name: string; price: number; image: string; qty: number };
type ProductInput = Omit<CartItem, "qty">;

type CartContextValue = {
    cart: CartItem[];
    subtotal: number;
    addToCart: (item: ProductInput) => void;
    increaseQty: (id: string) => void;
    decreaseQty: (id: string) => void;
    removeFromCart: (id: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const CART_KEY = "afa-cart";

function isCartItem(value: unknown): value is CartItem {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as CartItem).id === "string" &&
        typeof (value as CartItem).name === "string" &&
        typeof (value as CartItem).price === "number" &&
        typeof (value as CartItem).image === "string" &&
        typeof (value as CartItem).qty === "number"
    );
}

function readCartFromStorage() {
    if (typeof window === "undefined") return [] as CartItem[];

    try {
        const saved = window.localStorage.getItem(CART_KEY);
        if (!saved) return [] as CartItem[];

        const parsed: unknown = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
    } catch {
        return [] as CartItem[];
    }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>(() => readCartFromStorage());

    useEffect(() => {
        setCart(readCartFromStorage());
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
        }
    }, [cart]);

    const addToCart = useCallback((item: ProductInput) => {
        setCart((items) => {
            const existing = items.find((cartItem) => cartItem.id === item.id);

            if (existing) {
                return items.map((cartItem) => (cartItem.id === item.id ? { ...cartItem, qty: cartItem.qty + 1 } : cartItem));
            }

            return [...items, { ...item, qty: 1 }];
        });
    }, []);

    const increaseQty = useCallback((id: string) => {
        setCart((items) => items.map((item) => (item.id === id ? { ...item, qty: item.qty + 1 } : item)));
    }, []);

    const decreaseQty = useCallback((id: string) => {
        setCart((items) =>
            items
                .map((item) => (item.id === id ? { ...item, qty: Math.max(1, item.qty - 1) } : item))
                .filter((item) => item.qty > 0),
        );
    }, []);

    const removeFromCart = useCallback((id: string) => {
        setCart((items) => items.filter((item) => item.id !== id));
    }, []);

    const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);

    return <CartContext.Provider value={{ cart, subtotal, addToCart, increaseQty, decreaseQty, removeFromCart }}>{children}</CartContext.Provider>;
}

export function useCart() {
    const value = useContext(CartContext);
    if (!value) throw new Error("useCart must be used inside CartProvider");
    return value;
}