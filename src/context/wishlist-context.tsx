"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

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
    addToWishlist: (item: WishlistItem) => void;
    removeFromWishlist: (id: string) => void;
    toggleWishlist: (item: WishlistItem) => void;
    isWishlisted: (id: string) => boolean;
    clearWishlist: () => void;
};

const WISHLIST_KEY = "afa-wishlist";
const WishlistContext = createContext<WishlistContextValue | null>(null);

function isWishlistItem(value: unknown): value is WishlistItem {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const item = value as Partial<WishlistItem>;

    return (
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.price === "number" &&
        typeof item.image === "string"
    );
}

function readWishlistFromStorage(): WishlistItem[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const saved = window.localStorage.getItem(WISHLIST_KEY);

        if (!saved) {
            return [];
        }

        const parsed: unknown = JSON.parse(saved);

        return Array.isArray(parsed) ? parsed.filter(isWishlistItem) : [];
    } catch {
        return [];
    }
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
    const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
    const [toast, setToast] = useState("");

    const showToast = useCallback((message: string) => {
        setToast(message);
    }, []);

    useEffect(() => {
        setWishlist(readWishlistFromStorage());
    }, []);

    useEffect(() => {
        window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    }, [wishlist]);

    useEffect(() => {
        if (!toast) {
            return;
        }

        const timer = window.setTimeout(() => setToast(""), 2200);

        return () => window.clearTimeout(timer);
    }, [toast]);

    const addToWishlist = useCallback((item: WishlistItem) => {
        setWishlist((items) => {
            if (items.some((wishItem) => wishItem.id === item.id)) {
                return items;
            }

            showToast("Berhasil ditambahkan ke wishlist.");
            return [...items, item];
        });
    }, [showToast]);

    const removeFromWishlist = useCallback((id: string) => {
        setWishlist((items) => {
            if (!items.some((item) => item.id === id)) {
                return items;
            }

            showToast("Berhasil dihapus dari wishlist.");
            return items.filter((item) => item.id !== id);
        });
    }, [showToast]);

    const toggleWishlist = useCallback((item: WishlistItem) => {
        setWishlist((items) => {
            if (items.some((wishItem) => wishItem.id === item.id)) {
                showToast("Berhasil dihapus dari wishlist.");
                return items.filter((wishItem) => wishItem.id !== item.id);
            }

            showToast("Berhasil ditambahkan ke wishlist.");
            return [...items, item];
        });
    }, [showToast]);

    const isWishlisted = useCallback(
        (id: string) => wishlist.some((item) => item.id === id),
        [wishlist]
    );

    const clearWishlist = useCallback(() => {
        setWishlist([]);
        showToast("Berhasil dihapus dari wishlist.");
    }, [showToast]);

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