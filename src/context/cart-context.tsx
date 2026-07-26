"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { parseJsonResponse } from "@/lib/api-fetch";
import { CART_STORAGE_KEY, calculateSubtotal, calculateTotalItems, normalizeCartItems, type CartItem, type CartResponse, type ProductInput } from "@/lib/cart";

export type { CartItem } from "@/lib/cart";

type CartContextValue = {
    cart: CartItem[];
    subtotal: number;
    totalItems: number;
    grandTotal: number;
    addToCart: (item: ProductInput) => void;
    increaseQty: (id: string) => void;
    decreaseQty: (id: string) => void;
    removeFromCart: (id: string) => void;
    clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

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
        const saved = window.localStorage.getItem(CART_STORAGE_KEY);

        if (!saved) {
            return [];
        }

        const parsed: unknown = JSON.parse(saved);

        return Array.isArray(parsed) ? normalizeCartItems(parsed.filter(isCartItem)) : [];
    } catch {
        return [];
    }
}

async function requestCart(path = "/api/cart", init?: RequestInit) {
    const response = await fetch(path, init);

    if (response.status === 401) {
        return null;
    }

    if (!response.ok) {
        throw new Error("Keranjang gagal disinkronkan.");
    }

    return parseJsonResponse<CartResponse>(response);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [serverReady, setServerReady] = useState(false);

    useEffect(() => {
        const localCart = readCartFromStorage();
        setCart(localCart);

        const syncCart = async () => {
            const sessionResponse = await fetch("/api/auth/me");
            const sessionData = await parseJsonResponse<{ user?: { id: string } | null }>(sessionResponse);

            if (!sessionData.user) {
                setIsLoggedIn(false);
                const synced = localCart.length
                    ? await requestCart("/api/cart", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ items: localCart }),
                    })
                    : await requestCart();

                if (synced) setCart(synced.items);
                setServerReady(true);
                return;
            }

            setIsLoggedIn(true);
            const synced = localCart.length
                ? await requestCart("/api/cart", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: localCart }),
                })
                : await requestCart();

            if (synced) {
                setCart(synced.items);
                window.localStorage.removeItem(CART_STORAGE_KEY);
            }

            setServerReady(true);
        };

        syncCart().catch((error) => {
            console.error("Cart sync failed", error);
            setServerReady(true);
        });
    }, []);

    useEffect(() => {
        if (!serverReady || isLoggedIn) return;
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    }, [cart, isLoggedIn, serverReady]);

    const applyServerCart = useCallback((data: CartResponse | null) => {
        if (data) setCart(data.items);
    }, []);

    const persistAdd = useCallback((item: CartItem) => {
        if (!serverReady) return;

        requestCart("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item }),
        }).then(applyServerCart).catch((error) => console.error("Cart add failed", error));
    }, [applyServerCart, serverReady]);

    const persistQty = useCallback((id: string, qty: number) => {
        if (!serverReady) return;

        requestCart("/api/cart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, qty }),
        }).then(applyServerCart).catch((error) => console.error("Cart update failed", error));
    }, [applyServerCart, serverReady]);

    const persistRemove = useCallback((id: string) => {
        if (!serverReady) return;

        requestCart(`/api/cart?id=${encodeURIComponent(id)}`, { method: "DELETE" })
            .then(applyServerCart)
            .catch((error) => console.error("Cart remove failed", error));
    }, [applyServerCart, serverReady]);

    const persistClear = useCallback(() => {
        if (!serverReady) return;

        requestCart("/api/cart", { method: "DELETE" })
            .then(applyServerCart)
            .catch((error) => console.error("Cart clear failed", error));
    }, [applyServerCart, serverReady]);

    const addToCart = useCallback((item: ProductInput) => {
        persistAdd({ ...item, qty: 1 });
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
    }, [persistAdd]);

    const increaseQty = useCallback((id: string) => {
        setCart((items) => {
            const next = items.map((item) => item.id === id ? { ...item, qty: item.qty + 1 } : item);
            const updated = next.find((item) => item.id === id);
            if (updated) persistQty(id, updated.qty);
            return next;
        });
    }, [persistQty]);

    const decreaseQty = useCallback((id: string) => {
        setCart((items) => {
            const next = items
                .map((item) => item.id === id ? { ...item, qty: Math.max(0, item.qty - 1) } : item)
                .filter((item) => item.qty > 0);
            persistQty(id, next.find((item) => item.id === id)?.qty ?? 0);
            return next;
        });
    }, [persistQty]);

    const removeFromCart = useCallback((id: string) => {
        persistRemove(id);
        setCart((items) => items.filter((item) => item.id !== id));
    }, [persistRemove]);

    const clearCart = useCallback(() => {
        persistClear();
        setCart([]);
        if (!isLoggedIn) window.localStorage.removeItem(CART_STORAGE_KEY);
    }, [isLoggedIn, persistClear]);

    const subtotal = useMemo(
        () => calculateSubtotal(cart),
        [cart]
    );

    const totalItems = useMemo(() => calculateTotalItems(cart), [cart]);
    const grandTotal = subtotal;

    const value = useMemo(
        () => ({
            cart,
            subtotal,
            totalItems,
            grandTotal,
            addToCart,
            increaseQty,
            decreaseQty,
            removeFromCart,
            clearCart,
        }),
        [cart, subtotal, totalItems, grandTotal, addToCart, increaseQty, decreaseQty, removeFromCart, clearCart]
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