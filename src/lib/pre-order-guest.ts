import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Guest (no-login) Pre-Order protections.
//
// Layer 1 — in-memory sliding window per client IP (fast path; per server
//           instance, so it is a best-effort first filter on serverless).
// Layer 2 — DB-backed caps that hold across instances and restarts:
//           • max open DRAFT POs per phone number
//           • max website POs per phone number per 24h
// Layer 3 — honeypot field + minimum form fill time (bot heuristics).
// Layer 4 — idempotent replay: same client + same payload within a short
//           window returns the already-created PO instead of a duplicate.
// ---------------------------------------------------------------------------

export const GUEST_PO_IP_WINDOW_MS = 10 * 60 * 1000;
export const GUEST_PO_IP_MAX = 5;
export const GUEST_PO_MAX_OPEN_DRAFTS_PER_PHONE = 3;
export const GUEST_PO_MAX_PER_PHONE_PER_DAY = 5;
export const GUEST_PO_MIN_FILL_MS = 3_000;
export const GUEST_PO_REPLAY_WINDOW_MS = 2 * 60 * 1000;
export const GUEST_PO_MAX_ITEMS = 20;
export const GUEST_PO_MAX_QTY_PER_ITEM = 200;
export const GUEST_PO_MAX_PICKUP_DAYS_AHEAD = 90;

type Bucket = { hits: number[] };
const ipBuckets = new Map<string, Bucket>();
const replayCache = new Map<string, { poId: string; at: number }>();

function prune(now: number) {
    if (ipBuckets.size < 2_000 && replayCache.size < 2_000) return;
    for (const [key, bucket] of ipBuckets) {
        bucket.hits = bucket.hits.filter((t) => now - t < GUEST_PO_IP_WINDOW_MS);
        if (bucket.hits.length === 0) ipBuckets.delete(key);
    }
    for (const [key, entry] of replayCache) if (now - entry.at > GUEST_PO_REPLAY_WINDOW_MS) replayCache.delete(key);
}

export function getClientIp(request: Request) {
    const forwarded = request.headers.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Returns true when the IP is still within budget (and records the hit). */
export function checkIpRateLimit(ip: string, now = Date.now()) {
    prune(now);
    const bucket = ipBuckets.get(ip) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < GUEST_PO_IP_WINDOW_MS);
    if (bucket.hits.length >= GUEST_PO_IP_MAX) {
        ipBuckets.set(ip, bucket);
        return false;
    }
    bucket.hits.push(now);
    ipBuckets.set(ip, bucket);
    return true;
}

/** sha256 of ip + phone + canonical items so the same submission replays. */
export function guestReplayKey(ip: string, phone: string, items: unknown) {
    const canonical = JSON.stringify(items, (_key, value) => (value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : value));
    return createHash("sha256").update(`${ip}|${phone}|${canonical}`).digest("hex");
}

export function readReplay(key: string, now = Date.now()) {
    const entry = replayCache.get(key);
    if (!entry) return null;
    if (now - entry.at > GUEST_PO_REPLAY_WINDOW_MS) {
        replayCache.delete(key);
        return null;
    }
    return entry.poId;
}

export function writeReplay(key: string, poId: string, now = Date.now()) {
    replayCache.set(key, { poId, at: now });
}

export type GuestPhoneCapResult = { ok: true } | { ok: false; message: string };

/** DB-backed caps per phone. Phone must already be normalised (08xxxx). */
export async function checkPhoneCaps(phone: string): Promise<GuestPhoneCapResult> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [openDrafts, lastDay] = await Promise.all([
        prisma.preOrder.count({ where: { phone, source: "WEBSITE", status: "DRAFT", deletedAt: null } }),
        prisma.preOrder.count({ where: { phone, source: "WEBSITE", createdAt: { gte: since }, deletedAt: null } }),
    ]);
    if (openDrafts >= GUEST_PO_MAX_OPEN_DRAFTS_PER_PHONE) {
        return { ok: false, message: "Nomor ini masih memiliki pre-order yang menunggu konfirmasi. Hubungi kami via WhatsApp untuk melanjutkan." };
    }
    if (lastDay >= GUEST_PO_MAX_PER_PHONE_PER_DAY) {
        return { ok: false, message: "Batas pengajuan pre-order harian untuk nomor ini sudah tercapai. Coba lagi besok atau hubungi kami." };
    }
    return { ok: true };
}

/** Same normalisation as the PO service so the caps match what gets stored. */
export function normalizeGuestPhone(value: unknown) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) return null;
    return digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
}

/** Pickup date must be today..+90 days (date-only, local). */
export function isValidGuestPickupDate(value: unknown) {
    if (value == null || value === "") return true;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const max = new Date(today.getTime() + GUEST_PO_MAX_PICKUP_DAYS_AHEAD * 86_400_000);
    return date.getTime() >= today.getTime() && date.getTime() <= max.getTime();
}

/** Reset helpers for unit tests only. */
export function __resetGuestPreOrderState() {
    ipBuckets.clear();
    replayCache.clear();
}
