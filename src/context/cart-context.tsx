"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
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
    itemState: (id: string) => { pending: boolean; error: string; notice: string };
    addToCart: (item: ProductInput, quantity?: number) => void;
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

function writeCartToStorage(items: CartItem[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalizeCartItems(items)));
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
    const versions = useRef(new Map<string, number>());
    const requestedQuantities = useRef(new Map<string, number>());
    const [states, setStates] = useState<Record<string, { pending: boolean; error: string; notice: string }>>({});

    const beginMutation = useCallback((id: string, qty: number) => {
        const version = (versions.current.get(id) ?? 0) + 1;
        versions.current.set(id, version);
        requestedQuantities.current.set(id, qty);
        setStates((current) => ({ ...current, [id]: { pending: true, error: "", notice: "" } }));
        return version;
    }, []);

    const finishMutation = useCallback((id: string, version: number, data: CartResponse | null, fallback: string) => {
        if (versions.current.get(id) !== version) return;
        if (!data) {
            setStates((current) => ({ ...current, [id]: { pending: false, error: fallback, notice: "" } }));
            return;
        }
        const requested = requestedQuantities.current.get(id);
        const actual = data.items.find((item) => item.id === id)?.qty;
        const notice = requested && actual !== undefined && actual < requested
            ? `Jumlah disesuaikan ke ${actual} karena stok tersedia.`
            : actual === undefined && requested
                ? "Produk ini sudah tidak tersedia."
                : "";
        setStates((current) => ({ ...current, [id]: { pending: false, error: "", notice } }));
        setCart(data.items);
        writeCartToStorage(data.items);
    }, []);

    useEffect(() => {
        const localCart = readCartFromStorage();
        setCart(localCart);

        const syncCart = async () => {
            const synced = localCart.length
                ? await requestCart("/api/cart", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: localCart }),
                })
                : await requestCart();

            if (synced) {
                setCart(synced.items);
                setIsLoggedIn(true);
                if (localCart.length) window.localStorage.removeItem(CART_STORAGE_KEY);
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
        if (!data) return;

        setCart(() => {
            const next = data.items;
            writeCartToStorage(next);
            return next;
        });
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
        const version = beginMutation(id, qty);

        requestCart("/api/cart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, qty }),
        }).then((data) => finishMutation(id, version, data, "Perubahan keranjang belum tersimpan. Silakan coba lagi."))
            .catch(() => finishMutation(id, version, null, "Perubahan keranjang belum tersimpan. Silakan coba lagi."));
    }, [beginMutation, finishMutation, serverReady]);

    const persistRemove = useCallback((id: string) => {
        if (!serverReady) return;
        const version = beginMutation(id, 0);

        requestCart(`/api/cart?id=${encodeURIComponent(id)}`, { method: "DELETE" })
            .then((data) => finishMutation(id, version, data, "Produk belum berhasil dihapus. Silakan coba lagi."))
            .catch(() => finishMutation(id, version, null, "Produk belum berhasil dihapus. Silakan coba lagi."));
    }, [beginMutation, finishMutation, serverReady]);

    const persistClear = useCallback(() => {
        if (!serverReady) return;

        requestCart("/api/cart", { method: "DELETE" })
            .then(applyServerCart)
            .catch((error) => console.error("Cart clear failed", error));
    }, [applyServerCart, serverReady]);

    const addToCart = useCallback((item: ProductInput, quantity = 1) => {
        const qty = Math.max(1, Math.floor(quantity));
        persistAdd({ ...item, qty });
        setCart((items) => {
            const existing = items.find((cartItem) => cartItem.id === item.id);

            if (existing) {
                const next = items.map((cartItem) =>
                    cartItem.id === item.id
                        ? { ...cartItem, qty: cartItem.qty + qty }
                        : cartItem
                );
                writeCartToStorage(next);
                return next;
            }

            const next = [...items, { ...item, qty }];
            writeCartToStorage(next);
            return next;
        });
    }, [persistAdd]);

    const increaseQty = useCallback((id: string) => {
        setCart((items) => {
            const next = items.map((item) => item.id === id ? { ...item, qty: item.stock ? Math.min(item.stock, item.qty + 1) : item.qty + 1 } : item);
            const updated = next.find((item) => item.id === id);
            if (updated) persistQty(id, updated.qty);
            writeCartToStorage(next);
            return next;
        });
    }, [persistQty]);

    const decreaseQty = useCallback((id: string) => {
        setCart((items) => {
            const current = items.find((item) => item.id === id);
            if (!current || current.qty <= 1) return items;
            const next = items.map((item) => item.id === id ? { ...item, qty: item.qty - 1 } : item);
            persistQty(id, current.qty - 1);
            writeCartToStorage(next);
            return next;
        });
    }, [persistQty]);

    const removeFromCart = useCallback((id: string) => {
        persistRemove(id);
        setCart((items) => {
            const next = items.filter((item) => item.id !== id);
            writeCartToStorage(next);
            return next;
        });
    }, [persistRemove]);

    const clearCart = useCallback(() => {
        persistClear();
        setCart([]);
        window.localStorage.removeItem(CART_STORAGE_KEY);
    }, [persistClear]);

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
            itemState: (id: string) => states[id] ?? { pending: false, error: "", notice: "" },
            addToCart,
            increaseQty,
            decreaseQty,
            removeFromCart,
            clearCart,
        }),
        [cart, subtotal, totalItems, grandTotal, states, addToCart, increaseQty, decreaseQty, removeFromCart, clearCart]
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