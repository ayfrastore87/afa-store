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
import { usePathname } from "next/navigation";
import { parseJsonResponse } from "@/lib/api-fetch";
import { calculateSubtotal, calculateTotalItems, type CartItem, type CartResponse, type ProductInput } from "@/lib/cart";
import { getUserFacingMessage, safeApiMessage } from "@/lib/user-facing-error";
import { addToGuestCart, clearGuestCart, readGuestCart, removeFromGuestCart, updateGuestCartQty } from "@/lib/guest-cart-store";

export type { CartItem } from "@/lib/cart";

type ItemState = { pending: boolean; error: string; notice: string };

export type CartToast = { title: string; message: string; variant: "success" | "error" };

type CartContextValue = {
    cart: CartItem[];
    subtotal: number;
    totalItems: number;
    grandTotal: number;
    /** true while the initial auth+cart fetch is in flight */
    loading: boolean;
    /** true once the server confirms an authenticated user owns this cart */
    isAuthenticated: boolean;
    /** ephemeral UI confirmation (success or error) with an optional action target */
    toast: CartToast | null;
    itemState: (id: string) => ItemState;
    addToCart: (item: ProductInput, quantity?: number) => Promise<boolean>;
    increaseQty: (id: string) => void;
    decreaseQty: (id: string) => void;
    removeFromCart: (id: string) => void;
    clearCart: () => void;
    refreshCart: () => Promise<void>;
    dismissToast: () => void;
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
            let error = "Keranjang gagal disinkronkan.";
            try {
                const body = await response.json() as unknown;
                const safe = safeApiMessage(body);
                if (safe) error = safe;
            } catch {
                // keep the fallback message when the body is not JSON
            }
            return { ok: false, unauthorized: false, error };
        }

        return { ok: true, data: await parseJsonResponse<CartResponse>(response) };
    } catch (error) {
        return { ok: false, unauthorized: false, error: getUserFacingMessage(error, "Keranjang gagal disinkronkan.") };
    }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [guestEnabled, setGuestEnabled] = useState(false);
    const [toast, setToast] = useState<CartToast | null>(null);
    const versions = useRef(new Map<string, number>());
    const requestedQuantities = useRef(new Map<string, number>());
    const [states, setStates] = useState<Record<string, ItemState>>({});

    const showToast = useCallback((toast: CartToast) => {
        setToast(toast);
    }, []);

    const dismissToast = useCallback(() => setToast(null), []);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 3000);
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
            setStates((current) => ({ ...current, [id]: { pending: false, error: result.error || fallback, notice: "" } }));
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
        const capability = await fetch("/api/guest-checkout/capability", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<{ guestCheckoutEnabled?: boolean }> : {}).catch(() => ({}));
        const enabled = (capability as { guestCheckoutEnabled?: boolean }).guestCheckoutEnabled === true;
        setGuestEnabled(enabled);
        if (enabled) {
            const entries = readGuestCart();
            const query = entries.map((entry) => `item=${encodeURIComponent(`${entry.productId}:${entry.qty}`)}`).join("&");
            const result = await requestCart(`/api/cart?${query}`);
            if (result.ok) setCart(result.data.items);
            setIsAuthenticated(false);
            setLoading(false);
            return;
        }
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
        // Customer cart state is not relevant to the admin surface. In particular,
        // do not probe the customer-only cart endpoint with an admin session.
        if (isAdminRoute) {
            setCart([]);
            setIsAuthenticated(false);
            setLoading(false);
            return;
        }
        void refreshCart();
    }, [isAdminRoute, refreshCart]);

    const persistQty = useCallback((id: string, qty: number) => {
        const version = beginMutation(id, qty);

        requestCart("/api/cart", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, qty }),
        }).then((result) => finishMutation(id, version, result, "Perubahan keranjang belum tersimpan. Silakan coba lagi."));
    }, [beginMutation, finishMutation]);

    const addToCart = useCallback(async (item: ProductInput, quantity = 1): Promise<boolean> => {
        const qty = Math.max(1, Math.floor(quantity));
        if (!isAuthenticated) {
            if (!guestEnabled) return false;
            addToGuestCart(item.id, qty);
            setCart((current) => [...current.filter((entry) => entry.id !== item.id), { ...item, qty: (current.find((entry) => entry.id === item.id)?.qty ?? 0) + qty }]);
            showToast({ title: "Berhasil ditambahkan", message: `${item.name} masuk ke keranjang.`, variant: "success" });
            return true;
        }
        const version = beginMutation(item.id, qty);

        const result = await requestCart("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item: { id: item.id, qty } }),
        });

        finishMutation(item.id, version, result, "Gagal menambahkan produk. Silakan coba lagi.");

        if (!result.ok) {
            showToast({ title: "Gagal menambahkan produk", message: result.error || "Silakan coba lagi.", variant: "error" });
            return false;
        }
        showToast({ title: "Berhasil ditambahkan", message: `${item.name} masuk ke keranjang.`, variant: "success" });
        return true;
    }, [guestEnabled, isAuthenticated, beginMutation, finishMutation, showToast]);

    const increaseQty = useCallback((id: string) => {
        const current = cart.find((item) => item.id === id);
        if (!current) return;
        const target = current.stock ? Math.min(current.stock, current.qty + 1) : current.qty + 1;
        if (target === current.qty) return;
        if (!isAuthenticated && guestEnabled) { updateGuestCartQty(id, target); setCart((items) => items.map((item) => item.id === id ? { ...item, qty: target } : item)); return; }
        persistQty(id, target);
    }, [guestEnabled, isAuthenticated, cart, persistQty]);

    const decreaseQty = useCallback((id: string) => {
        const current = cart.find((item) => item.id === id);
        if (!current || current.qty <= 1) return;
        if (!isAuthenticated && guestEnabled) { updateGuestCartQty(id, current.qty - 1); setCart((items) => items.map((item) => item.id === id ? { ...item, qty: item.qty - 1 } : item)); return; }
        persistQty(id, current.qty - 1);
    }, [guestEnabled, isAuthenticated, cart, persistQty]);

    const removeFromCart = useCallback((id: string) => {
        if (!isAuthenticated) { if (guestEnabled) { removeFromGuestCart(id); setCart((items) => items.filter((item) => item.id !== id)); } return; }
        const version = beginMutation(id, 0);

        requestCart(`/api/cart?id=${encodeURIComponent(id)}`, { method: "DELETE" })
            .then((result) => finishMutation(id, version, result, "Produk belum berhasil dihapus. Silakan coba lagi."));
    }, [guestEnabled, isAuthenticated, beginMutation, finishMutation]);

    const clearCart = useCallback(async () => {
        if (!isAuthenticated) { if (guestEnabled) { clearGuestCart(); setCart([]); } return; }
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
            dismissToast,
        }),
        [cart, subtotal, totalItems, grandTotal, loading, isAuthenticated, toast, states, addToCart, increaseQty, decreaseQty, removeFromCart, clearCart, refreshCart, dismissToast]
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