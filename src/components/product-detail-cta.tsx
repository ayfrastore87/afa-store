"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Minus, Plus, ShoppingBag, ShoppingCart, X, Zap } from "lucide-react";
import { useCart } from "@/context/cart-context";
import { chooseGuestCartAction } from "@/lib/customer-auth-prompt";
import { hasAuthenticatedUser } from "@/lib/client-auth";
import { formatRupiah } from "@/lib/products";
import { buildWhatsAppOrderUrl } from "@/lib/whatsapp-order";

type Props = { product: { id: string; name: string; slug: string; price: number; image: string | null; size?: string | null; flavor?: string | null }; stock: number };

export default function ProductDetailCta({ product, stock }: Props) {
    const { addToCart } = useCart();
    const router = useRouter();
    const [quantity, setQuantity] = useState(1);
    const [message, setMessage] = useState("");
    const [messageTone, setMessageTone] = useState<"success" | "error">("success");
    const [adding, setAdding] = useState(false);
    const available = stock > 0;

    const addProduct = async () => {
        if (!available || adding) return;
        if (!(await hasAuthenticatedUser())) {
            await chooseGuestCartAction(`/produk/${product.slug}`, product, quantity);
            return;
        }
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

    const buyNow = async () => {
        if (!available || adding) return;
        if (!(await hasAuthenticatedUser())) {
            const url = buildWhatsAppOrderUrl(product, quantity);
            if (url) window.open(url, "_blank", "noopener,noreferrer");
            return;
        }
        setAdding(true);
        setMessage("");
        try {
            const added = await addToCart({ id: product.id, name: product.name, slug: product.slug, price: product.price, image: product.image || "/products/parcel.png" }, quantity);
            if (added) {
                router.push("/cart");
            } else {
                setMessageTone("error");
                setMessage("Produk belum berhasil ditambahkan. Silakan coba lagi.");
            }
        } finally {
            setAdding(false);
        }
    };

    const tooltip = "pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-[#0E2A1C] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-all duration-150 md:block md:group-hover/tip:translate-y-0 md:group-hover/tip:opacity-100 md:group-focus-within/tip:translate-y-0 md:group-focus-within/tip:opacity-100";
    const controls = <>
        <div className="flex items-center justify-between gap-4"><label htmlFor="product-quantity" className="text-sm font-bold text-[#123524]">Jumlah</label><div className="inline-flex items-center overflow-hidden rounded-full border border-[#C9A45B]/35 bg-white" role="group" aria-label="Atur jumlah produk"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={!available || quantity <= 1} aria-label="Kurangi jumlah" className="grid min-h-11 min-w-11 place-items-center text-[#123524] disabled:opacity-35"><Minus size={17} /></button><output id="product-quantity" className="min-w-11 text-center font-bold">{quantity}</output><button type="button" onClick={() => setQuantity((value) => Math.min(stock, value + 1))} disabled={!available || quantity >= stock} aria-label="Tambah jumlah" className="grid min-h-11 min-w-11 place-items-center text-[#123524] disabled:opacity-35"><Plus size={17} /></button></div></div>
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Aksi produk">
            <span className="group/tip relative inline-flex">
                <button type="button" onClick={() => void addProduct()} disabled={!available || adding} aria-busy={adding} aria-label={available ? "Tambah ke Keranjang" : "Stok habis"} className="night-secondary-button grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#C9A45B]/50 bg-[#FFFDF7] text-[#123524] shadow-[0_1px_3px_rgba(18,53,36,0.06)] transition-all hover:border-[#C9A45B] hover:bg-[#F8F5EE] hover:shadow-[0_3px_8px_rgba(18,53,36,0.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A45B] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                    {adding ? (<><svg aria-hidden="true" className="h-5 w-5 animate-spin text-[#123524]" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span className="sr-only">Menambahkan…</span></>) : (<ShoppingCart size={19} aria-hidden="true" />)}
                </button>
                <span role="tooltip" className={tooltip}>Keranjang</span>
            </span>
            <span className="group/tip relative inline-flex">
                <button type="button" onClick={() => void buyNow()} disabled={!available || adding} aria-label="Beli Sekarang" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#123524] text-[#D4AF37] shadow-[0_6px_14px_rgba(18,53,36,0.22)] ring-1 ring-[#D4AF37]/35 transition-all hover:-translate-y-0.5 hover:bg-[#184D47] hover:shadow-[0_8px_18px_rgba(18,53,36,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white disabled:shadow-none disabled:ring-0">
                    <Zap size={20} strokeWidth={2.4} aria-hidden="true" />
                </button>
                <span role="tooltip" className={tooltip}>Beli Sekarang</span>
            </span>
            <span className="group/tip relative inline-flex">
                <button type="button" onClick={() => router.push(`/pre-order?productId=${encodeURIComponent(product.id)}`)} aria-label="Pre-Order" className="night-secondary-button grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#C9A45B]/50 bg-[#FFFDF7] text-[#A7833A] shadow-[0_1px_3px_rgba(18,53,36,0.06)] transition-all hover:border-[#C9A45B] hover:bg-[#F8EBCB] hover:shadow-[0_3px_8px_rgba(18,53,36,0.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A45B] active:scale-95">
                    <CalendarDays size={19} aria-hidden="true" />
                </button>
                <span role="tooltip" className={tooltip}>Pre-Order</span>
            </span>
        </div>
        <a href={buildWhatsAppOrderUrl(product, quantity)} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#25D366]/40 px-5 py-3 text-sm font-bold text-[#187B3A]">Tanya via WhatsApp</a>
    </>;

    return <><div className="mt-8 space-y-4">{controls}{message && <p role="status" aria-live="polite" className={`flex items-center gap-2 text-sm font-bold ${messageTone === "success" ? "text-[#315d45]" : "text-red-700"}`}>{messageTone === "success" ? <Check size={17} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}{message}</p>}</div><div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#C9A45B]/25 bg-[#FFFDF8]/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_36px_rgba(18,53,36,0.12)] backdrop-blur-lg md:hidden"><div className="mx-auto flex max-w-md items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs text-[#8B6B3F]">{available ? `${quantity} produk` : "Stok habis"}</p><p className="font-display text-lg font-bold text-[#123524]">{formatRupiah(product.price * quantity)}</p></div><button type="button" onClick={() => void addProduct()} disabled={!available || adding} aria-busy={adding} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#123524] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#9b9b91]">{adding ? "Menambahkan…" : <><ShoppingBag size={18} /> Keranjang</>}</button></div></div></>;
}