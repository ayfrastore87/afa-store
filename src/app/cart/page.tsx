"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/context/cart-context";
import { formatRupiah } from "@/lib/products";
import { hasAuthenticatedUser, loginPath } from "@/lib/client-auth";

export default function CartPage() {
    const router = useRouter();
    const { cart, subtotal, totalItems, itemState, increaseQty, decreaseQty, removeFromCart } = useCart();
    useEffect(() => { void hasAuthenticatedUser().then((authenticated) => { if (!authenticated) router.replace(loginPath("/cart")); }); }, [router]);
    const unavailable = cart.some((item) => itemState(item.id).notice.includes("tidak tersedia"));
    const startCheckout = async () => {
        if (unavailable) return;
        const response = await fetch("/api/checkout/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart.map(({ id, qty }) => ({ id, qty })) }) });
        if (response.ok) router.push("/checkout");
    };

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(201,164,91,.18),transparent_28%),linear-gradient(135deg,#F8F5EE,#FFFDF8_55%,#EFE6D5)] px-4 py-8 text-[#2E2A26] md:px-8 md:py-12">
        <div className="mx-auto max-w-6xl">
            <header className="flex flex-col gap-5 border-b border-[#C9A45B]/20 pb-8 sm:flex-row sm:items-end sm:justify-between">
                <div><Link href="/" className="font-semibold text-[#8B6B3F]">← Kembali belanja</Link><p className="mt-6 text-sm font-bold uppercase tracking-[.22em] text-[#C9A45B]">AFA FOOD</p><h1 className="mt-2 font-display text-4xl font-bold text-[#123524] md:text-6xl">Keranjang Belanja</h1><p className="mt-2 text-[#6D6558]">{totalItems} item pilihan Anda</p></div>
                <Link href="/#katalog" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#C9A45B] px-5 font-bold text-[#123524]">Lanjut Belanja</Link>
            </header>
            <div aria-live="polite" className="sr-only">{unavailable ? "Ada produk yang tidak tersedia." : ""}</div>
            {!cart.length ? <section className="luxury-card mt-8 grid min-h-[52vh] place-items-center rounded-[32px] p-8 text-center"><div><ShoppingBag className="mx-auto text-[#C9A45B]" size={52} /><h2 className="mt-5 font-display text-3xl font-bold text-[#123524]">Keranjang masih kosong</h2><p className="mt-2 text-[#6D6558]">Temukan produk AFA FOOD favorit Anda.</p><Link href="/#katalog" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-[#123524] px-7 font-bold text-white">Mulai Belanja</Link></div></section> : <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
                <section className="grid gap-4" aria-label="Produk dalam keranjang">{cart.map((item) => { const state = itemState(item.id); const maxed = item.stock !== undefined && item.qty >= item.stock; return <article key={item.id} className="luxury-card rounded-[28px] p-4 sm:p-5" aria-busy={state.pending}>
                    <div className="flex gap-4"><div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#FFF9ED] sm:h-28 sm:w-28"><Image src={item.image} alt={item.name} fill sizes="112px" className="object-contain p-2" /></div><div className="min-w-0 flex-1"><h2 className="break-words font-display text-xl font-bold text-[#123524]">{item.name}</h2>{item.flavor && <p className="text-sm text-[#6D6558]">Rasa: {item.flavor}</p>}{item.size && <p className="text-sm text-[#6D6558]">Ukuran: {item.size}</p>}<p className="mt-2 font-bold text-[#A7833A]">{formatRupiah(item.price)}</p><div className="mt-3 flex flex-wrap items-center gap-3"><div className="inline-flex min-h-11 items-center rounded-full border border-[#C9A45B]/30 bg-[#FFF9ED]"><button type="button" disabled={state.pending || item.qty <= 1} onClick={() => decreaseQty(item.id)} aria-label={`Kurangi jumlah ${item.name}`} className="grid h-11 w-11 place-items-center disabled:opacity-35"><Minus size={16} /></button><output aria-label={`Jumlah ${item.name}`} className="min-w-9 text-center font-bold">{item.qty}</output><button type="button" disabled={state.pending || maxed} onClick={() => increaseQty(item.id)} aria-label={`Tambah jumlah ${item.name}`} className="grid h-11 w-11 place-items-center disabled:opacity-35"><Plus size={16} /></button></div><button type="button" disabled={state.pending} onClick={() => removeFromCart(item.id)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-bold text-red-700 hover:bg-red-50" aria-label={`Hapus ${item.name}`}>{state.pending ? "Menyimpan…" : <><Trash2 size={16} /> Hapus</>}</button></div></div><strong className="hidden shrink-0 text-right sm:block">{formatRupiah(item.price * item.qty)}</strong></div>{state.notice && <p className="mt-3 rounded-xl bg-[#FFF2D6] px-3 py-2 text-sm font-semibold text-[#7A571F]" role="status">{state.notice}</p>}{state.error && <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{state.error}</p>}<p className="mt-3 text-right font-bold sm:hidden">{formatRupiah(item.price * item.qty)}</p>
                </article>; })}</section>
                <aside className="luxury-card h-fit rounded-[28px] p-6 lg:sticky lg:top-6"><h2 className="font-display text-2xl font-bold text-[#123524]">Ringkasan</h2><div className="mt-5 space-y-3 text-sm"><p className="flex justify-between"><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></p><p className="flex justify-between text-[#6D6558]"><span>Pengiriman</span><span>Dihitung saat checkout</span></p><div className="border-t border-[#C9A45B]/20 pt-3"><p className="flex justify-between text-lg font-bold text-[#123524]"><span>Total</span><span>{formatRupiah(subtotal)}</span></p></div></div><p className="mt-4 text-xs text-[#6D6558]">Total ini untuk tampilan. Harga dan stok final tetap diverifikasi server saat checkout.</p><button type="button" onClick={() => void startCheckout()} disabled={unavailable} className="mt-6 flex min-h-12 w-full items-center justify-center rounded-full bg-[#123524] px-5 font-bold text-white disabled:bg-gray-400">Lanjut ke Checkout</button></aside>
            </div>}
        </div>
    </main>;
}