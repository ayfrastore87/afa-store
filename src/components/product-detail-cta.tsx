"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Heart, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/cart-context";
import { hasAuthenticatedUser, loginPath } from "@/lib/client-auth";
import { useWishlist } from "@/context/wishlist-context";
import { formatRupiah } from "@/lib/products";

type Props = { product: { id: string; name: string; slug: string; price: number; image: string | null }; stock: number };

export default function ProductDetailCta({ product, stock }: Props) {
    const router = useRouter();
    const { addToCart } = useCart();
    const { toggleWishlist, isWishlisted } = useWishlist();
    const [quantity, setQuantity] = useState(1);
    const [message, setMessage] = useState("");
    const [pending, setPending] = useState(false);
    const available = stock > 0;

    const addProduct = () => {
        if (!available) return;
        void hasAuthenticatedUser().then((authenticated) => {
            if (!authenticated) { router.push(loginPath(`/produk/${product.slug}`)); return; }
        addToCart({ id: product.id, name: product.name, slug: product.slug, price: product.price, image: product.image || "/products/parcel.png" }, quantity);
        });
        setMessage("Produk ditambahkan ke keranjang");
    };

    const buyNow = async () => {
        if (!(await hasAuthenticatedUser())) { router.push(loginPath(`/produk/${product.slug}`)); return; }
        if (!available || pending) return;
        setPending(true);
        setMessage("");
        try {
            const response = await fetch("/api/cart/buy-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id, qty: quantity }) });
            const data = await response.json().catch(() => null) as { redirectTo?: string; error?: string } | null;
            if (!response.ok) return setMessage(data?.error || "Produk tidak dapat dibeli saat ini.");
            router.push(data?.redirectTo || "/checkout");
        } catch {
            setMessage("Produk tidak dapat dibeli saat ini.");
        } finally {
            setPending(false);
        }
    };

    const controls = <><div className="flex items-center justify-between gap-4"><label htmlFor="product-quantity" className="text-sm font-bold text-[#123524]">Jumlah</label><div className="inline-flex items-center overflow-hidden rounded-full border border-[#C9A45B]/35 bg-white" role="group" aria-label="Atur jumlah produk"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={!available || quantity <= 1} aria-label="Kurangi jumlah" className="grid min-h-11 min-w-11 place-items-center text-[#123524] disabled:cursor-not-allowed disabled:opacity-35"><Minus size={17} /></button><output id="product-quantity" aria-live="polite" className="min-w-11 text-center font-bold">{quantity}</output><button type="button" onClick={() => setQuantity((value) => Math.min(stock, value + 1))} disabled={!available || quantity >= stock} aria-label="Tambah jumlah" className="grid min-h-11 min-w-11 place-items-center text-[#123524] disabled:cursor-not-allowed disabled:opacity-35"><Plus size={17} /></button></div></div><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={addProduct} disabled={!available} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#123524] px-5 py-3 font-bold text-white transition-colors hover:bg-[#1c5138] disabled:cursor-not-allowed disabled:bg-[#9b9b91]"><ShoppingBag size={19} /> Tambah ke Keranjang</button><button type="button" onClick={() => void buyNow()} disabled={!available || pending} className="min-h-12 rounded-full bg-[#C9A45B] px-5 py-3 font-bold text-white transition-colors hover:bg-[#A7833A] disabled:cursor-not-allowed disabled:bg-[#b7aa91]">{pending ? "Memproses…" : "Beli Sekarang"}</button></div><button type="button" onClick={() => toggleWishlist({ id: product.id, name: product.name, price: product.price, image: product.image || "/products/parcel.png" })} aria-pressed={isWishlisted(product.id)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#C9A45B]/35 px-5 py-2.5 font-bold text-[#123524]"><Heart size={18} fill={isWishlisted(product.id) ? "currentColor" : "none"} />{isWishlisted(product.id) ? "Hapus dari Wishlist" : "Simpan ke Wishlist"}</button></>;

    return <><div className="mt-8 space-y-4">{controls}{message && <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-[#315d45]"><Check size={17} aria-hidden="true" />{message}</p>}</div><div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#C9A45B]/25 bg-[#FFFDF8]/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_36px_rgba(18,53,36,0.12)] backdrop-blur-lg md:hidden"><div className="mx-auto flex max-w-md items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs text-[#8B6B3F]">{available ? `${quantity} produk` : "Stok habis"}</p><p className="font-display text-lg font-bold text-[#123524]">{formatRupiah(product.price * quantity)}</p></div><button type="button" onClick={addProduct} disabled={!available} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#123524] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#9b9b91]"><ShoppingBag size={18} /> Keranjang</button></div></div></>;
}