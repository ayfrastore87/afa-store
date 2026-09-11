"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Minus, PackageSearch, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { formatRupiah, type PartnerProduct } from "@/components/partner/partner-shared";

// One idempotency key per sale attempt. Reused across automatic HTTP retries for
// the same attempt so a timeout + retry cannot create duplicate sales (F-3).
function newIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type CartLine = {
    productId: string;
    name: string;
    stock: number;
    sellingPrice: number;
    quantity: number;
};

type SaleResponse = { message?: string; sale?: { saleNumber: string; total: number; grossProfit: number } };

export function PartnerPosTab({ onSold }: { onSold: () => void }) {
    const [products, setProducts] = useState<PartnerProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [cart, setCart] = useState<CartLine[]>([]);
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/partner/products", { headers: { Accept: "application/json" } });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Produk gagal dimuat.");
            setProducts((data as { products: PartnerProduct[] }).products ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Produk gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const sellable = useMemo(() => products.filter((p) => p.partnerStock > 0), [products]);

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        return sellable.filter((p) => !term || p.name.toLowerCase().includes(term) || (p.flavor ?? "").toLowerCase().includes(term));
    }, [sellable, query]);

    function addToCart(product: PartnerProduct) {
        setCart((current) => {
            const existing = current.find((line) => line.productId === product.productId);
            if (existing) {
                if (existing.quantity >= Math.max(1, product.partnerStock)) return current;
                return current.map((line) =>
                    line.productId === product.productId ? { ...line, quantity: line.quantity + 1 } : line
                );
            }
            return [...current, { productId: product.productId, name: product.name, stock: product.partnerStock, sellingPrice: product.price, quantity: 1 }];
        });
    }

    function setQuantity(productId: string, quantity: number) {
        setCart((current) =>
            current
                .map((line) => {
                    if (line.productId !== productId) return line;
                    const clamped = Math.max(0, Math.min(quantity, Math.max(1, line.stock)));
                    return { ...line, quantity: clamped };
                })
                .filter((line) => line.quantity > 0)
        );
    }

    function setSellingPrice(productId: string, price: number) {
        setCart((current) => current.map((line) => (line.productId === productId ? { ...line, sellingPrice: Math.max(0, price) } : line)));
    }

    function removeLine(productId: string) {
        setCart((current) => current.filter((line) => line.productId !== productId));
    }

    const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.sellingPrice * line.quantity, 0), [cart]);
    const totalItems = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

    async function submit() {
        if (submitting || cart.length === 0) return;
        setSubmitting(true);
        setMessage("");
        try {
            const response = await fetch("/api/partner/sales", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity, sellingPrice: line.sellingPrice })),
                    note: note.trim() || undefined,
                    idempotencyKey: newIdempotencyKey(),
                }),
            });
            const data = (await response.json().catch(() => null)) as SaleResponse | null;
            if (!response.ok) throw new Error(data?.message || "Penjualan gagal diproses.");
            setMessage(`Penjualan ${data?.sale?.saleNumber} berhasil · ${formatRupiah(data?.sale?.total ?? 0)}.`);
            setCart([]);
            setNote("");
            await load();
            onSold();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "Penjualan gagal diproses.");
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat produk..." />;
    }
    if (error) {
        return <State icon={<PackageSearch size={28} />} text={error} />;
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-black text-[#184D47]">Produk</h2>
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Cari produk..."
                        className="h-11 w-full max-w-xs rounded-xl border border-[#184D47]/15 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[#D4AF37]"
                    />
                </div>

                {filtered.length === 0 ? (
                    <State icon={<PackageSearch size={28} />} text="Tidak ada produk dengan stok tersedia. Tambahkan stok terlebih dahulu." />
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {filtered.map((product) => (
                            <button
                                key={product.productId}
                                type="button"
                                onClick={() => addToCart(product)}
                                className="rounded-2xl border border-white/70 bg-white/80 p-3 text-left shadow-sm backdrop-blur transition hover:border-[#D4AF37]/60 hover:bg-white"
                            >
                                <p className="truncate text-sm font-bold text-[#184D47]">{product.name}</p>
                                <p className="text-xs text-[#184D47]/50">Harga {formatRupiah(product.price)} · Stok {product.partnerStock}</p>
                                <p className="mt-1 text-xs font-bold text-[#C9A45B]">+ Tambah</p>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            <aside className="space-y-3">
                <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                    <div className="flex items-center justify-between">
                        <h3 className="text-base font-black text-[#184D47]">Keranjang</h3>
                        <span className="text-xs font-bold text-[#184D47]/50">{totalItems} item</span>
                    </div>

                    {cart.length === 0 ? (
                        <p className="mt-4 text-sm text-[#184D47]/50">Belum ada item.</p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {cart.map((line) => (
                                <li key={line.productId} className="rounded-xl bg-white p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="min-w-0 flex-1 truncate text-sm font-bold text-[#184D47]">{line.name}</p>
                                        <button type="button" onClick={() => removeLine(line.productId)} className="text-[#8c2e25]">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <button type="button" onClick={() => setQuantity(line.productId, line.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-[#184D47]/5 text-[#184D47]">
                                            <Minus size={14} />
                                        </button>
                                        <span className="w-8 text-center text-sm font-black">{line.quantity}</span>
                                        <button type="button" onClick={() => setQuantity(line.productId, line.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-[#184D47]/5 text-[#184D47]">
                                            <Plus size={14} />
                                        </button>
                                        <input
                                            type="number"
                                            value={line.sellingPrice}
                                            min={0}
                                            onChange={(event) => setSellingPrice(line.productId, Number(event.target.value))}
                                            className="ml-auto w-28 rounded-lg border border-[#184D47]/15 px-2 py-1.5 text-right text-sm font-bold outline-none focus:ring-2 focus:ring-[#D4AF37]"
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-4 border-t border-[#184D47]/10 pt-3">
                        <label className="block text-sm font-bold">
                            Catatan (opsional)
                            <input
                                type="text"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                className="mt-2 w-full rounded-xl border border-[#184D47]/15 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[#D4AF37]"
                            />
                        </label>
                        <div className="mt-3 flex items-center justify-between">
                            <span className="text-sm font-bold text-[#184D47]/60">Total</span>
                            <span className="text-xl font-black text-[#184D47]">{formatRupiah(subtotal)}</span>
                        </div>
                        {message && <p className="mt-3 rounded-xl bg-[#184D47]/10 p-3 text-sm font-semibold text-[#184D47]">{message}</p>}
                        <button
                            type="button"
                            onClick={() => void submit()}
                            disabled={submitting || cart.length === 0}
                            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#184D47] px-5 font-black text-white shadow-lg transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submitting ? <Loader2 className="animate-spin" size={18} /> : <ShoppingCart size={18} />}
                            {submitting ? "Memproses..." : "Catat Penjualan"}
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    );
}

function State({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#184D47]/15 bg-white/50 px-4 py-10 text-center">
            <span className="text-[#C9A45B]">{icon}</span>
            <p className="text-sm font-semibold text-[#184D47]/60">{text}</p>
        </div>
    );
}
