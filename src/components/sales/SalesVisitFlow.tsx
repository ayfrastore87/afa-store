"use client";

// Mobile-first "Catat Kunjungan" wizard:
//   1) pick an assigned store, 2) tap +/- per product (terjual/supply/retur/
//   rusak), 3) payment, 4) confirmation, then ONE POST /api/sales/visits.
// Every displayed total is a preview; the server recomputes everything and a
// fresh idempotencyKey per attempt makes double submits harmless.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, Loader2, Minus, Plus, Store } from "lucide-react";

import { formatRupiah } from "./sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type StoreOption = { id: string; name: string; address: string | null; totalStock: number };

type ProductRow = {
    id: string;
    name: string;
    size: string | null;
    unitPrice: number;
    currentStock: number;
    warehouseStock: number;
};

type Movement = { sold: number; supplied: number; returned: number; damaged: number };

const EMPTY_MOVEMENT: Movement = { sold: 0, supplied: 0, returned: 0, damaged: 0 };

function closingOf(row: ProductRow, movement: Movement) {
    return row.currentStock + movement.supplied - movement.sold - movement.returned - movement.damaged;
}

function Stepper({ label, value, onChange, max }: { label: string; value: number; onChange: (next: number) => void; max?: number }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-sm font-bold text-[#123524]/70">{label}</span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label={`Kurangi ${label}`}
                    onClick={() => onChange(Math.max(0, value - 1))}
                    className="grid h-11 w-11 place-items-center rounded-xl border border-[#123524]/15 bg-white text-[#184D47] active:scale-95"
                >
                    <Minus size={18} />
                </button>
                <span className="w-10 text-center text-base font-black tabular-nums">{value}</span>
                <button
                    type="button"
                    aria-label={`Tambah ${label}`}
                    onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
                    className="grid h-11 w-11 place-items-center rounded-xl border border-[#123524]/15 bg-white text-[#184D47] active:scale-95"
                >
                    <Plus size={18} />
                </button>
            </div>
        </div>
    );
}

