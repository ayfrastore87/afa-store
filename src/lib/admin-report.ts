// Shared server-side constants and serialization for the AFA STORE admin sales
// report (Laporan Penjualan). These helpers are pure/read-only and never mutate
// orders, payments, products, or stock.

import { wibDaysAgo, wibStartOfDay, wibStartOfMonth, wibStartOfYear } from "@/lib/wib";

export const REPORT_PERIODS = ["hari", "minggu", "bulan", "tahun", "semua"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

// A period's lower bound in WIB. "semua" has no lower bound (all time).
export function periodStart(period: ReportPeriod): Date | null {
    const now = new Date();
    switch (period) {
        case "hari":
            return wibStartOfDay(now);
        case "minggu":
            return wibDaysAgo(6, now);
        case "bulan":
            return wibStartOfMonth(now);
        case "tahun":
            return wibStartOfYear(now);
        case "semua":
            return null;
    }
}
