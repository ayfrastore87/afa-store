"use client";

// Admin manual Pre-Order entry (source ADMIN_MANUAL). Items may come from the
// catalog (price resolved server-side) or be typed manually (admin-only).
// Totals shown here are previews only — the server recomputes everything.

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { fetchProducts, type Product } from "@/lib/products";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import { formatRupiah } from "@/components/admin/kasir/kasir-shared";

type DraftItem = { key: string; productId: string | null; name: string; quantity: number; price: number; notes: string };

const emptyItem = (): DraftItem => ({ key: Math.random().toString(36).slice(2), productId: null, name: "", quantity: 1, price: 0, notes: "" });

export default function AdminPreOrderCreate({ endpoint = "/api/admin/pre-orders", onCreated }: { endpoint?: string; onCreated?: (poNumber: string) => void }) {
    const [open, setOpen] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [customer, setCustomer] = useState("");
    const [phone, setPhone] = useState("");
    const [pickupDate, setPickupDate] = useState("");
    const [note, setNote] = useState("");
    const [discount, setDiscount] = useState("0");
    const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open || products.length) return;
        void fetchProducts().then((rows) => setProducts(rows ?? [])).catch(() => setProducts([]));
    }, [open, products.length]);

    const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.price, 0), [items]);
    const discountNumber = Number(discount.replace(/\D/g, "")) || 0;
    const total = Math.max(subtotal - Math.min(discountNumber, subtotal), 0);

    const update = (key: string, patch: Partial<DraftItem>) => setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

    const pickProduct = (key: string, productId: string) => {
        const product = products.find((row) => row.id === productId);
        if (!product) return update(key, { productId: null });
        update(key, { productId: product.id, name: product.name, price: product.price });
    };

    const reset = () => {
        setCustomer(""); setPhone(""); setPickupDate(""); setNote(""); setDiscount("0"); setItems([emptyItem()]);
    };

    const submit = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    customer,
                    phone,
                    pickupDate: pickupDate || undefined,
                    note: note || undefined,
                    discount: discountNumber,
                    items: items.filter((row) => row.name.trim()).map((row) => ({ productId: row.productId, name: row.name, quantity: row.quantity, price: row.price, notes: row.notes || undefined })),
                }),
            });
            const data = (await response.json().catch(() => ({}))) as { message?: string; preOrder?: { poNumber: string } };
            if (!response.ok || !data.preOrder) throw new Error(data.message || "Gagal membuat pre-order.");
            await Swal.fire({ icon: "success", title: "Pre-order dibuat", text: `${data.preOrder.poNumber} — total ${formatRupiah(total)}. Terima DP / pelunasan lewat panel di bawah.`, confirmButtonColor: "#184D47" });
            reset();
            setOpen(false);
            onCreated?.(data.preOrder.poNumber);
            window.location.reload();
        } catch (e) {
            await Swal.fire({ icon: "error", title: "Gagal", text: getUserFacingMessage(e, "Coba lagi."), confirmButtonColor: "#184D47" });
        } finally {
            setBusy(false);
        }
    };

    const inputClass = "mt-1 h-11 w-full rounded-xl border border-[#123524]/15 bg-white px-3 text-sm font-semibold";

    return (
        <section className="rounded-2xl border border-[#C9A45B]/40 bg-[#FFFDF7] p-4 shadow-sm" data-testid="admin-pre-order-create">
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
                <div>
                    <p className="text-xs font-black uppercase tracking-[.2em] text-[#C9A45B]">PRE-ORDER</p>
                    <h2 className="text-xl font-black">Buat Pre-Order Manual</h2>
                </div>
                {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {open ? (
                <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-bold">Nama Pelanggan<input value={customer} onChange={(e) => setCustomer(e.target.value)} className={inputClass} /></label>
                        <label className="text-xs font-bold">No. WhatsApp<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} placeholder="08xxxxxxxxxx" /></label>
                        <label className="text-xs font-bold">Tanggal Ambil<input type="datetime-local" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className={inputClass} /></label>
                        <label className="text-xs font-bold">Diskon (Rp)<input value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inputClass} /></label>
                        <label className="text-xs font-bold sm:col-span-2">Catatan<input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} /></label>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-black uppercase tracking-wide text-[#123524]/60">Item</p>
                        {items.map((item) => (
                            <div key={item.key} className="grid gap-2 rounded-xl border border-[#123524]/10 bg-white p-3 sm:grid-cols-12">
                                <select value={item.productId ?? ""} onChange={(e) => pickProduct(item.key, e.target.value)} className="h-10 rounded-lg border border-[#123524]/15 px-2 text-xs sm:col-span-4">
                                    <option value="">— Item manual —</option>
                                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({formatRupiah(product.price)})</option>)}
                                </select>
                                <input value={item.name} onChange={(e) => update(item.key, { name: e.target.value })} placeholder="Nama item" disabled={Boolean(item.productId)} className="h-10 rounded-lg border border-[#123524]/15 px-2 text-xs sm:col-span-3 disabled:bg-[#F8F5EE]" />
                                <input value={item.quantity} onChange={(e) => update(item.key, { quantity: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })} inputMode="numeric" className="h-10 rounded-lg border border-[#123524]/15 px-2 text-xs sm:col-span-1" aria-label="Jumlah" />
                                <input value={item.price} onChange={(e) => update(item.key, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })} inputMode="numeric" disabled={Boolean(item.productId)} className="h-10 rounded-lg border border-[#123524]/15 px-2 text-xs sm:col-span-2 disabled:bg-[#F8F5EE]" aria-label="Harga" />
                                <input value={item.notes} onChange={(e) => update(item.key, { notes: e.target.value })} placeholder="Catatan" className="h-10 rounded-lg border border-[#123524]/15 px-2 text-xs sm:col-span-1" />
                                <button type="button" onClick={() => setItems((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== item.key) : rows))} className="grid h-10 place-items-center rounded-lg border border-red-200 text-red-700 sm:col-span-1" aria-label="Hapus item"><Trash2 size={16} /></button>
                            </div>
                        ))}
                        <button type="button" onClick={() => setItems((rows) => [...rows, emptyItem()])} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#123524]/15 px-3 text-xs font-bold"><Plus size={14} /> Tambah item</button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#184D47] p-4 text-[#F8F5EE]">
                        <div className="text-sm"><p className="opacity-70">Subtotal {formatRupiah(subtotal)}{discountNumber > 0 ? ` · diskon ${formatRupiah(Math.min(discountNumber, subtotal))}` : ""}</p><p className="text-xl font-black">Total {formatRupiah(total)}</p></div>
                        <button type="button" onClick={() => void submit()} disabled={busy || !customer.trim() || !phone.trim() || total <= 0} className="h-11 rounded-xl bg-[#D4AF37] px-5 font-black text-[#184D47] disabled:opacity-60">{busy ? "Menyimpan..." : "Simpan Pre-Order"}</button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
