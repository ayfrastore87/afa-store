"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

export type CartItem = {
    id: string;
    name: string;
    price: number;
    image: string;
    qty: number;
};

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
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const item = value as Partial<CartItem>;

    return (
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.price === "number" &&
        typeof item.image === "string" &&
        typeof item.qty === "number"
    );
}

function readCartFromStorage(): CartItem[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const saved = window.localStorage.getItem(CART_KEY);

        if (!saved) {
            return [];
        }

        const parsed: unknown = JSON.parse(saved);

        return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
    } catch {
        return [];
    }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);

    useEffect(() => {
        setCart(readCartFromStorage());
    }, []);

    useEffect(() => {
        window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }, [cart]);

    const addToCart = useCallback((item: ProductInput) => {
        setCart((items) => {
            const existing = items.find((cartItem) => cartItem.id === item.id);

            if (existing) {
                return items.map((cartItem) =>
                    cartItem.id === item.id
                        ? { ...cartItem, qty: cartItem.qty + 1 }
                        : cartItem
                );
            }

            return [...items, { ...item, qty: 1 }];
        });
    }, []);

    const increaseQty = useCallback((id: string) => {
        setCart((items) =>
            items.map((item) =>
                item.id === id ? { ...item, qty: item.qty + 1 } : item
            )
        );
    }, []);

    const decreaseQty = useCallback((id: string) => {
        setCart((items) =>
            items
                .map((item) =>
                    item.id === id ? { ...item, qty: Math.max(0, item.qty - 1) } : item
                )
                .filter((item) => item.qty > 0)
        );
    }, []);

    const removeFromCart = useCallback((id: string) => {
        setCart((items) => items.filter((item) => item.id !== id));
    }, []);

    const subtotal = useMemo(
        () => cart.reduce((sum, item) => sum + item.price * item.qty, 0),
        [cart]
    );

    const value = useMemo(
        () => ({
            cart,
            subtotal,
            addToCart,
            increaseQty,
            decreaseQty,
            removeFromCart,
        }),
        [cart, subtotal, addToCart, increaseQty, decreaseQty, removeFromCart]
    );

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
    const value = useContext(CartContext);

    if (!value) {
        throw new Error("useCart must be used inside CartProvider");
    }

    return value;
}