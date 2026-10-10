"use client";

// ---------------------------------------------------------------------------
// Kasir Pre-Order panel: cari PO -> lihat ledger -> terima DP / cicilan /
// pelunasan (tunai / QRIS / transfer) -> konfirmasi -> serah terima -> struk.
//
// All money rules live server-side (src/lib/pre-order*.ts). The browser only
// sends { amount, method, cashReceived, idempotencyKey }; the server decides
// DP vs cicilan vs pelunasan, rejects overpayment and de-duplicates retries.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { ArrowLeft, Banknote, CheckCircle2, Loader2, PackageCheck, Search, XCircle } from "lucide-react";
import QrisPayment from "@/components/payment/QrisPayment";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import { preOrderKindLabel, preOrderLedgerStatusLabel, preOrderPaymentStatusLabel, preOrderStatusLabel } from "@/lib/pre-order-core";
import { formatDate, formatRupiah, paymentMethodLabel } from "./kasir-shared";
import { newIdempotencyKey, PRE_ORDER_PAYMENT_BADGE, PRE_ORDER_STATUS_BADGE, type PreOrderPaymentView, type PreOrderView } from "./pre-order-shared";
import PreOrderPrintButton from "./PreOrderReceipt";

type Filter = "all" | "unpaid" | "ready" | "today_pickup" | "handed_over" | "draft";
const FILTERS: { id: Filter; label: string }[] = [
    { id: "draft", label: "Menunggu Konfirmasi" },
    { id: "unpaid", label: "Belum Lunas" },
    { id: "today_pickup", label: "Ambil Hari Ini" },
    { id: "ready", label: "Siap Diambil" },
    { id: "handed_over", label: "Selesai" },
    { id: "all", label: "Semua" },
];

type Method = "TUNAI" | "QRIS" | "TRANSFER_BANK";

async function api<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
        data = {};
    }
    if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Permintaan gagal.");
    return data as T;
}

const toast = (icon: "success" | "error" | "warning" | "info", title: string, text?: string) =>
    Swal.fire({ icon, title, text, confirmButtonColor: "#184D47" });

