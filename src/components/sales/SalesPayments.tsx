"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";

import { formatDate, formatRupiah, paymentMethodLabel } from "./sales-shared";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type Payment = {
    id: string;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    reference: string | null;
    status: string;
    storeId: string;
    storeName: string;
};

type StoreOption = { id: string; name: string; receivable: number };

export function SalesPayments() {
    const [payments, setPayments] = useState<Payment[] | null>(null);
    const [stores, setStores] = useState<StoreOption[]>([]);
    const [error, setError] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [storeId, setStoreId] = useState("");
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState<"CASH" | "TRANSFER" | "OTHER">("CASH");
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const load = useCallback(() => {
        fetch("/api/sales/payments", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.message || "Riwayat setoran gagal dimuat.");
                setPayments((payload as { payments: Payment[] }).payments);
            })
            .catch((err) => setError(getUserFacingMessage(err, "Riwayat setoran gagal dimuat.")));
    }, []);

    useEffect(() => {
        load();
        fetch("/api/sales/stores", { headers: { Accept: "application/json" }, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (response.ok) setStores((payload as { stores: StoreOption[] }).stores);
            })
            .catch(() => undefined);
    }, [load]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setFormError("");
        try {
            const response = await fetch("/api/sales/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storeId, amount: Math.floor(Number(amount) || 0), method }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || "Setoran gagal disimpan.");
            setFormOpen(false);
            setAmount("");
            setStoreId("");
            load();
        } catch (err) {
            setFormError(getUserFacingMessage(err, "Setoran gagal disimpan."));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-black">Setoran</h1>
                <button
                    type="button"
                    onClick={() => setFormOpen((open) => !open)}
                    className="min-h-11 rounded-xl bg-[#184D47] px-4 text-sm font-black text-[#F8F5EE]"
                >
                    {formOpen ? "Tutup" : "+ Catat Setoran"}
                </button>
            </div>

            {formOpen && (
                <form onSubmit={submit} className="sales-card space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                    <label className="block text-sm font-bold">Toko
                        <select required value={storeId} onChange={(e) => setStoreId(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#123524]/15 bg-white px-3 font-semibold">
                            <option value="">Pilih toko...</option>
                            {stores.map((store) => (
                                <option key={store.id} value={store.id}>{store.name} — piutang {formatRupiah(store.receivable)}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm font-bold">Nominal (Rp)
                        <input required inputMode="numeric" pattern="[0-9]*" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl border border-[#123524]/15 bg-white px-4 font-black" placeholder="0" />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {([["CASH", "Tunai"], ["TRANSFER", "Transfer"], ["OTHER", "Lainnya"]] as const).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setMethod(value)} className={`min-h-11 rounded-xl border text-sm font-black ${method === value ? "border-[#184D47] bg-[#184D47] text-[#F8F5EE]" : "border-[#123524]/15 bg-white text-[#123524]/70"}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}
                    <button disabled={submitting} className="min-h-12 w-full rounded-xl bg-[#184D47] font-black text-[#F8F5EE] disabled:opacity-60">
                        {submitting ? "Menyimpan..." : "SIMPAN SETORAN"}
                    </button>
                </form>
            )}

            {error && <p className="sales-card rounded-2xl bg-white p-4 text-sm font-semibold text-red-700">{error}</p>}
            {!payments && !error && <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin text-[#184D47]" /></div>}

            {payments?.length === 0 && (
                <div className="sales-card grid place-items-center gap-2 rounded-2xl bg-white p-8 text-center">
                    <Wallet className="text-[#D4AF37]" />
                    <p className="text-sm font-semibold text-[#123524]/55">Belum ada setoran tercatat.</p>
                </div>
            )}

            <ul className="space-y-3">
                {payments?.map((payment) => (
                    <li key={payment.id} className="sales-card rounded-2xl bg-white p-4 shadow-sm shadow-[#123524]/5">
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-black">{payment.storeName}</p>
                            <p className="font-black text-[#184D47]">{formatRupiah(payment.amount)}</p>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-[#123524]/50">
                            {formatDate(payment.paymentDate)} · {paymentMethodLabel(payment.paymentMethod)}
                            {payment.status !== "VALID" ? ` · ${payment.status}` : ""}
                        </p>
                    </li>
                ))}
            </ul>
        </div>
    );
}