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
            <span className="group/tip relative inline-flex">
                <a href={buildWhatsAppOrderUrl(product, quantity)} target="_blank" rel="noopener noreferrer" aria-label="Tanya via WhatsApp" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white shadow-[0_6px_14px_rgba(37,211,102,0.28)] ring-1 ring-[#1DA851]/35 transition-all hover:-translate-y-0.5 hover:bg-[#1EBE57] hover:shadow-[0_8px_18px_rgba(37,211,102,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] active:translate-y-0 active:scale-95">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-6 w-6"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                </a>
                <span role="tooltip" className={tooltip}>Tanya via WhatsApp</span>
            </span>
        </div>
    </>;

    return <><div className="mt-8 space-y-4">{controls}{message && <p role="status" aria-live="polite" className={`flex items-center gap-2 text-sm font-bold ${messageTone === "success" ? "text-[#315d45]" : "text-red-700"}`}>{messageTone === "success" ? <Check size={17} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}{message}</p>}</div><div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#C9A45B]/25 bg-[#FFFDF8]/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_36px_rgba(18,53,36,0.12)] backdrop-blur-lg md:hidden"><div className="mx-auto flex max-w-md items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs text-[#8B6B3F]">{available ? `${quantity} produk` : "Stok habis"}</p><p className="font-display text-lg font-bold text-[#123524]">{formatRupiah(product.price * quantity)}</p></div><button type="button" onClick={() => void addProduct()} disabled={!available || adding} aria-busy={adding} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#123524] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#9b9b91]">{adding ? "Menambahkan…" : <><ShoppingBag size={18} /> Keranjang</>}</button></div></div></>;
}