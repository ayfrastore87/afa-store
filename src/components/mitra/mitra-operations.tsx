"use client";

import { useCallback, useState } from "react";

import { PartnerStockTab } from "@/components/partner/stock-tab";
import { PartnerPosTab } from "@/components/partner/pos-tab";
import { PartnerHistoryTab } from "@/components/partner/history-tab";
import { PartnerReportsTab } from "@/components/partner/reports-tab";
import { PartnerLocationTab } from "@/components/partner/location-tab";

// AFA MITRA — thin client wrappers around the existing /account/mitra tabs
// (Tahap 1, 18): reuse, don't copy-paste. These only supply the small amount of
// client state (refresh signals / callbacks) each shared tab expects.

export function MitraStok() {
    const [refreshSignal, setRefreshSignal] = useState(0);
    const refresh = useCallback(() => setRefreshSignal((n) => n + 1), []);
    return <PartnerStockTab refreshSignal={refreshSignal} onChanged={refresh} />;
}

export function MitraKasir() {
    const refresh = useCallback(() => {}, []);
    return <PartnerPosTab onSold={refresh} />;
}

export function MitraPenjualan() {
    const [refreshSignal] = useState(0);
    return <PartnerHistoryTab refreshSignal={refreshSignal} />;
}

export function MitraLaporan() {
    const [refreshSignal] = useState(0);
    return <PartnerReportsTab refreshSignal={refreshSignal} />;
}

export function MitraLokasi() {
    return <PartnerLocationTab />;
}