"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { hasAuthenticatedUser } from "@/lib/client-auth";

export type WishlistItem = {
    id: string;
    name: string;
    price: number;
    image: string;
};

type WishlistContextValue = {
    wishlist: WishlistItem[];
    wishlistCount: number;
    toast: string;
    addToWishlist: (item: WishlistItem) => Promise<void>;
    removeFromWishlist: (id: string) => Promise<void>;
    toggleWishlist: (item: WishlistItem) => Promise<void>;
    isWishlisted: (id: string) => boolean;
    clearWishlist: () => Promise<void>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
    const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [toast, setToast] = useState("");

    const showToast = useCallback((message: string) => {
        setToast(message);
    }, []);

    const requireAuth = useCallback(async () => {
        if (await hasAuthenticatedUser()) return true;
        showToast("Silakan Login/Daftar terlebih dahulu untuk menggunakan wishlist.");
        return false;
    }, [showToast]);

    useEffect(() => {
        let active = true;
        void hasAuthenticatedUser().then((authenticated) => {
            if (!active) return;
            setIsAuthenticated(authenticated);
            if (authenticated) {
                try {
                    const saved = window.localStorage.getItem("afa-wishlist");
                    if (saved) setWishlist(JSON.parse(saved) as WishlistItem[]);
                } catch {
                    setWishlist([]);
                }
            } else {
                setWishlist([]);
                try { window.localStorage.removeItem("afa-wishlist"); } catch { /* ignore unavailable storage */ }
            }
        });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!isAuthenticated) return;
        try { window.localStorage.setItem("afa-wishlist", JSON.stringify(wishlist)); } catch { /* ignore unavailable storage */ }
    }, [isAuthenticated, wishlist]);

    useEffect(() => {
        if (!toast) {
            return;
        }

        const timer = window.setTimeout(() => setToast(""), 2200);

        return () => window.clearTimeout(timer);
    }, [toast]);

    const addToWishlist = useCallback(async (item: WishlistItem) => {
        if (!(await requireAuth())) return;
        setWishlist((items) => {
            if (items.some((wishItem) => wishItem.id === item.id)) return items;
            showToast("Berhasil ditambahkan ke wishlist.");
            return [...items, item];
        });
    }, [requireAuth, showToast]);

    const removeFromWishlist = useCallback(async (id: string) => {
        if (!(await requireAuth())) return;
        setWishlist((items) => {
            if (!items.some((item) => item.id === id)) return items;
            showToast("Berhasil dihapus dari wishlist.");
            return items.filter((item) => item.id !== id);
        });
    }, [requireAuth, showToast]);

    const toggleWishlist = useCallback(async (item: WishlistItem) => {
        if (!(await requireAuth())) return;
        setWishlist((items) => {
            if (items.some((wishItem) => wishItem.id === item.id)) {
                showToast("Berhasil dihapus dari wishlist.");
                return items.filter((wishItem) => wishItem.id !== item.id);
            }
            showToast("Berhasil ditambahkan ke wishlist.");
            return [...items, item];
        });
    }, [requireAuth, showToast]);

    const isWishlisted = useCallback(
        (id: string) => wishlist.some((item) => item.id === id),
        [wishlist]
    );

    const clearWishlist = useCallback(async () => {
        if (!(await requireAuth())) return;
        setWishlist([]);
        showToast("Berhasil dihapus dari wishlist.");
    }, [requireAuth, showToast]);

    const value = useMemo(
        () => ({
            wishlist,
            wishlistCount: wishlist.length,
            toast,
            addToWishlist,
            removeFromWishlist,
            toggleWishlist,
            isWishlisted,
            clearWishlist,
        }),
        [
            wishlist,
            toast,
            addToWishlist,
            removeFromWishlist,
            toggleWishlist,
            isWishlisted,
            clearWishlist,
        ]
    );

    return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
    const value = useContext(WishlistContext);

    if (!value) {
        throw new Error("useWishlist must be used inside WishlistProvider");
    }

    return value;
}