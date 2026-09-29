import "server-only";

import { createHash } from "node:crypto";

// AFA STORE — Checkout Idempotency helpers.
//
// A checkoutRequestHash is the canonical fingerprint of a checkout attempt,
// used together with the Idempotency-Key header to protect against duplicate
// order creation (retries, tab-switch double-submit, network flaps, …).
//
// The hash MUST include the buyer's identity so a replay from a DIFFERENT
// identity under the same Idempotency-Key is rejected with 409 rather than
// silently colliding. Two identity shapes are supported:
//
//   { kind: "user",  userId }              — authenticated buyer
//   { kind: "guest", guestSessionHash }    — anonymous buyer (guest checkout)
//
// The authenticated shape is byte-for-byte compatible with the pre-guest
// hash format (`{userId, payload, items}` canonicalized), so existing
// COMPLETED rows continue to replay their cached responsePayload correctly.
// This matters: baseline verification confirmed 14 authenticated rows
// already exist in Production and their requestHash values must remain
// valid after the identity-aware refactor.

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

export type CheckoutIdentity =
    | { kind: "user"; userId: string }
    | { kind: "guest"; guestSessionHash: string };

type CheckoutRequestHashArgs =
    | [identity: CheckoutIdentity, payload: unknown, items: Array<{ id: string; qty: number }>]
    | [userId: string, payload: unknown, items: Array<{ id: string; qty: number }>];

/**
 * checkoutRequestHash(identity, payload, items) — identity-aware.
 * checkoutRequestHash(userId,   payload, items) — legacy authenticated form.
 *
 * The legacy signature is preserved so:
 *   • existing call sites do not need to change simultaneously,
 *   • existing hashes in the CheckoutIdempotency table remain replay-valid.
 * Internally, a raw string userId is coerced into { kind: "user", userId }
 * and canonicalized identically to the pre-guest format.
 */
export function checkoutRequestHash(...args: CheckoutRequestHashArgs): string {
    const [identityOrUserId, payload, items] = args;

    // Legacy signature: preserve exact canonical shape so old hashes still match.
    if (typeof identityOrUserId === "string") {
        const canonical = canonicalize({ userId: identityOrUserId, payload, items: [...items].sort((a, b) => a.id.localeCompare(b.id)) });
        return createHash("sha256").update(canonical).digest("hex");
    }

    const identity = identityOrUserId;
    if (identity.kind === "user") {
        // Byte-identical to legacy hash. Authenticated behaviour unchanged.
        const canonical = canonicalize({ userId: identity.userId, payload, items: [...items].sort((a, b) => a.id.localeCompare(b.id)) });
        return createHash("sha256").update(canonical).digest("hex");
    }

    // Guest path: guestSessionHash replaces userId in the canonical envelope.
    // Two different guests can never collide because their session hashes
    // are distinct 256-bit sha256 digests.
    const canonical = canonicalize({
        guestSessionHash: identity.guestSessionHash,
        payload,
        items: [...items].sort((a, b) => a.id.localeCompare(b.id)),
    });
    return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Identity match for idempotency replay checks. Returns true only when
 * the stored row's identity fields align with the caller identity (user
 * rows require userId to match; guest rows require the hash to match).
 * This centralises the comparison so no route accidentally accepts a
 * cross-identity replay.
 */
export function identityMatchesRow(
    row: { userId: string | null; guestSessionHash: string | null },
    identity: CheckoutIdentity
): boolean {
    if (identity.kind === "user") {
        return row.userId !== null && row.userId === identity.userId && row.guestSessionHash === null;
    }
    return row.guestSessionHash !== null && row.guestSessionHash === identity.guestSessionHash && row.userId === null;
}