export function SalesVisitFlow() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedStoreId = searchParams.get("storeId");

    const [step, setStep] = useState<"store" | "items" | "payment" | "confirm" | "done">("store");
    const [stores, setStores] = useState<StoreOption[] | null>(null);
    const [storeId, setStoreId] = useState<string | null>(null);
    const [storeName, setStoreName] = useState("");
    const [products, setProducts] = useState<ProductRow[] | null>(null);
    const [movements, setMovements] = useState<Record<string, Movement>>({});
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER" | "NONE">("NONE");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    // One idempotency key per confirmation screen: retrying after a network
    // error reuses it, so the server records the visit at most once.
    const idempotencyKeyRef = useRef<string>("");

    useEffect(() => {
        let disposed = false;
        fetch("/api/sales/stores", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Daftar toko gagal dimuat.");
                if (disposed) return;
                const list = (payload as { stores: StoreOption[] }).stores;
                setStores(list);
                if (preselectedStoreId && list.some((store) => store.id === preselectedStoreId)) {
                    selectStore(preselectedStoreId, list.find((store) => store.id === preselectedStoreId)!.name);
                }
            })
            .catch((err) => { if (!disposed) setError(getUserFacingMessage(err, "Daftar toko gagal dimuat.")); });
        return () => { disposed = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preselectedStoreId]);

    function selectStore(id: string, name: string) {
        setStoreId(id);
        setStoreName(name);
        setProducts(null);
        setMovements({});
        setError("");
        setStep("items");
        fetch(`/api/sales/stores/${id}`, { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Data toko gagal dimuat.");
                setStoreName((payload as { store: { name: string } }).store.name);
                setProducts((payload as { products: ProductRow[] }).products);
            })
            .catch((err) => setError(getUserFacingMessage(err, "Data toko gagal dimuat.")));
    }

    const activeItems = useMemo(() => {
        if (!products) return [];
        return products
            .map((row) => ({ row, movement: movements[row.id] ?? EMPTY_MOVEMENT }))
            .filter(({ movement }) => movement.sold + movement.supplied + movement.returned + movement.damaged > 0);
    }, [products, movements]);

    const preview = useMemo(() => {
        let sold = 0;
        let supplied = 0;
        let salesAmount = 0;
        let closing = 0;
        for (const { row, movement } of activeItems) {
            sold += movement.sold;
            supplied += movement.supplied;
            salesAmount += movement.sold * row.unitPrice;
            closing += closingOf(row, movement);
        }
        return { sold, supplied, salesAmount, closing };
    }, [activeItems]);

    const paidAmount = paymentMethod === "NONE" ? 0 : Math.max(0, Math.floor(Number(paymentAmount) || 0));
    const receivableDelta = Math.max(0, preview.salesAmount - paidAmount);

    function setMovement(productId: string, key: keyof Movement, value: number) {
        setMovements((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? EMPTY_MOVEMENT), [key]: value } }));
    }

    const hasNegativeClosing = activeItems.some(({ row, movement }) => closingOf(row, movement) < 0);

    async function submit() {
        if (!storeId || submitting) return;
        setSubmitting(true);
        setError("");
        if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
        try {
            const response = await fetch("/api/sales/visits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    storeId,
                    idempotencyKey: idempotencyKeyRef.current,
                    items: activeItems.map(({ row, movement }) => ({
                        productId: row.id,
                        quantitySold: movement.sold,
                        quantitySupplied: movement.supplied,
                        quantityReturned: movement.returned,
                        quantityDamaged: movement.damaged,
                    })),
                    payment: paymentMethod !== "NONE" && paidAmount > 0 ? { amount: paidAmount, method: paymentMethod } : null,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || "Kunjungan gagal disimpan.");
            setStep("done");
        } catch (err) {
            setError(getUserFacingMessage(err, "Kunjungan gagal disimpan."));
        } finally {
            setSubmitting(false);
        }
    }

    if (step === "done") {
        return (
            <div className="grid min-h-[50dvh] place-items-center">
                <div className="sales-card w-full rounded-2xl bg-white p-8 text-center shadow-sm">
                    <CheckCircle2 size={48} className="mx-auto text-[#2E8B57]" />
                    <h1 className="mt-4 text-xl font-black">Kunjungan Tersimpan</h1>
                    <p className="mt-1 text-sm text-[#123524]/60">{storeName}</p>
                    <button onClick={() => router.push("/sales")} className="mt-6 min-h-12 w-full rounded-xl bg-[#184D47] font-black text-[#F8F5EE]">Kembali ke Beranda</button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                {step !== "store" && (
                    <button
                        type="button"
                        aria-label="Kembali"
                        onClick={() => setStep(step === "items" ? "store" : step === "payment" ? "items" : "payment")}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-[#123524]/15 bg-white"
                    >
                        <ChevronLeft size={18} />
                    </button>
                )}
                <h1 className="text-xl font-black">Catat Kunjungan</h1>
            </div>

            {error && <p className="sales-card rounded-2xl bg-white p-4 text-sm font-semibold text-red-700">{error}</p>}

            {step === "store" && (
                <div className="space-y-3">
                    <p className="text-sm font-bold text-[#123524]/60">Pilih toko yang dikunjungi:</p>
                    {!stores && <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin text-[#184D47]" /></div>}
                    {stores?.length === 0 && (
                        <div className="sales-card grid place-items-center gap-2 rounded-2xl bg-white p-8 text-center">
                            <Store className="text-[#D4AF37]" />
                            <p className="text-sm font-semibold text-[#123524]/55">Belum ada toko yang ditugaskan.</p>
                        </div>
                    )}
                    {stores?.map((store) => (
                        <button
                            key={store.id}
                            type="button"
                            onClick={() => selectStore(store.id, store.name)}
                            className="sales-card block w-full rounded-2xl bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"
                        >
                            <p className="font-black uppercase">{store.name}</p>
                            {store.address && <p className="text-xs font-semibold text-[#123524]/50">{store.address}</p>}
                            <p className="mt-1 text-xs font-bold text-[#184D47]">Stok titipan: {store.totalStock} pcs</p>
                        </button>
                    ))}
                </div>
            )}

            {step === "items" && (
                <div className="space-y-3 pb-24">
                    <p className="sales-card rounded-2xl bg-white p-4 text-sm font-black uppercase">{storeName}</p>
                    {!products && <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin text-[#184D47]" /></div>}
                    {products?.map((row) => {
                        const movement = movements[row.id] ?? EMPTY_MOVEMENT;
                        const closing = closingOf(row, movement);
                        const invalid = closing < 0;
                        return (
                            <div key={row.id} className={`sales-card rounded-2xl bg-white p-4 shadow-sm ${invalid ? "ring-2 ring-red-400" : ""}`}>
                                <p className="font-black">{row.name}{row.size ? ` ${row.size}` : ""}</p>
                                <p className="text-xs font-semibold text-[#123524]/50">
                                    Stok sebelumnya: {row.currentStock} pcs · {formatRupiah(row.unitPrice)}/pcs
                                </p>
                                <div className="mt-2 divide-y divide-[#123524]/5">
                                    <Stepper label="Terjual" value={movement.sold} onChange={(v) => setMovement(row.id, "sold", v)} />
                                    <Stepper label="Supply baru" value={movement.supplied} onChange={(v) => setMovement(row.id, "supplied", v)} max={row.warehouseStock} />
                                    <Stepper label="Retur" value={movement.returned} onChange={(v) => setMovement(row.id, "returned", v)} />
                                    <Stepper label="Rusak" value={movement.damaged} onChange={(v) => setMovement(row.id, "damaged", v)} />
                                </div>
                                <p className={`mt-2 border-t border-[#123524]/10 pt-2 text-sm font-black ${invalid ? "text-red-600" : ""}`}>
                                    STOK AKHIR: {closing} pcs{invalid ? " — melebihi stok tersedia" : ""}
                                </p>
                            </div>
                        );
                    })}
                    <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-2xl px-4 pb-2">
                        <button
                            type="button"
                            disabled={activeItems.length === 0 || hasNegativeClosing}
                            onClick={() => setStep("payment")}
                            className="min-h-14 w-full rounded-2xl bg-[#184D47] font-black text-[#F8F5EE] shadow-lg shadow-[#184D47]/25 disabled:opacity-40"
                        >
                            LANJUT KE PEMBAYARAN
                        </button>
                    </div>
                </div>
            )}

            {step === "payment" && (
                <div className="space-y-4">
                    <div className="sales-card rounded-2xl bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#123524]/60">Ringkasan</h2>
                        <dl className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Terjual</dt><dd className="font-black">{preview.sold} pcs</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Nilai penjualan</dt><dd className="font-black">{formatRupiah(preview.salesAmount)}</dd></div>
                        </dl>
                    </div>

                    <div className="sales-card rounded-2xl bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#123524]/60">Pembayaran diterima</h2>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {([["CASH", "Tunai"], ["TRANSFER", "Transfer"], ["NONE", "Belum Bayar"]] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setPaymentMethod(value)}
                                    className={`min-h-12 rounded-xl border text-sm font-black transition ${paymentMethod === value ? "border-[#184D47] bg-[#184D47] text-[#F8F5EE]" : "border-[#123524]/15 bg-white text-[#123524]/70"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {paymentMethod !== "NONE" && (
                            <label className="mt-4 block text-sm font-bold">
                                Nominal (Rp)
                                <input
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value.replace(/\D/g, ""))}
                                    placeholder="0"
                                    className="mt-2 h-12 w-full rounded-xl border border-[#123524]/15 bg-white px-4 text-base font-black"
                                />
                            </label>
                        )}
                        {paymentMethod === "NONE" && (
                            <p className="mt-3 text-xs font-semibold text-[#8B6B3F]">Belum bayar: nilai penjualan otomatis menjadi piutang toko.</p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => { idempotencyKeyRef.current = ""; setStep("confirm"); }}
                        className="min-h-14 w-full rounded-2xl bg-[#184D47] font-black text-[#F8F5EE] shadow-lg shadow-[#184D47]/25"
                    >
                        LANJUT KE KONFIRMASI
                    </button>
                </div>
            )}

            {step === "confirm" && (
                <div className="space-y-4">
                    <div className="sales-card rounded-2xl bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#123524]/60">Ringkasan Kunjungan</h2>
                        <p className="mt-2 text-lg font-black">{storeName}</p>
                        <p className="text-xs font-semibold text-[#123524]/50">
                            {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date())}
                        </p>
                        <dl className="mt-4 space-y-2 text-sm">
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Terjual</dt><dd className="font-black">{preview.sold} pcs</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Supply Baru</dt><dd className="font-black">{preview.supplied} pcs</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Stok Akhir</dt><dd className="font-black">{preview.closing} pcs</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Nilai Penjualan</dt><dd className="font-black">{formatRupiah(preview.salesAmount)}</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Dibayar</dt><dd className="font-black">{formatRupiah(paidAmount)}</dd></div>
                            <div className="flex justify-between border-t border-[#123524]/10 pt-2"><dt className="font-bold text-[#8B6B3F]">Piutang Bertambah</dt><dd className="font-black text-[#8B6B3F]">{formatRupiah(receivableDelta)}</dd></div>
                        </dl>
                    </div>

                    <button
                        type="button"
                        disabled={submitting}
                        onClick={submit}
                        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#184D47] font-black text-[#F8F5EE] shadow-lg shadow-[#184D47]/25 disabled:opacity-60"
                    >
                        {submitting ? <><Loader2 size={18} className="animate-spin" /> MENYIMPAN...</> : "SIMPAN KUNJUNGAN"}
                    </button>
                    <Link href="/sales" className="block text-center text-sm font-bold text-[#123524]/50">Batalkan</Link>
                </div>
            )}
        </div>
    );
}