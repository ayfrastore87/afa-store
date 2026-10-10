"use client";

import { CalendarDays, Loader2, Send, Trash2 } from "lucide-react";
import { formatRupiah, type Product } from "@/lib/products";
import { GUEST_FORM_MAX_PICKUP_DAYS, isoDate, type GuestLine } from "./guest-pre-order-shared";

type Props = {
    lines: GuestLine[];
    byId: Map<string, Product>;
    subtotal: number;
    customer: string; setCustomer: (v: string) => void;
    phone: string; setPhone: (v: string) => void;
    pickupDate: string; setPickupDate: (v: string) => void;
    note: string; setNote: (v: string) => void;
    website: string; setWebsite: (v: string) => void;
    setQty: (productId: string, qty: number) => void;
    remove: (productId: string) => void;
    busy: boolean;
    error: string;
    canSubmit: boolean;
};

const field = "mt-1 h-11 w-full rounded-xl border border-[#123524]/15 bg-white px-3 text-sm outline-none focus:border-[#C9A45B]";

export default function GuestPreOrderSummary(p: Props) {
    return (
        <aside className="space-y-4 rounded-3xl border border-[#C9A45B]/20 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
            <h2 className="text-xl font-black">2. Ringkasan</h2>
            {p.lines.length === 0 ? <p className="rounded-2xl border border-dashed border-[#123524]/15 p-4 text-center text-sm text-[#6D6558]">Belum ada produk dipilih.</p> : null}
            <ul className="divide-y divide-[#123524]/10 text-sm">
                {p.lines.map((l) => {
                    const product = p.byId.get(l.productId);
                    if (!product) return null;
                    return (
                        <li key={l.productId} className="flex items-center justify-between gap-2 py-2">
                            <div className="min-w-0">
                                <p className="truncate font-semibold">{product.name}</p>
                                <p className="text-xs text-[#6D6558]">{l.quantity} × {formatRupiah(product.price)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <b>{formatRupiah(product.price * l.quantity)}</b>
                                <button type="button" onClick={() => p.remove(l.productId)} aria-label={`Hapus ${product.name}`} className="text-red-600"><Trash2 size={16} /></button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <p className="flex items-center justify-between border-t border-[#123524]/10 pt-3 text-base font-black"><span>Perkiraan Total</span><span>{formatRupiah(p.subtotal)}</span></p>
            <p className="text-[11px] text-[#6D6558]">Total final dihitung oleh sistem berdasarkan harga katalog saat ini. Pembayaran DP / pelunasan dilakukan setelah pesanan dikonfirmasi.</p>

            <h2 className="pt-2 text-xl font-black">3. Data Pemesan</h2>
            <label className="block text-xs font-bold">Nama
                <input value={p.customer} onChange={(e) => p.setCustomer(e.target.value)} maxLength={120} required autoComplete="name" className={field} placeholder="Nama lengkap" />
            </label>
            <label className="block text-xs font-bold">Nomor WhatsApp
                <input value={p.phone} onChange={(e) => p.setPhone(e.target.value)} inputMode="tel" required autoComplete="tel" className={field} placeholder="08xxxxxxxxxx" />
            </label>
            <label className="block text-xs font-bold"><span className="inline-flex items-center gap-1"><CalendarDays size={14} /> Tanggal Pengambilan / Pengiriman (opsional)</span>
                <input type="date" value={p.pickupDate} min={isoDate(0)} max={isoDate(GUEST_FORM_MAX_PICKUP_DAYS)} onChange={(e) => p.setPickupDate(e.target.value)} className={field} />
            </label>
            <label className="block text-xs font-bold">Catatan (opsional)
                <textarea value={p.note} onChange={(e) => p.setNote(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border border-[#123524]/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#C9A45B]" placeholder="Contoh: ambil sore, dikirim ke alamat..." />
            </label>
            {/* Honeypot — hidden from humans, bots tend to fill it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>Website<input tabIndex={-1} autoComplete="off" value={p.website} onChange={(e) => p.setWebsite(e.target.value)} /></label>
            </div>
            {p.error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{p.error}</p> : null}
            <button type="submit" disabled={!p.canSubmit} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#123524] font-black text-white disabled:opacity-50" data-testid="guest-pre-order-submit">
                {p.busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Ajukan Pre-Order
            </button>
            <p className="text-center text-[11px] text-[#6D6558]">Tanpa login. Anda akan mendapat tautan pelacakan setelah pengajuan.</p>
        </aside>
    );
}
