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
import { calculateSubtotal, calculateTotalItems, type CartItem, type CartResponse, type ProductInput } from "@/lib/cart";

export type { CartItem } from "@/lib/cart";

type ItemState = { pending: boolean; error: string; notice: string };

type CartContextValue = {
    cart: CartItem[];
    subtotal: number;
    totalItems: number;
    grandTotal: number;
    /** true while the initial auth+cart fetch is in flight */
    loading: boolean;
    /** true once the server confirms an authenticated user owns this cart */
    isAuthenticated: boolean;
    /** ephemeral UI confirmation message (e.g. "Produk ditambahkan ke keranjang.") */
    toast: string;
    itemState: (id: string) => ItemState;
    addToCart: (item: ProductInput, quantity?: number) => Promise<boolean>;
    increaseQty: (id: string) => void;
    decreaseQty: (id: string) => void;
    removeFromCart: (id: string) => void;
    clearCart: () => void;
    refreshCart: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

type CartResult =
    | { ok: true; data: CartResponse }
    | { ok: false; unauthorized: boolean; error: string };

async function requestCart(path = "/api/cart", init?: RequestInit): Promise<CartResult> {
    try {
        const response = await fetch(path, init);

        if (response.status === 401) {
            return { ok: false, unauthorized: true, error: "Silakan login terlebih dahulu." };
        }

        if (!response.ok) {
            return { ok: false, unauthorized: false, error: "Keranjang gagal disinkronkan." };
        }

        return { ok: true, data: await parseJsonResponse<CartResponse>(response) };
    } catch (error) {
        return { ok: false, unauthorized: false, error: error instanceof Error ? error.message : "Keranjang gagal disinkronkan." };
    }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [toast, setToast] = useState("");
    const versions = useRef(new Map<string, number>());
    const requestedQuantities = useRef(new Map<string, number>());
    const [states, setStates] = useState<Record<string, ItemState>>({});

    const showToast = useCallback((message: string) => {
        setToast(message);
    }, []);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(""), 2200);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const beginMutation = useCallback((id: string, qty: number) => {
        const version = (versions.current.get(id) ?? 0) + 1;
        versions.current.set(id, version);
        requestedQuantities.current.set(id, qty);
        setStates((current) => ({ ...current, [id]: { pending: true, error: "", notice: "" } }));
        return version;
    }, []);

    const finishMutation = useCallback((id: string, version: number, result: CartResult, fallback: string) => {
        if (versions.current.get(id) !== version) return;
        if (!result.ok) {
            if (result.unauthorized) {
                setCart([]);
                setIsAuthenticated(false);
            }
            setStates((current) => ({ ...current, [id]: { pending: false, error: fallback, notice: "" } }));
            return;
        }
        const data = result.data;
        const requested = requestedQuantities.current.get(id);
        const actual = data.items.find((item) => item.id === id)?.qty;
        const notice = requested && actual !== undefined && actual < requested
            ? `Jumlah disesuaikan ke ${actual} karena stok tersedia.`
            : actual === undefined && requested
                ? "Produk ini sudah tidak tersedia."
                : "";
        setStates((current) => ({ ...current, [id]: { pending: false, error: "", notice } }));
        setCart(data.items);
    }, []);

    const refreshCart = useCallback(async () => {
        const result = await requestCart();
        if (result.ok) {
            setCart(result.data.items);
            setIsAuthenticated(true);
        } else if (result.unauthorized) {
            setCart([]);
            setIsAuthenticated(false);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void refreshCart();
    }, [refreshCart]);

    const persistQty = useCallback((id: string, qty: number) => {
        const version = beginMutation(id, qty);

        requestCart("/api/cart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, qty }),
        }).then((result) => finishMutation(id, version, result, "Perubahan keranjang belum tersimpan. Silakan coba lagi."));
    }, [beginMutation, finishMutation]);

    const addToCart = useCallback(async (item: ProductInput, quantity = 1): Promise<boolean> => {
        if (!isAuthenticated) return false;
        const qty = Math.max(1, Math.floor(quantity));
        const version = beginMutation(item.id, qty);

        const result = await requestCart("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item: { id: item.id, qty } }),
        });

        finishMutation(item.id, version, result, "Produk gagal ditambahkan. Silakan coba lagi.");

        if (!result.ok) return false;
        showToast("Produk ditambahkan ke keranjang.");
        return true;
    }, [isAuthenticated, beginMutation, finishMutation, showToast]);

    const increaseQty = useCallback((id: string) => {
        if (!isAuthenticated) return;
        const current = cart.find((item) => item.id === id);
        if (!current) return;
        const target = current.stock ? Math.min(current.stock, current.qty + 1) : current.qty + 1;
        if (target === current.qty) return;
        persistQty(id, target);
    }, [isAuthenticated, cart, persistQty]);

    const decreaseQty = useCallback((id: string) => {
        if (!isAuthenticated) return;
        const current = cart.find((item) => item.id === id);
        if (!current || current.qty <= 1) return;
        persistQty(id, current.qty - 1);
    }, [isAuthenticated, cart, persistQty]);

    const removeFromCart = useCallback((id: string) => {
        if (!isAuthenticated) return;
        const version = beginMutation(id, 0);

        requestCart(`/api/cart?id=${encodeURIComponent(id)}`, { method: "DELETE" })
            .then((result) => finishMutation(id, version, result, "Produk belum berhasil dihapus. Silakan coba lagi."));
    }, [isAuthenticated, beginMutation, finishMutation]);

    const clearCart = useCallback(async () => {
        if (!isAuthenticated) return;
        const result = await requestCart("/api/cart", { method: "DELETE" });
        if (result.ok) {
            setCart(result.data.items);
            setIsAuthenticated(true);
        } else if (result.unauthorized) {
            setCart([]);
            setIsAuthenticated(false);
        }
    }, [isAuthenticated]);

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
            loading,
            isAuthenticated,
            toast,
            itemState: (id: string) => states[id] ?? { pending: false, error: "", notice: "" },
            addToCart,
            increaseQty,
            decreaseQty,
            removeFromCart,
            clearCart,
            refreshCart,
        }),
        [cart, subtotal, totalItems, grandTotal, loading, isAuthenticated, toast, states, addToCart, increaseQty, decreaseQty, removeFromCart, clearCart, refreshCart]
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