export default function KasirPreOrderPanel({ cashierName, basePath = "/api/admin/kasir/pre-orders" }: { cashierName?: string | null; basePath?: string }) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("unpaid");
    const [list, setList] = useState<PreOrderView[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<PreOrderView | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ filter, limit: "50" });
            if (query.trim()) params.set("q", query.trim());
            const data = await api<{ preOrders: PreOrderView[] }>(`${basePath}?${params}`);
            setList(data.preOrders ?? []);
        } catch (e) {
            setError(getUserFacingMessage(e, "Daftar pre-order gagal dimuat."));
        } finally {
            setLoading(false);
        }
    }, [basePath, filter, query]);

    useEffect(() => {
        const timer = setTimeout(() => void load(), 250);
        return () => clearTimeout(timer);
    }, [load]);

    const refreshSelected = useCallback(
        async (id: string) => {
            const data = await api<{ preOrder: PreOrderView }>(`${basePath}/${id}`);
            setSelected(data.preOrder);
            setList((rows) => rows.map((row) => (row.id === id ? data.preOrder : row)));
            return data.preOrder;
        },
        [basePath],
    );

    if (selected) {
        return (
            <PreOrderDetail
                preOrder={selected}
                basePath={basePath}
                cashierName={cashierName}
                onBack={() => { setSelected(null); void load(); }}
                onChanged={(po) => { setSelected(po); setList((rows) => rows.map((row) => (row.id === po.id ? po : row))); }}
                refresh={() => refreshSelected(selected.id)}
            />
        );
    }

    return (
        <section className="space-y-4" data-testid="kasir-pre-order-panel">
            <div>
                <p className="text-xs font-black uppercase tracking-[.2em] text-[#C9A45B]">PRE-ORDER</p>
                <h1 className="text-2xl font-black">Cari Pre-Order</h1>
                <p className="text-xs text-[#123524]/60">Cari berdasarkan nomor PO, nama pelanggan, atau nomor WhatsApp.</p>
            </div>
            <label className="flex h-12 items-center gap-3 rounded-2xl border border-[#C9A45B]/20 bg-white/90 px-4 shadow-sm focus-within:border-[#C9A45B]">
                <Search size={18} className="shrink-0 text-[#C9A45B]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="PO-20261010-0001 / nama / 0812..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" aria-label="Cari pre-order" />
            </label>
            <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                    <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`min-h-10 rounded-xl px-3 text-xs font-bold ${filter === f.id ? "bg-[#184D47] text-[#F8F5EE]" : "border border-[#123524]/15 bg-white"}`}>{f.label}</button>
                ))}
            </div>
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {loading && list.length === 0 ? <p className="flex items-center gap-2 text-sm text-[#123524]/60"><Loader2 size={16} className="animate-spin" /> Memuat...</p> : null}
            {!loading && list.length === 0 && !error ? <p className="rounded-2xl border border-dashed border-[#123524]/15 p-6 text-center text-sm text-[#123524]/60">Tidak ada pre-order yang cocok.</p> : null}
            <ul className="grid gap-3 md:grid-cols-2">
                {list.map((po) => (
                    <li key={po.id}>
                        <button type="button" onClick={() => setSelected(po)} className="w-full rounded-2xl border border-[#123524]/10 bg-white p-4 text-left shadow-sm transition hover:border-[#C9A45B]/60 active:scale-[0.99]">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate font-mono text-xs font-black text-[#184D47]">{po.poNumber}</p>
                                    <p className="truncate text-base font-black">{po.customer}</p>
                                    <p className="truncate text-xs text-[#123524]/60">{po.phone}{po.pickupDate ? ` · ambil ${formatDate(po.pickupDate)}` : ""}</p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${PRE_ORDER_PAYMENT_BADGE[po.paymentStatus] ?? ""}`}>{preOrderPaymentStatusLabel(po.paymentStatus)}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRE_ORDER_STATUS_BADGE[po.status] ?? ""}`}>{preOrderStatusLabel(po.status)}</span>
                                    {po.source === "WEBSITE" ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">Website</span> : null}
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                <div><p className="text-[#123524]/50">Total</p><p className="font-black">{formatRupiah(po.total)}</p></div>
                                <div><p className="text-[#123524]/50">Dibayar</p><p className="font-black text-emerald-700">{formatRupiah(po.paid)}</p></div>
                                <div><p className="text-[#123524]/50">Sisa</p><p className="font-black text-red-700">{formatRupiah(po.remaining)}</p></div>
                            </div>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function PreOrderDetail({
    preOrder: po,
    basePath,
    cashierName,
    onBack,
    onChanged,
    refresh,
}: {
    preOrder: PreOrderView;
    basePath: string;
    cashierName?: string | null;
    onBack: () => void;
    onChanged: (po: PreOrderView) => void;
    refresh: () => Promise<PreOrderView>;
}) {
    const [method, setMethod] = useState<Method>("TUNAI");
    const [amount, setAmount] = useState<string>(String(po.remaining));
    const [cashReceived, setCashReceived] = useState<string>("");
    const [busy, setBusy] = useState(false);
    const [lastPayment, setLastPayment] = useState<PreOrderPaymentView | null>(null);
    // One idempotency key per form "attempt"; regenerated only after a successful submit,
    // so a retry after a network timeout replays the SAME payment instead of charging twice.
    const idemRef = useRef(newIdempotencyKey());

    const canPay = (po.status === "CONFIRMED" || po.status === "READY_FOR_PICKUP") && po.remaining > 0;
    const canHandover = (po.status === "CONFIRMED" || po.status === "READY_FOR_PICKUP") && po.paymentStatus === "PAID";
    const pendingRows = useMemo(() => po.payments.filter((row) => row.status === "PENDING"), [po.payments]);
    const amountNumber = Number(amount.replace(/\D/g, "")) || 0;
    const cashNumber = Number(cashReceived.replace(/\D/g, "")) || 0;
    const change = method === "TUNAI" && cashNumber >= amountNumber ? cashNumber - amountNumber : 0;
    const willSettle = amountNumber > 0 && amountNumber >= po.remaining;

    useEffect(() => {
        setAmount(String(po.remaining));
    }, [po.remaining, po.id]);

    // Poll while a QRIS Midtrans / transfer row is pending so the webhook result shows up.
    useEffect(() => {
        if (pendingRows.length === 0) return;
        const timer = setInterval(() => void refresh().catch(() => undefined), 5000);
        return () => clearInterval(timer);
    }, [pendingRows.length, refresh]);

    const submitPayment = async () => {
        if (busy) return;
        if (amountNumber <= 0) return void toast("warning", "Nominal belum diisi");
        if (amountNumber > po.remaining) return void toast("warning", "Melebihi sisa tagihan", `Sisa tagihan ${formatRupiah(po.remaining)}.`);
        if (method === "TUNAI" && cashReceived && cashNumber < amountNumber) return void toast("warning", "Uang diterima kurang");
        const kindLabel = willSettle ? "Pelunasan" : po.paid <= 0 ? "DP" : "Cicilan";
        const ok = await Swal.fire({
            title: `Terima ${kindLabel} ${formatRupiah(amountNumber)}?`,
            html: `<div style="text-align:left;font-size:14px"><b>${po.poNumber}</b> · ${po.customer}<br/>Metode: ${paymentMethodLabel(method)}<br/>Sisa setelah ini: <b>${formatRupiah(Math.max(po.remaining - amountNumber, 0))}</b></div>`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Ya, catat",
            cancelButtonText: "Batal",
            confirmButtonColor: "#184D47",
        });
        if (!ok.isConfirmed) return;
        setBusy(true);
        try {
            const data = await api<{ preOrder: PreOrderView; payment: PreOrderPaymentView; replayed: boolean }>(`${basePath}/${po.id}/payments`, {
                method: "POST",
                body: JSON.stringify({ amount: amountNumber, method, cashReceived: method === "TUNAI" && cashReceived ? cashNumber : undefined, idempotencyKey: idemRef.current }),
            });
            idemRef.current = newIdempotencyKey();
            onChanged(data.preOrder);
            setLastPayment(data.payment);
            setCashReceived("");
            if (data.payment.status === "VERIFIED") {
                await toast("success", data.replayed ? "Pembayaran sudah tercatat" : `${preOrderKindLabel(data.payment.kind)} tercatat`, data.preOrder.paymentStatus === "PAID" ? "Pre-order LUNAS. Silakan cetak struk & serah terima." : `Sisa tagihan ${formatRupiah(data.preOrder.remaining)}.`);
            } else {
                await toast("info", "Menunggu pembayaran", method === "QRIS" ? "Tunjukkan QRIS ke pelanggan, lalu konfirmasi setelah dana masuk." : "Konfirmasi setelah transfer diterima.");
            }
        } catch (e) {
            await toast("error", "Gagal mencatat pembayaran", getUserFacingMessage(e, "Coba lagi."));
        } finally {
            setBusy(false);
        }
    };

    const confirmPending = async (row: PreOrderPaymentView) => {
        const ok = await Swal.fire({ title: "Konfirmasi dana sudah masuk?", text: `${paymentMethodLabel(row.method)} ${formatRupiah(row.amount)} untuk ${po.poNumber}. Pastikan dana benar-benar diterima.`, icon: "warning", showCancelButton: true, confirmButtonText: "Ya, sudah masuk", cancelButtonText: "Belum", confirmButtonColor: "#184D47" });
        if (!ok.isConfirmed) return;
        setBusy(true);
        try {
            const data = await api<{ preOrder: PreOrderView; payment: PreOrderPaymentView }>(`${basePath}/${po.id}/payments/${row.id}/confirm`, { method: "POST" });
            onChanged(data.preOrder);
            setLastPayment(data.payment);
            await toast("success", "Pembayaran terverifikasi", data.preOrder.paymentStatus === "PAID" ? "Pre-order LUNAS." : `Sisa tagihan ${formatRupiah(data.preOrder.remaining)}.`);
        } catch (e) {
            await toast("error", "Gagal verifikasi", getUserFacingMessage(e, "Coba lagi."));
        } finally {
            setBusy(false);
        }
    };

    const cancelPending = async (row: PreOrderPaymentView) => {
        const ok = await Swal.fire({ title: "Batalkan pembayaran menunggu ini?", text: `${paymentMethodLabel(row.method)} ${formatRupiah(row.amount)}`, icon: "warning", showCancelButton: true, confirmButtonText: "Batalkan", cancelButtonText: "Kembali", confirmButtonColor: "#b91c1c" });
        if (!ok.isConfirmed) return;
        setBusy(true);
        try {
            const data = await api<{ preOrder: PreOrderView }>(`${basePath}/${po.id}/payments/${row.id}/confirm`, { method: "DELETE", body: JSON.stringify({ reason: "Dibatalkan kasir" }) });
            onChanged(data.preOrder);
        } catch (e) {
            await toast("error", "Gagal membatalkan", getUserFacingMessage(e, "Coba lagi."));
        } finally {
            setBusy(false);
        }
    };

    const changeStatus = async (status: "CONFIRMED" | "CANCELLED", title: string, text: string, confirmText: string, color: string) => {
        const ok = await Swal.fire({ title, text, icon: status === "CANCELLED" ? "warning" : "question", showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: "Batal", confirmButtonColor: color });
        if (!ok.isConfirmed) return;
        setBusy(true);
        try {
            const data = await api<{ preOrder: PreOrderView }>(`${basePath}/${po.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            onChanged(data.preOrder);
            await toast("success", status === "CONFIRMED" ? "Pre-order dikonfirmasi" : "Pre-order dibatalkan", status === "CONFIRMED" ? "Pelanggan kini dapat membayar DP / pelunasan." : undefined);
        } catch (e) {
            await toast("error", "Perubahan status ditolak", getUserFacingMessage(e, "Coba lagi."));
        } finally {
            setBusy(false);
        }
    };

    const handover = async () => {
        const ok = await Swal.fire({ title: "Serahkan barang ke pelanggan?", text: `${po.poNumber} · ${po.customer} — status LUNAS.`, icon: "question", showCancelButton: true, confirmButtonText: "Ya, serahkan", cancelButtonText: "Batal", confirmButtonColor: "#184D47" });
        if (!ok.isConfirmed) return;
        setBusy(true);
        try {
            const data = await api<{ preOrder: PreOrderView; alreadyHandedOver: boolean }>(`${basePath}/${po.id}/handover`, { method: "POST" });
            onChanged(data.preOrder);
            await toast("success", data.alreadyHandedOver ? "Sudah diserahkan sebelumnya" : "Serah terima selesai");
        } catch (e) {
            await toast("error", "Serah terima ditolak", getUserFacingMessage(e, "Coba lagi."));
        } finally {
            setBusy(false);
        }
    };

    const latestVerified = [...po.payments].reverse().find((row) => row.status === "VERIFIED") ?? null;
    const receiptPayment = lastPayment && lastPayment.status === "VERIFIED" ? po.payments.find((row) => row.id === lastPayment.id) ?? lastPayment : latestVerified;

    return (
        <section className="space-y-4" data-testid="kasir-pre-order-detail">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#123524]/15 bg-white px-3 text-sm font-bold"><ArrowLeft size={16} /> Kembali</button>
                <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${PRE_ORDER_PAYMENT_BADGE[po.paymentStatus] ?? ""}`}>{preOrderPaymentStatusLabel(po.paymentStatus)}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${PRE_ORDER_STATUS_BADGE[po.status] ?? ""}`}>{preOrderStatusLabel(po.status)}</span>
                </div>
            </div>

            <article className="rounded-2xl border border-[#123524]/10 bg-white p-4 shadow-sm">
                <p className="font-mono text-xs font-black text-[#184D47]">{po.poNumber}</p>
                <h2 className="text-xl font-black">{po.customer}</h2>
                <p className="text-xs text-[#123524]/60">WA {po.phone}{po.pickupDate ? ` · ambil ${formatDate(po.pickupDate)}` : ""} · dibuat {formatDate(po.createdAt)}</p>
                {po.note ? <p className="mt-2 rounded-xl bg-[#F8F5EE] px-3 py-2 text-xs">Catatan: {po.note}</p> : null}
                <ul className="mt-3 divide-y divide-[#123524]/10 text-sm">
                    {po.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 py-2">
                            <div className="min-w-0"><p className="font-semibold">{item.name}</p>{item.notes ? <p className="text-xs text-[#123524]/60">{item.notes}</p> : null}<p className="text-xs text-[#123524]/60">{item.quantity} x {formatRupiah(item.price)}</p></div>
                            <span className="shrink-0 font-black">{formatRupiah(item.subtotal)}</span>
                        </li>
                    ))}
                </ul>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div className="rounded-xl bg-[#F8F5EE] p-3"><p className="text-xs text-[#123524]/50">Total PO</p><p className="font-black">{formatRupiah(po.total)}</p>{po.discount > 0 ? <p className="text-[10px] text-[#123524]/50">diskon {formatRupiah(po.discount)}</p> : null}</div>
                    <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-800/70">Sudah Dibayar</p><p className="font-black text-emerald-800">{formatRupiah(po.paid)}</p></div>
                    <div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-red-800/70">Sisa Tagihan</p><p className="font-black text-red-800">{formatRupiah(po.remaining)}</p></div>
                    <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-800/70">Menunggu</p><p className="font-black text-amber-800">{formatRupiah(po.pending)}</p></div>
                </div>
            </article>

            {po.status === "DRAFT" ? (
                <article className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm" data-testid="pre-order-confirm-box">
                    <h3 className="font-black text-amber-900">Pengajuan dari {po.source === "WEBSITE" ? "website (tanpa login)" : "admin"} — menunggu konfirmasi</h3>
                    <p className="mt-1 text-xs text-amber-900/80">Hubungi pelanggan via WA {po.phone} untuk memastikan item & jadwal, lalu konfirmasi agar DP / pelunasan dapat diterima.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => changeStatus("CONFIRMED", "Konfirmasi pre-order?", `${po.poNumber} · ${po.customer} akan berstatus Dikonfirmasi.`, "Ya, konfirmasi", "#184D47")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#184D47] px-4 text-sm font-black text-white disabled:opacity-50" data-testid="pre-order-confirm">Konfirmasi Pre-Order</button>
                        <button type="button" disabled={busy} onClick={() => changeStatus("CANCELLED", "Batalkan pengajuan?", `${po.poNumber} · ${po.customer} akan dibatalkan.`, "Ya, batalkan", "#b91c1c")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300 bg-white px-4 text-sm font-bold text-red-700 disabled:opacity-50">Tolak / Batalkan</button>
                    </div>
                </article>
            ) : null}

            {canPay ? (
                <article className="rounded-2xl border border-[#C9A45B]/40 bg-white p-4 shadow-sm" data-testid="pre-order-payment-form">
                    <h3 className="flex items-center gap-2 font-black"><Banknote size={18} className="text-[#C9A45B]" /> {po.paid > 0 ? "Terima Cicilan / Pelunasan" : "Terima DP / Pelunasan"}</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-bold">Nominal
                            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} className="mt-1 h-11 w-full rounded-xl border border-[#123524]/15 px-3 text-base font-black" />
                            <span className="mt-1 block text-[11px] font-normal text-[#123524]/60">{willSettle ? "Nominal ini akan MELUNASI pre-order." : `Maks. ${formatRupiah(po.remaining)}`}</span>
                        </label>
                        <div className="text-xs font-bold">Metode
                            <div className="mt-1 grid grid-cols-3 gap-2">
                                {(["TUNAI", "QRIS", "TRANSFER_BANK"] as Method[]).map((m) => (
                                    <button key={m} type="button" onClick={() => setMethod(m)} className={`h-11 rounded-xl text-xs font-black ${method === m ? "bg-[#184D47] text-white" : "border border-[#123524]/15"}`}>{paymentMethodLabel(m)}</button>
                                ))}
                            </div>
                        </div>
                        {method === "TUNAI" ? (
                            <label className="block text-xs font-bold">Uang Diterima (opsional)
                                <input inputMode="numeric" value={cashReceived} onChange={(e) => setCashReceived(e.target.value.replace(/\D/g, ""))} placeholder={String(amountNumber)} className="mt-1 h-11 w-full rounded-xl border border-[#123524]/15 px-3 text-base font-black" />
                                {cashReceived ? <span className="mt-1 block text-[11px] font-normal text-[#123524]/60">Kembalian: {formatRupiah(change)}</span> : null}
                            </label>
                        ) : null}
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <button type="button" onClick={() => setAmount(String(Math.ceil(po.remaining / 2)))} className="h-9 rounded-lg border border-[#123524]/15 px-3 text-xs font-bold">50% sisa</button>
                            <button type="button" onClick={() => setAmount(String(po.remaining))} className="h-9 rounded-lg border border-[#123524]/15 px-3 text-xs font-bold">Lunasi sisa</button>
                        </div>
                    </div>
                    <button type="button" onClick={() => void submitPayment()} disabled={busy || amountNumber <= 0} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#184D47] font-black text-white disabled:opacity-60">
                        {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} {willSettle ? "Catat Pelunasan" : po.paid > 0 ? "Catat Cicilan" : "Catat DP"}
                    </button>
                </article>
            ) : null}

            {pendingRows.map((row) => (
                <article key={row.id} className="rounded-2xl border border-amber-300 bg-amber-50 p-4" data-testid="pre-order-pending-payment">
                    <p className="font-black text-amber-900">Menunggu: {paymentMethodLabel(row.method)} {formatRupiah(row.amount)} · {preOrderKindLabel(row.kind)}</p>
                    {row.method === "QRIS" ? (
                        <div className="mt-3">
                            <QrisPayment total={row.amount} imageSrc={row.qrisUrl} expiryLabel={row.expiredAt ? `Berlaku s/d ${formatDate(row.expiredAt)}` : null} showDownload={!row.qrisUrl} />
                            {row.transactionRef ? <p className="mt-2 text-xs text-amber-900/70">QRIS Midtrans — status diperbarui otomatis setelah pelanggan membayar.</p> : null}
                        </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                        {!row.transactionRef ? (
                            <button type="button" onClick={() => void confirmPending(row)} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#184D47] px-4 text-sm font-black text-white disabled:opacity-60"><CheckCircle2 size={16} /> Dana Sudah Masuk</button>
                        ) : null}
                        <button type="button" onClick={() => void cancelPending(row)} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300 px-4 text-sm font-bold text-red-700 disabled:opacity-60"><XCircle size={16} /> Batalkan</button>
                    </div>
                </article>
            ))}

            <article className="rounded-2xl border border-[#123524]/10 bg-white p-4 shadow-sm">
                <h3 className="font-black">Riwayat Pembayaran</h3>
                {po.payments.length === 0 ? <p className="mt-2 text-sm text-[#123524]/60">Belum ada pembayaran.</p> : null}
                <ul className="mt-2 divide-y divide-[#123524]/10 text-sm">
                    {po.payments.map((row) => (
                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div className="min-w-0">
                                <p className="font-semibold">#{row.sequence} {preOrderKindLabel(row.kind)} · {paymentMethodLabel(row.method)}</p>
                                <p className="text-xs text-[#123524]/60">{formatDate(row.verifiedAt ?? row.createdAt)} · {preOrderLedgerStatusLabel(row.status)}{row.method === "TUNAI" && row.change ? ` · kembalian ${formatRupiah(row.change)}` : ""}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`font-black ${row.status === "VERIFIED" ? "text-emerald-700" : row.status === "PENDING" ? "text-amber-700" : "text-[#123524]/40 line-through"}`}>{formatRupiah(row.amount)}</span>
                                {row.status === "VERIFIED" ? <PreOrderPrintButton preOrder={po} payment={row} cashierName={cashierName} compact /> : null}
                            </div>
                        </li>
                    ))}
                </ul>
            </article>

            <div className="flex flex-wrap items-center justify-end gap-3">
                {receiptPayment ? <PreOrderPrintButton preOrder={po} payment={receiptPayment} cashierName={cashierName} /> : null}
                {canHandover ? (
                    <button type="button" onClick={() => void handover()} disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#D4AF37] px-5 font-black text-[#184D47] disabled:opacity-60" data-testid="pre-order-handover">
                        <PackageCheck size={18} /> Serah Terima
                    </button>
                ) : po.status === "HANDED_OVER" ? (
                    <p className="text-sm font-bold text-emerald-700">Sudah diserahkan {po.handedOverAt ? formatDate(po.handedOverAt) : ""}</p>
                ) : po.paymentStatus !== "PAID" && po.status !== "CANCELLED" ? (
                    <p className="text-xs text-[#123524]/60">Serah terima tersedia setelah LUNAS.</p>
                ) : null}
            </div>
        </section>
    );
}
