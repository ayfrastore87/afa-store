"use client";

// Mobile-first "Catat Kunjungan" wizard:
//   1) pick an assigned store, 2) tap +/- per product (terjual/supply/retur/
//   rusak), 3) payment, 4) confirmation, then ONE POST /api/sales/visits.
// Every displayed total is a preview; the server recomputes everything and a
// fresh idempotencyKey per attempt makes double submits harmless.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, Loader2, Minus, Plus, Store, MapPin, Camera } from "lucide-react";

import { formatRupiah } from "./sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import { optimizeSalesVisitImage } from "@/lib/sales-visit-image";
import { SalesStoreRegistration } from "./SalesStoreRegistration";

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

    const [step, setStep] = useState<"store" | "photo" | "items" | "payment" | "confirm" | "done">("store");
    const steps = [["store", "1 Lokasi"], ["photo", "2 Foto"], ["items", "3 Barang"], ["payment", "4 Uang"], ["confirm", "5 Konfirmasi"]] as const;
    const [stores, setStores] = useState<StoreOption[] | null>(null);
    const [storeId, setStoreId] = useState<string | null>(null);
    const [storeName, setStoreName] = useState("");
    const [previousReceivable, setPreviousReceivable] = useState<number | null>(null);
    const [products, setProducts] = useState<ProductRow[] | null>(null);
    const [movements, setMovements] = useState<Record<string, Movement>>({});
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER" | "NONE">("NONE");
    const [paymentReference, setPaymentReference] = useState("");
    const [paymentNotes, setPaymentNotes] = useState("");
    const [visitNotes, setVisitNotes] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number; capturedAt: string } | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [photoPath, setPhotoPath] = useState<string | null>(null);
    const [photoStatus, setPhotoStatus] = useState("");
    const [registeringStore, setRegisteringStore] = useState(false);
    // One idempotency key per confirmation screen: retrying after a network
    // error reuses it, so the server records the visit at most once.
    const idempotencyKeyRef = useRef<string>("");

    function captureLocation() {
        setError("");
        if (!navigator.geolocation) { setError("Browser ini belum mendukung lokasi."); return; }
        navigator.geolocation.getCurrentPosition(
            (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date().toISOString() }),
            (problem) => setError(problem.code === 1 ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk melanjutkan." : problem.code === 3 ? "Pengambilan lokasi melewati batas waktu." : "Lokasi tidak tersedia. Coba lagi."),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    }

    async function uploadPhoto(file: File) {
        setPhotoStatus("Menyiapkan foto...");
        if (file.size > 20 * 1024 * 1024) { setPhotoStatus(""); setError("Foto sumber maksimal 20 MB."); return; }
        const optimized = await optimizeSalesVisitImage(file);
        const form = new FormData(); form.append("file", optimized.file, optimized.file.name);
        const response = await fetch("/api/sales/visits/photo", { method: "POST", body: form });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Foto gagal diunggah.");
        if (photoPath) void fetch("/api/sales/visits/photo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: photoPath }) });
        setPhotoUrl(payload.url); setPhotoPath(payload.path); setPhotoStatus(`Foto siap diunggah · WebP · ${optimized.width} × ${optimized.height} · ${Math.ceil(optimized.file.size / 1024)} KB`);
    }

    function removePhoto() {
        const oldPath = photoPath;
        setPhotoUrl(null); setPhotoPath(null); setPhotoStatus("");
        if (oldPath) void fetch("/api/sales/visits/photo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: oldPath }) });
    }

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
        setPreviousReceivable(null);
        setProducts(null);
        setMovements({});
        setError("");
        setStep("photo");
        fetch(`/api/sales/stores/${id}`, { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Data toko gagal dimuat.");
                const detail = payload as { store: { name: string; receivable?: number } };
                setStoreName(detail.store.name);
                setPreviousReceivable(typeof detail.store.receivable === "number" ? detail.store.receivable : null);
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
    const totalBill = previousReceivable === null ? null : previousReceivable + preview.salesAmount;
    const remainingReceivable = totalBill === null ? null : Math.max(0, totalBill - paidAmount);

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
                    latitude: location?.latitude,
                    longitude: location?.longitude,
                    locationAccuracy: location?.accuracy,
                    locationCapturedAt: location?.capturedAt,
                    photoPath,
                    notes: visitNotes.trim() || undefined,
                    payment: paymentMethod !== "NONE" && paidAmount > 0 ? { amount: paidAmount, method: paymentMethod, reference: paymentReference.trim() || undefined, notes: paymentNotes.trim() || undefined } : null,
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
                    <h1 className="mt-4 text-xl font-black">Kunjungan berhasil disimpan</h1>
                    <p className="mt-1 text-sm text-[#123524]/60">{storeName}</p>
                    <p className="mt-3 text-sm font-bold">Nilai Penjualan {formatRupiah(preview.salesAmount)} · Setoran {formatRupiah(paidAmount)} · Sisa Piutang {formatRupiah(receivableDelta)}</p>
                    {photoStatus && <p className="mt-2 text-xs font-semibold text-[#123524]/55">{photoStatus}</p>}
                    {photoUrl && <img src={photoUrl} alt="Foto kunjungan" className="mx-auto mt-4 h-24 w-24 rounded-xl object-cover" />}
                    <div className="mt-6 grid gap-2"><button onClick={() => router.push("/sales/riwayat")} className="min-h-12 w-full rounded-xl bg-[#184D47] font-black text-[#F8F5EE]">Lihat Riwayat</button><button onClick={() => router.push("/sales")} className="min-h-12 w-full rounded-xl border border-[#184D47] font-black text-[#184D47]">Kembali ke Beranda</button></div>
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
                        onClick={() => setStep(step === "photo" ? "store" : step === "items" ? "photo" : step === "payment" ? "items" : "payment")}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-[#123524]/15 bg-white"
                    >
                        <ChevronLeft size={18} />
                    </button>
                )}
                <h1 className="text-xl font-black">Catat Kunjungan</h1>
            </div>
            <nav aria-label="Langkah kunjungan" className="grid grid-cols-5 gap-1">
                {steps.map(([key, label]) => <button key={key} type="button" onClick={() => setStep(key)} className={`rounded-lg px-1 py-2 text-[10px] font-black ${step === key ? "bg-[#184D47] text-white" : "bg-white text-[#123524]/55"}`}>{label}</button>)}
            </nav>

            {error && <p className="sales-card rounded-2xl bg-white p-4 text-sm font-semibold text-red-700">{error}</p>}

            {step !== "store" && (
                <section className="sales-card space-y-3 rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between"><h2 className="font-black">Lokasi & Foto Toko</h2><MapPin size={18} className="text-[#D4AF37]" /></div>
                    {location ? <p className="text-sm font-bold text-[#29621a]">Lokasi berhasil direkam · Akurasi ±{Math.round(location.accuracy)} m · {new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(location.capturedAt))}</p> : <p className="text-sm text-[#123524]/55">Lokasi belum direkam.</p>}
                    <button type="button" onClick={captureLocation} className="min-h-11 rounded-xl bg-[#184D47] px-4 text-sm font-black text-[#F8F5EE]">{location ? "Perbarui Lokasi" : "Ambil Lokasi Saya"}</button>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#123524]/15 px-4 text-sm font-black"><Camera size={17} /> {photoUrl ? "Ganti Foto Toko" : "Ambil / Pilih Foto Toko"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadPhoto(file).catch((err) => setError(err instanceof Error ? err.message : "Foto gagal diunggah.")); }} /></label>
                    {photoStatus && <p className="text-xs font-bold text-[#29621a]">{photoStatus}</p>}
                    {photoUrl && <button type="button" onClick={() => { const old = photoPath; setPhotoUrl(null); setPhotoPath(null); setPhotoStatus(""); if (old) void fetch("/api/sales/visits/photo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: old }) }); }} className="text-xs font-bold text-red-700">Hapus foto</button>}
                </section>
            )}

            {step === "photo" && (
                <button type="button" onClick={() => { if (!location) { setError("Ambil lokasi sebelum melanjutkan."); return; } setStep("items"); }} className="min-h-14 w-full rounded-2xl bg-[#184D47] font-black text-[#F8F5EE]">LANJUT KE BARANG</button>
            )}

            {step === "store" && (
                <div className="space-y-3">
                    <p className="text-sm font-bold text-[#123524]/60">Pilih toko yang dikunjungi:</p>
                    {!registeringStore && <button type="button" onClick={() => setRegisteringStore(true)} className="min-h-14 w-full rounded-2xl border-2 border-dashed border-[#D4AF37] bg-[#fffaf0] font-black text-[#184D47]">+ DAFTARKAN TOKO BARU</button>}
                    {registeringStore && <SalesStoreRegistration onCreated={async (store) => { const response = await fetch("/api/sales/stores", { headers: { Accept: "application/json" }, cache: "no-store" }); const payload = await response.json().catch(() => null); if (!response.ok) { setError(payload?.message || "Toko berhasil dibuat, tetapi daftar toko gagal dimuat. Muat ulang lalu pilih toko tersebut."); return; } const refreshed = (payload as { stores: StoreOption[] }).stores; setStores(refreshed); setRegisteringStore(false); const created = refreshed.find((item) => item.id === store.id); if (created) selectStore(created.id, created.name); else setError("Toko berhasil dibuat, tetapi belum terlihat pada daftar toko. Coba muat ulang."); }} />}
                    {!stores && <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin text-[#184D47]" /></div>}
                    {stores?.length === 0 && (
                        <div className="sales-card grid place-items-center gap-2 rounded-2xl bg-white p-8 text-center">
                            <Store className="text-[#D4AF37]" />
                            <p className="text-sm font-semibold text-[#123524]/55">Belum ada toko yang terdaftar untuk Anda. Jika sedang berada di toko baru, daftarkan toko langsung dari lokasi kunjungan.</p>
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
                        <label className="mt-4 block text-sm font-bold">Referensi Pembayaran (opsional)<input maxLength={150} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#123524]/15 bg-white px-4" /></label>
                        <label className="mt-4 block text-sm font-bold">Catatan Pembayaran (opsional)<textarea maxLength={500} value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-[#123524]/15 bg-white p-3" /></label>
                        <label className="mt-4 block text-sm font-bold">Catatan Kunjungan (opsional)<textarea maxLength={500} value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-[#123524]/15 bg-white p-3" /></label>
                        <dl className="mt-4 space-y-2 border-t pt-3 text-sm"><div className="flex justify-between"><dt>Nilai Penjualan Hari Ini</dt><dd className="font-black">{formatRupiah(preview.salesAmount)}</dd></div><div className="flex justify-between"><dt>Piutang Sebelumnya</dt><dd className="font-black">{previousReceivable === null ? "Belum tersedia" : formatRupiah(previousReceivable)}</dd></div><div className="flex justify-between"><dt>Total Tagihan</dt><dd className="font-black">{totalBill === null ? "Belum tersedia" : formatRupiah(totalBill)}</dd></div><div className="flex justify-between"><dt>Uang Diterima</dt><dd className="font-black">{formatRupiah(paidAmount)}</dd></div><div className="flex justify-between"><dt>Sisa Piutang</dt><dd className="font-black">{remainingReceivable === null ? "Belum tersedia" : formatRupiah(remainingReceivable)}</dd></div></dl>
                    </div>

                    <button
                        type="button"
                        onClick={() => setStep("confirm")}
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
                        {location && <section className="mt-4 rounded-xl bg-[#f8f5ee] p-3 text-sm"><b>Lokasi</b><p>{location.latitude}, {location.longitude} · akurasi ±{Math.round(location.accuracy)} m</p><p>{location.capturedAt}</p></section>}
                        {photoUrl && <img src={photoUrl} alt="Thumbnail foto kunjungan" className="mt-4 h-24 w-24 rounded-xl object-cover" />}
                        <section className="mt-4"><h3 className="font-black">Barang</h3>{activeItems.length === 0 ? <p className="text-sm text-[#123524]/55">Tidak ada perubahan stok.</p> : activeItems.map(({ row, movement }) => <p key={row.id} className="mt-2 text-sm">{row.name}: buka {row.currentStock}, supply {movement.supplied}, jual {movement.sold}, retur {movement.returned}, rusak {movement.damaged}, tutup {closingOf(row, movement)}</p>)}</section>
                        <dl className="mt-4 space-y-2 text-sm">
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Terjual</dt><dd className="font-black">{preview.sold} pcs</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Supply Baru</dt><dd className="font-black">{preview.supplied} pcs</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Stok Akhir</dt><dd className="font-black">{preview.closing} pcs</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Nilai Penjualan</dt><dd className="font-black">{formatRupiah(preview.salesAmount)}</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Dibayar</dt><dd className="font-black">{formatRupiah(paidAmount)}</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Metode</dt><dd className="font-black">{paymentMethod === "CASH" ? "Tunai" : paymentMethod === "TRANSFER" ? "Transfer" : "Belum Bayar"}</dd></div>
                            <div className="flex justify-between border-t border-[#123524]/10 pt-2"><dt className="font-bold text-[#8B6B3F]">Piutang Bertambah</dt><dd className="font-black text-[#8B6B3F]">{formatRupiah(receivableDelta)}</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Referensi</dt><dd className="font-black">{paymentReference.trim() || "-"}</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Catatan Pembayaran</dt><dd className="max-w-[60%] text-right font-black">{paymentNotes.trim() || "-"}</dd></div>
                            <div className="flex justify-between"><dt className="text-[#123524]/60">Catatan</dt><dd className="max-w-[60%] text-right font-black">{visitNotes.trim() || "-"}</dd></div>
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