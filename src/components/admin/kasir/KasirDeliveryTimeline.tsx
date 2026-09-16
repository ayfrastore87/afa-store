"use client";

// ---------------------------------------------------------------------------
// Compact AFA STORE delivery timeline for /admin/kasir/[transaction-id].
//
// Purely presentational and READ-ONLY: every step arrives already derived server-side
// from the PERSISTED shipment state (`timeline` inside the kasir order payload), so the
// browser never computes progress, never talks to Biteship and never shows a provider
// identifier. A state that left the normal flow renders as an explicit interruption
// instead of pretending that delivery continued.
// ---------------------------------------------------------------------------

import { Check, Circle, TriangleAlert } from "lucide-react";

import type { KasirDeliveryTimeline, KasirDeliveryTimelineState } from "@/lib/kasir-delivery";

const NODE_STATE_CLASS: Record<KasirDeliveryTimelineState, string> = {
    completed: "border-[#184D47] bg-[#184D47] text-white",
    current: "border-[#C9A45B] bg-[#f8f0dd] text-[#184D47] ring-2 ring-[#C9A45B]/30",
    pending: "border-[#184D47]/20 bg-white text-[#184D47]/40",
};

const LABEL_STATE_CLASS: Record<KasirDeliveryTimelineState, string> = {
    completed: "font-black text-[#184D47]",
    current: "font-black text-[#184D47]",
    pending: "font-semibold text-[#184D47]/40",
};

export default function KasirDeliveryTimeline({ timeline }: { timeline: KasirDeliveryTimeline }) {
    const lastIndex = timeline.steps.length - 1;

    return (
        <div className="rounded-2xl border border-[#184D47]/10 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Timeline Pengiriman</p>
                <span className="text-[11px] font-black text-[#184D47]/60">{timeline.statusLabel}</span>
            </div>

            {/* Status yang keluar dari alur normal (gagal/dibatalkan/dikembalikan/ditahan
                atau belum dikenali) tampil sebagai keadaan tersendiri, bukan sebagai
                tahapan pengiriman yang terus berjalan. */}
            {timeline.interrupted && timeline.note ? (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#C9A45B]/30 bg-[#fff8df] p-2">
                    <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[#C9A45B]" aria-hidden />
                    <p className="text-[11px] font-semibold leading-snug text-[#184D47]/80">{timeline.note}</p>
                </div>
            ) : null}

            <ol className="mt-3 list-none">
                {timeline.steps.map((step, index) => (
                    <li key={step.stage} className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <span
                                aria-hidden
                                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${NODE_STATE_CLASS[step.state]}`}
                            >
                                {step.state === "completed" ? (
                                    <Check size={12} strokeWidth={3} />
                                ) : (
                                    <Circle size={8} fill="currentColor" strokeWidth={0} />
                                )}
                            </span>
                            {index === lastIndex ? null : (
                                <span
                                    aria-hidden
                                    className={`w-0.5 flex-1 ${step.state === "completed" ? "bg-[#184D47]/40" : "bg-[#184D47]/10"}`}
                                />
                            )}
                        </div>
                        <div className={index === lastIndex ? "pb-0" : "pb-3"}>
                            <p className={`text-xs leading-snug ${LABEL_STATE_CLASS[step.state]}`}>{step.label}</p>
                            {step.state === "current" ? (
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#C9A45B]">
                                    Tahap saat ini
                                </p>
                            ) : null}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
