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
import type { KasirShipmentSyncResponse } from "./kasir-shared";

type Props = {
    orderId: string;
    canCreate: boolean;
    canRefresh: boolean;
    hint?: string;
    compact?: boolean;
    /**
     * Shared SINGLE-FLIGHT lock. The open detail page also refreshes the shipment
     * automatically, so manual and automatic tracking reads share one lock and can never
     * overlap: whichever starts first wins, the other one is skipped (never queued).
     */
    syncLock?: { current: boolean };
    /**
     * Applies the sanitized shipment state of a SUCCESSFUL refresh. When provided, a manual
     * refresh updates the delivery card in place instead of re-reading the transaction.
     */
    onShipmentSynced?: (payload: KasirShipmentSyncResponse) => void;
    onUpdated?: () => void | Promise<void>;
};

export default function KasirShipmentActions({
    orderId,
    canCreate,
    canRefresh,
    hint,
    compact = false,
    syncLock,
    onShipmentSynced,
    onUpdated,
}: Props) {
    const [busy, setBusy] = useState<"" | "create" | "refresh">("");
    const [message, setMessage] = useState("");

    async function run(kind: "create" | "refresh") {
        // Double-click guard (this component) + shared lock (automatic refresh on the open
        // detail page). A tracking read is never queued: an overlapping attempt is skipped.
        if (busy) return;
        const lock = kind === "refresh" ? syncLock : undefined;
        if (lock?.current) return;
        if (lock) lock.current = true;
        setBusy(kind);
        setMessage("");
        try {
            const response = await fetch(`/api/admin/orders/${orderId}/biteship`, {
                method: kind === "create" ? "POST" : "GET",
                headers: { Accept: "application/json" },
            });
            const payload = (await response.json().catch(() => null)) as KasirShipmentSyncResponse | null;
            if (!response.ok) throw new Error(payload?.message || "Pengiriman gagal diproses.");
            setMessage(kind === "create" ? "Pengiriman dibuat." : "Status pengiriman diperbarui.");
            // A refresh only changes shipment state, so the sanitized sync response updates the
            // delivery card in place. Creating a shipment does change broader order state and
            // still re-reads the transaction.
            if (kind === "refresh" && onShipmentSynced && payload?.delivery) {
                onShipmentSynced(payload);
                return;
            }
            await onUpdated?.();
        } catch (error) {
            // A failed provider read keeps the LAST PERSISTED status on screen: nothing is cleared.
            setMessage(getUserFacingMessage(error, "Pengiriman gagal diproses."));
        } finally {
            if (lock) lock.current = false;
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
