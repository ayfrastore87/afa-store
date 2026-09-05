"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/context/cart-context";
import { useWishlist } from "@/context/wishlist-context";

type Props = { product: { id: string; name: string; slug: string; price: number; image: string | null }; stock: number };

export default function ProductDetailCta({ product, stock }: Props) {
    const router = useRouter();
    const { addToCart } = useCart();
    const { toggleWishlist, isWishlisted } = useWishlist();
    const [quantity, setQuantity] = useState(1);
    const [message, setMessage] = useState("");

    const buyNow = async () => {
        const response = await fetch("/api/cart/buy-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id, qty: quantity }) });
        const data = await response.json() as { redirectTo?: string; error?: string };
        if (!response.ok) return setMessage(data.error || "Produk tidak dapat dibeli.");
        router.push(data.redirectTo || "/checkout");
    };

    return <div className="mt-8 space-y-3"><div className="flex items-center gap-3"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="rounded-xl border px-4 py-2">−</button><span className="min-w-8 text-center font-bold">{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(stock, value + 1))} disabled={stock < 1} className="rounded-xl border px-4 py-2">+</button></div><div className="grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => addToCart({ id: product.id, name: product.name, slug: product.slug, price: product.price, image: product.image || "/products/parcel.png" })} className="rounded-2xl bg-[#0F4C45] px-5 py-3 font-black text-white">Tambah ke Keranjang</button><button type="button" onClick={() => void buyNow()} className="rounded-2xl bg-[#C8A45D] px-5 py-3 font-black text-white">Beli Sekarang</button><button type="button" onClick={() => toggleWishlist({ id: product.id, name: product.name, price: product.price, image: product.image || "/products/parcel.png" })} className="rounded-2xl border px-5 py-3 font-black">{isWishlisted(product.id) ? "Hapus Wishlist" : "Wishlist"}</button></div>{message && <p role="alert" className="font-bold text-red-700">{message}</p>}</div>;
}