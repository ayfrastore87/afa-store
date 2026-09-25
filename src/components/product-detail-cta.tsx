"use client";

import { useState } from "react";
import { Check, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useCart } from "@/context/cart-context";
import { confirmCustomerAuth } from "@/lib/customer-auth-prompt";
import { formatRupiah } from "@/lib/products";
import { buildWhatsAppOrderUrl } from "@/lib/whatsapp-order";

type Props = { product: { id: string; name: string; slug: string; price: number; image: string | null }; stock: number };

export default function ProductDetailCta({ product, stock }: Props) {
    const { addToCart } = useCart();
    const [quantity, setQuantity] = useState(1);
    const [message, setMessage] = useState("");
    const [messageTone, setMessageTone] = useState<"success" | "error">("success");
    const [adding, setAdding] = useState(false);
    const available = stock > 0;

    const addProduct = async () => {
        if (!available || adding) return;
        if (!(await confirmCustomerAuth("cart", `/produk/${product.slug}`))) return;
        setAdding(true);
        setMessage("");
        try {
            const added = await addToCart({ id: product.id, name: product.name, slug: product.slug, price: product.price, image: product.image || "/products/parcel.png" }, quantity);
            if (added) {
                setMessageTone("success");
                setMessage("Produk ditambahkan ke keranjang");
            } else {
                setMessageTone("error");
                setMessage("Produk belum berhasil ditambahkan. Silakan coba lagi.");
            }
        } finally {
            setAdding(false);
        }
    };

    const buyNow = () => {
        if (!available) return;
        window.open(buildWhatsAppOrderUrl(product, quantity), "_blank", "noopener,noreferrer");
    };

    const controls = <><div className="flex items-center justify-between gap-4"><label htmlFor="product-quantity" className="text-sm font-bold text-[#123524]">Jumlah</label><div className="inline-flex items-center overflow-hidden rounded-full border border-[#C9A45B]/35 bg-white" role="group" aria-label="Atur jumlah produk"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={!available || quantity <= 1} aria-label="Kurangi jumlah" className="grid min-h-11 min-w-11 place-items-center text-[#123524] disabled:cursor-not-allowed disabled:opacity-35"><Minus size={17} /></button><output id="product-quantity" aria-live="polite" className="min-w-11 text-center font-bold">{quantity}</output><button type="button" onClick={() => setQuantity((value) => Math.min(stock, value + 1))} disabled={!available || quantity >= stock} aria-label="Tambah jumlah" className="grid min-h-11 min-w-11 place-items-center text-[#123524] disabled:cursor-not-allowed disabled:opacity-35"><Plus size={17} /></button></div></div><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => void addProduct()} disabled={!available || adding} aria-busy={adding} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#123524] px-5 py-3 font-bold text-white transition-colors hover:bg-[#1c5138] disabled:cursor-not-allowed disabled:bg-[#9b9b91]">{adding ? "Menambahkan…" : <><ShoppingBag size={19} /> Tambah ke Keranjang</>}</button><button type="button" onClick={() => void buyNow()} disabled={!available} className="min-h-12 rounded-full bg-[#C9A45B] px-5 py-3 font-bold text-white transition-colors hover:bg-[#A7833A] disabled:cursor-not-allowed disabled:bg-[#b7aa91]">Beli Sekarang</button></div></>;

    return <><div className="mt-8 space-y-4">{controls}{message && <p role="status" aria-live="polite" className={`flex items-center gap-2 text-sm font-bold ${messageTone === "success" ? "text-[#315d45]" : "text-red-700"}`}>{messageTone === "success" ? <Check size={17} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}{message}</p>}</div><div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#C9A45B]/25 bg-[#FFFDF8]/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_36px_rgba(18,53,36,0.12)] backdrop-blur-lg md:hidden"><div className="mx-auto flex max-w-md items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs text-[#8B6B3F]">{available ? `${quantity} produk` : "Stok habis"}</p><p className="font-display text-lg font-bold text-[#123524]">{formatRupiah(product.price * quantity)}</p></div><button type="button" onClick={() => void addProduct()} disabled={!available || adding} aria-busy={adding} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#123524] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#9b9b91]">{adding ? "Menambahkan…" : <><ShoppingBag size={18} /> Keranjang</>}</button></div></div></>;
}