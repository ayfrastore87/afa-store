import "server-only";

import { createHash } from "node:crypto";

function canonicalize(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

export function normalizeIdempotencyKey(value: string | null) {
    const key = value?.trim() ?? "";
    if (!key || key.length > 255) return null;
    return key;
}

export function checkoutRequestHash(userId: string, payload: unknown, items: Array<{ id: string; qty: number }>) {
    const canonical = canonicalize({ userId, payload, items: [...items].sort((a, b) => a.id.localeCompare(b.id)) });
    return createHash("sha256").update(canonical).digest("hex");
}