"use client";

// ---------------------------------------------------------------------------
// Shared cashier/admin shipment actions for a DELIVERY order.
//
// Both buttons call the EXISTING admin route `/api/admin/orders/[id]/biteship`:
//   POST -> creates the shipment (idempotent compare-and-set claim + server re-quote
//           already implemented there; the browser never sees the API key), and
//   GET  -> refreshes the provider tracking status of an EXISTING shipment only.
// The refresh path can NEVER create a second shipment (it never reaches
// POST /v1/orders), so pressing it repeatedly stays idempotent. No provider call, no
// polling and no tracking URL is ever invented here.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Loader2, PackageCheck, RefreshCw } from "lucide-react";

import { getUserFacingMessage } from "@/lib/user-facing-error";

type Props = {
    orderId: string;
    canCreate: boolean;
    canRefresh: boolean;
    hint?: string;
    compact?: boolean;
    onUpdated?: () => void | Promise<void>;
};

export default function KasirShipmentActions({
    orderId,
    canCreate,
    canRefresh,
    hint,
    compact = false,
    onUpdated,
}: Props) {
    const [busy, setBusy] = useState<"" | "create" | "refresh">("");
    const [message, setMessage] = useState("");

    async function run(kind: "create" | "refresh") {
        if (busy) return;
        setBusy(kind);
        setMessage("");
        try {
            const response = await fetch(`/api/admin/orders/${orderId}/biteship`, {
                method: kind === "create" ? "POST" : "GET",
                headers: { Accept: "application/json" },
            });
            const payload = (await response.json().catch(() => null)) as { message?: string } | null;
            if (!response.ok) throw new Error(payload?.message || "Pengiriman gagal diproses.");
            setMessage(kind === "create" ? "Pengiriman dibuat." : "Status pengiriman diperbarui.");
            await onUpdated?.();
        } catch (error) {
            setMessage(getUserFacingMessage(error, "Pengiriman gagal diproses."));
        } finally {
            setBusy("");
        }
    }

    const sizeClass = compact ? "min-h-9 px-3 text-[11px]" : "min-h-11 px-4 text-xs";

    return (
        <div className="flex flex-col items-start gap-1">
            <div className="flex flex-wrap items-center gap-2">
                {canCreate ? (
                    <button
                        type="button"
                        onClick={() => void run("create")}
                        disabled={busy !== ""}
                        className={`inline-flex items-center gap-1.5 rounded-xl bg-[#184D47] font-black text-white transition hover:brightness-110 active:scale-95 disabled:opacity-60 ${sizeClass}`}
                    >
                        {busy === "create" ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                        BUAT PENGIRIMAN
                    </button>
                ) : null}
                {canRefresh ? (
                    <button
                        type="button"
                        onClick={() => void run("refresh")}
                        disabled={busy !== ""}
                        aria-busy={busy === "refresh"}
                        className={`inline-flex items-center gap-1.5 rounded-xl border border-[#184D47]/25 bg-white font-black text-[#184D47] transition hover:bg-[#EAF1ED] active:scale-95 disabled:opacity-60 ${sizeClass}`}
                    >
                        {busy === "refresh" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        PERBARUI STATUS
                    </button>
                ) : null}
            </div>
            {message ? <p className="text-[11px] font-semibold leading-snug text-[#184D47]/70">{message}</p> : null}
            {!message && hint ? <p className="text-[11px] font-semibold leading-snug text-[#184D47]/50">{hint}</p> : null}
        </div>
    );
}
