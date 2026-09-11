"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    BarChart3,
    Boxes,
    FileText,
    History,
    LayoutDashboard,
    MapPin,
    ShoppingCart,
    Tags,
} from "lucide-react";

import { PartnerHistoryTab } from "@/components/partner/history-tab";
import { PartnerLocationTab } from "@/components/partner/location-tab";
import { PartnerPosTab } from "@/components/partner/pos-tab";
import { PartnerPricesTab } from "@/components/partner/prices-tab";
import { PartnerReportsTab } from "@/components/partner/reports-tab";
import { PartnerStockTab } from "@/components/partner/stock-tab";
import { PartnerSummaryTab } from "@/components/partner/summary-tab";

export type PartnerIdentity = {
    partnerCode: string;
    displayName: string;
    businessName: string | null;
    partnerType: string;
};

const TABS = [
    { id: "ringkasan", label: "Ringkasan", icon: LayoutDashboard },
    { id: "stok", label: "Stok", icon: Boxes },
    { id: "kasir", label: "Kasir", icon: ShoppingCart },
    { id: "harga", label: "Harga", icon: Tags },
    { id: "laporan", label: "Laporan", icon: FileText },
    { id: "lokasi", label: "Lokasi", icon: MapPin },
    { id: "riwayat", label: "Riwayat", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function PartnerDashboard({ partner }: { partner: PartnerIdentity }) {
    const [tab, setTab] = useState<TabId>("ringkasan");
    const [refreshSignal, setRefreshSignal] = useState(0);

    const refresh = useCallback(() => setRefreshSignal((n) => n + 1), []);

    const title = partner.businessName || partner.displayName;

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff8df_0,#f7efd9_34%,#edf4ef_68%,#e4dcc7_100%)] pb-24 text-[#184D47]">
            <header className="sticky top-0 z-30 border-b border-[#C9A45B]/20 bg-[#F8F5EE]/90 shadow-[0_8px_28px_rgba(18,53,36,0.06)] backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#184D47] text-[#D4AF37]">
                            <BarChart3 size={22} />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-black uppercase tracking-[0.28em] text-[#C9A45B]">AFA STORE MITRA</p>
                            <h1 className="truncate text-xl font-black leading-tight sm:text-2xl">{title}</h1>
                            <p className="truncate text-xs text-[#184D47]/60">Kode Mitra: {partner.partnerCode}</p>
                        </div>
                    </div>

                    <Link
                        href="/account/mitra"
                        className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#184D47]/15 bg-white/80 px-4 font-bold text-[#184D47] transition hover:bg-white active:scale-95"
                    >
                        <ArrowLeft size={18} />
                        <span className="hidden sm:inline">Kembali</span>
                    </Link>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
                <nav className="grid grid-cols-4 gap-2 rounded-2xl border border-white/60 bg-white/70 p-2 shadow-sm backdrop-blur sm:grid-cols-7">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTab(id)}
                            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-bold transition sm:flex-row sm:gap-2 ${
                                tab === id
                                    ? "bg-[#184D47] text-white shadow"
                                    : "text-[#184D47]/60 hover:bg-[#184D47]/5"
                            }`}
                        >
                            <Icon size={18} />
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>

                <main className="mt-6">
                    {tab === "ringkasan" && <PartnerSummaryTab refreshSignal={refreshSignal} onGoToSales={() => setTab("kasir")} />}
                    {tab === "stok" && <PartnerStockTab refreshSignal={refreshSignal} onChanged={refresh} />}
                    {tab === "kasir" && <PartnerPosTab onSold={refresh} />}
                    {tab === "harga" && <PartnerPricesTab />}
                    {tab === "laporan" && <PartnerReportsTab refreshSignal={refreshSignal} />}
                    {tab === "lokasi" && <PartnerLocationTab />}
                    {tab === "riwayat" && <PartnerHistoryTab refreshSignal={refreshSignal} />}
                </main>
            </div>
        </div>
    );
}
