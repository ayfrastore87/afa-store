"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpCircle, Loader2, PackageSearch, Plus } from "lucide-react";

import {
    formatDate,
    formatRupiah,
    getPartnerStockStatus,
    movementTypeLabel,
    PARTNER_STOCK_STATUS_LABELS,
    referenceLabel,
    type PartnerProduct,
    type StockMovement,
    type StockRow,
} from "@/components/partner/partner-shared";

type Props = {
    refreshSignal: number;
    onChanged: () => void;
};

type StocksResponse = { stocks: StockRow[]; movements: StockMovement[] };
type ProductsResponse = { products: PartnerProduct[] };

const stockStatusTone: Record<string, string> = {
    HABIS: "bg-[#f7e9e6] text-[#8c2e25]",
    MENIPIS: "bg-[#fff2d6] text-[#8b5e00]",
    TERSEDIA: "bg-[#e8f3e3] text-[#29621a]",
};

export function PartnerStockTab({ refreshSignal, onChanged }: Props) {
    const [stocks, setStocks] = useState<StockRow[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [products, setProducts] = useState<PartnerProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [showForm, setShowForm] = useState(false);
    const [productId, setProductId] = useState("");
    const [type, setType] = useState<"IN" | "OUT">("IN");
    const [quantity, setQuantity] = useState("");
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [movementFilter, setMovementFilter] = useState<"Semua" | "IN" | "OUT">("Semua");
    const [movementProduct, setMovementProduct] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [stocksRes, productsRes] = await Promise.all([
                fetch("/api/partner/stocks", { headers: { Accept: "application/json" } }),
                fetch("/api/partner/products", { headers: { Accept: "application/json" } }),
            ]);
            const stocksData = (await stocksRes.json().catch(() => null)) as StocksResponse | null;
            const productsData = (await productsRes.json().catch(() => null)) as ProductsResponse | null;
            if (!stocksRes.ok) throw new Error((stocksData as { message?: string } | null)?.message || "Stok gagal dimuat.");
            setStocks(stocksData?.stocks ?? []);
            setMovements(stocksData?.movements ?? []);
            setProducts(productsData?.products ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Stok gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load, refreshSignal]);

    const stockMap = useMemo(() => new Map(stocks.map((s) => [s.productId, s.quantity])), [stocks]);

    const movementProducts = useMemo(() => {
        const seen = new Map<string, string>();
        for (const movement of movements) {
            if (movement.productId && !seen.has(movement.productId)) seen.set(movement.productId, movement.productName);
        }
        return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [movements]);

    const filteredMovements = useMemo(
        () =>
            movements.filter((movement) => {
                if (movementFilter !== "Semua" && movement.type !== movementFilter) return false;
                if (movementProduct && movement.productId !== movementProduct) return false;
                return true;
            }),
        [movements, movementFilter, movementProduct]
    );

    const availableProducts = useMemo(() => {
        const ordered = [...products].sort((a, b) => (stockMap.get(b.productId) ?? -1) - (stockMap.get(a.productId) ?? -1));
        return ordered;
    }, [products, stockMap]);

    const selectedStock = productId ? stockMap.get(productId) ?? 0 : null;
    const quantityValue = Number(quantity) || 0;
    const wouldBeNegative = type === "OUT" && selectedStock !== null && quantityValue > selectedStock;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setMessage("");
        try {
            const response = await fetch("/api/partner/stocks/movement", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ type, productId, quantity: quantityValue, note: note.trim() || undefined }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error((data as { message?: string } | null)?.message || "Gagal memperbarui stok.");
            setMessage((data as { message?: string } | null)?.message || "Stok berhasil diperbarui.");
            setShowForm(false);
            setProductId("");
            setQuantity("");
            setNote("");
            await load();
            onChanged();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "Gagal memperbarui stok.");
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat stok..." />;
    }
    if (error) {
        return <State icon={<PackageSearch size={28} />} text={error} />;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-[#184D47]">Stok Produk ({stocks.length})</h2>
                <button
                    type="button"
                    onClick={() => setShowForm((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#184D47] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 active:scale-95"
                >
                    <Plus size={16} />
                    Mutasi Stok
                </button>
            </div>

            {showForm && (
                <form onSubmit={submit} className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-bold">
                            Produk
                            <select
                                value={productId}
                                onChange={(event) => setProductId(event.target.value)}
                                required
                                className="mt-2 w-full rounded-xl border border-[#184D47]/15 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-[#D4AF37]"
                            >
                                <option value="">Pilih produk</option>
                                {availableProducts.map((p) => (
                                    <option key={p.productId} value={p.productId}>
                                        {p.name} — stok {stockMap.get(p.productId) ?? 0}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-sm font-bold">
                            Jenis
                            <select
                                value={type}
                                onChange={(event) => setType(event.target.value as "IN" | "OUT")}
                                className="mt-2 w-full rounded-xl border border-[#184D47]/15 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-[#D4AF37]"
                            >
                                <option value="IN">Stok Masuk</option>
                                <option value="OUT">Stok Keluar</option>
                            </select>
                        </label>
                        <label className="block text-sm font-bold">
                            Jumlah
                            <input
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={(event) => setQuantity(event.target.value)}
                                required
                                className="mt-2 w-full rounded-xl border border-[#184D47]/15 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-[#D4AF37]"
                            />
                        </label>
                        <label className="block text-sm font-bold">
                            Catatan (opsional)
                            <input
                                type="text"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                className="mt-2 w-full rounded-xl border border-[#184D47]/15 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-[#D4AF37]"
                            />
                        </label>
                    </div>

                    {selectedStock !== null && (
                        <p className="mt-3 text-xs text-[#184D47]/60">
                            Stok saat ini: <b>{selectedStock}</b> unit
                            {wouldBeNegative && <span className="ml-2 font-bold text-red-600">Stok keluar melebihi stok tersedia.</span>}
                        </p>
                    )}
                    {message && <p className="mt-3 rounded-xl bg-[#184D47]/10 p-3 text-sm font-semibold text-[#184D47]">{message}</p>}

                    <div className="mt-4 flex gap-2">
                        <button
                            type="submit"
                            disabled={submitting || wouldBeNegative}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#184D47] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submitting ? <Loader2 className="animate-spin" size={16} /> : <ArrowUpCircle size={16} />}
                            Simpan
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="rounded-xl border border-[#184D47]/15 px-4 py-2.5 text-sm font-bold text-[#184D47]/60 transition hover:bg-[#184D47]/5"
                        >
                            Batal
                        </button>
                    </div>
                </form>
            )}

            {stocks.length === 0 ? (
                <State icon={<PackageSearch size={28} />} text="Belum ada stok. Gunakan Mutasi Stok (Stok Masuk) untuk menambah." />
            ) : (
                <ul className="grid gap-2">
                    {stocks.map((stock) => (
                        <li key={stock.productId} className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[#184D47]">{stock.name}</p>
                                <p className="text-xs text-[#184D47]/50">Modal {formatRupiah(stock.unitCost)} · diperbarui {formatDate(stock.updatedAt)}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${stockStatusTone[getPartnerStockStatus(stock.quantity)]}`}>
                                {stock.quantity} unit · {PARTNER_STOCK_STATUS_LABELS[getPartnerStockStatus(stock.quantity)]}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-black text-[#184D47]">Riwayat Mutasi</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        {(["Semua", "IN", "OUT"] as const).map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                onClick={() => setMovementFilter(filter)}
                                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                                    movementFilter === filter ? "bg-[#184D47] text-white" : "bg-white/80 text-[#184D47]/60 hover:bg-white"
                                }`}
                            >
                                {filter === "Semua" ? "Semua" : movementTypeLabel(filter)}
                            </button>
                        ))}
                        {movementProducts.length > 0 && (
                            <select
                                value={movementProduct}
                                onChange={(event) => setMovementProduct(event.target.value)}
                                className="rounded-full border border-[#184D47]/15 bg-white/80 px-3 py-1 text-xs font-bold text-[#184D47]/60 outline-none focus:ring-2 focus:ring-[#D4AF37]"
                            >
                                <option value="">Semua produk</option>
                                {movementProducts.map(([id, name]) => (
                                    <option key={id} value={id}>{name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
                {movements.length === 0 ? (
                    <State icon={<PackageSearch size={28} />} text="Belum ada mutasi stok." />
                ) : filteredMovements.length === 0 ? (
                    <State icon={<PackageSearch size={28} />} text="Tidak ada mutasi untuk filter ini." />
                ) : (
                    <ul className="grid gap-2">
                        {filteredMovements.map((movement) => (
                            <li key={movement.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-[#184D47]">{movement.productName}</p>
                                    <p className="text-xs text-[#184D47]/50">
                                        {movementTypeLabel(movement.type)} · {referenceLabel(movement.referenceType)} · {formatDate(movement.createdAt)}
                                        {movement.unitPrice != null ? ` · ${formatRupiah(movement.unitPrice)}/unit` : ""}
                                        {movement.note ? ` · ${movement.note}` : ""}
                                    </p>
                                </div>
                                <span className={`shrink-0 text-sm font-black ${movement.type === "IN" ? "text-[#29621a]" : "text-[#8c2e25]"}`}>
                                    {movement.type === "IN" ? "+" : "-"}{movement.quantity}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
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
