// ---------------------------------------------------------------------------
// Client-safe location display helpers. LIVE/OFFLINE status and accuracy
// quality are pure derived values — never persisted. `PartnerLocation` already
// stores a full history (indexed by partnerId + recordedAt), so the latest
// record suffices to compute freshness. No new model or migration.
//
// This module deliberately does NOT import "server-only" so it can be used in
// both the admin map (polling) and the partner location tab (watchPosition).
// ---------------------------------------------------------------------------

// A location is considered LIVE while its latest server-recorded timestamp is
// within this window (ms). Beyond it the partner is shown as "terakhir terlihat".
export const LOCATION_LIVE_WINDOW_MS = 60_000;

export type LocationLiveStatus = "LIVE" | "OFFLINE";

export function getLocationLiveStatus(recordedAt: string | Date, now: number = Date.now()): LocationLiveStatus {
    const time = recordedAt instanceof Date ? recordedAt.getTime() : new Date(recordedAt).getTime();
    if (Number.isNaN(time)) return "OFFLINE";
    return now - time <= LOCATION_LIVE_WINDOW_MS ? "LIVE" : "OFFLINE";
}

export type AccuracyQuality = "BAIK" | "CUKUP" | "RENDAH" | "TIDAK_DIKETAHUI";

export function getAccuracyQuality(accuracy: number | null | undefined): AccuracyQuality {
    if (accuracy == null || !Number.isFinite(accuracy)) return "TIDAK_DIKETAHUI";
    if (accuracy <= 20) return "BAIK";
    if (accuracy <= 50) return "CUKUP";
    return "RENDAH";
}

export const ACCURACY_QUALITY_LABELS: Record<AccuracyQuality, string> = {
    BAIK: "Baik",
    CUKUP: "Cukup",
    RENDAH: "Rendah",
    TIDAK_DIKETAHUI: "-",
};

// Human "… yang lalu" helper for the last-updated timestamp.
export function relativeTimeAgo(value: string | Date, now: number = Date.now()): string {
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) return "-";
    const diff = Math.max(0, now - time);
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds} detik lalu`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    const days = Math.floor(hours / 24);
    return `${days} hari lalu`;
}
