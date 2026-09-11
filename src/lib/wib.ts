// Shared Asia/Jakarta (WIB) calendar helpers. WIB is UTC+7 year-round (no DST),
// so a WIB midnight on a calendar day is a fixed instant; deriving it from the
// wall clock avoids the "date shifts a day because of UTC" bug (F-7). Used by
// the partner dashboard summary and the partner sales report.

export const WIB_TIME_ZONE = "Asia/Jakarta";

type WibZonedParts = { year: number; month: number; day: number; offsetMs: number };

function wibZonedParts(now: Date): WibZonedParts {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: WIB_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(now);

    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
    const hour = value("hour") === "24" ? 0 : Number(value("hour"));

    const year = Number(value("year"));
    const month = Number(value("month")) - 1;
    const day = Number(value("day"));
    const minute = Number(value("minute"));
    const second = Number(value("second"));

    // wall-clock interpreted as UTC minus the real UTC instant = the zone offset.
    const wallClockAsUtc = Date.UTC(year, month, day, hour, minute, second);
    const offsetMs = Math.round((wallClockAsUtc - now.getTime()) / 900000) * 900000;

    return { year, month, day, offsetMs };
}

export function wibStartOfDay(now: Date = new Date()): Date {
    const { year, month, day, offsetMs } = wibZonedParts(now);
    return new Date(Date.UTC(year, month, day, 0, 0, 0) - offsetMs);
}

export function wibStartOfMonth(now: Date = new Date()): Date {
    const { year, month, offsetMs } = wibZonedParts(now);
    return new Date(Date.UTC(year, month, 1, 0, 0, 0) - offsetMs);
}

export function wibStartOfYear(now: Date = new Date()): Date {
    const { year, offsetMs } = wibZonedParts(now);
    return new Date(Date.UTC(year, 0, 1, 0, 0, 0) - offsetMs);
}

export function wibDaysAgo(days: number, now: Date = new Date()): Date {
    return new Date(wibStartOfDay(now).getTime() - days * 86_400_000);
}
