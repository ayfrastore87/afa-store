// Shared server-side constants and serialization for the AFA STORE admin sales
// report (Laporan Penjualan). These helpers are pure/read-only and never mutate
// orders, payments, products, or stock.

import { wibDaysAgo, wibStartOfDay, wibStartOfMonth, wibStartOfYear } from "@/lib/wib";

export const REPORT_PERIODS = ["hari", "minggu", "bulan", "tahun", "semua", "bulan-pilihan"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export type ReportDateRange = { from: Date | null; to: Date | null };

/** Validates an HTML month value without relying on the server's local timezone. */
export function isReportMonth(value: string | null | undefined): value is `${number}-${number}` {
    return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

export function monthRange(value: string): ReportDateRange {
    if (!isReportMonth(value)) return { from: null, to: null };
    const [year, month] = value.split("-").map(Number);
    // Jakarta is UTC+07:00 and has no DST. End is exclusive.
    return {
        from: new Date(Date.UTC(year, month - 1, 1, -7, 0, 0)),
        to: new Date(Date.UTC(year, month, 1, -7, 0, 0)),
    };
}

export function periodRange(period: ReportPeriod, month?: string | null): ReportDateRange {
    if (month && isReportMonth(month)) return monthRange(month);
    const from = periodStart(period);
    return { from, to: null };
}

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
        case "bulan-pilihan":
            return null;
    }
}
