import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

// AFA STORE — Guest Checkout Session helper
//
// This module owns the ONLY server-side representation of an anonymous
// buyer's identity. It is used exclusively by the guest-checkout code
// paths gated behind GUEST_CHECKOUT_ENABLED.
//
// Security properties (mandatory):
//   • Raw guest token          → HttpOnly cookie only. Never in DB, never in logs,
//                                 never sent to n8n, never sent to Midtrans.
//   • Guest identity in DB     → sha256(raw token).hex (64 lowercase hex chars),
//                                 stored as CheckoutIdempotency.guestSessionHash.
//   • Cookie flags             → HttpOnly, SameSite=Lax, Secure in production,
//                                 Path=/, MaxAge=7d.
//   • Token entropy            → 32 raw bytes (256 bits) base64url encoded,
//                                 generated with crypto.randomBytes.
//   • The raw token is NEVER returned to callers or client JS. Only the
//     sha256 hash is returned server-side, so downstream code physically
//     cannot leak the raw value.

/** HttpOnly cookie name — server-only. Client JS cannot read this cookie. */
export const GUEST_SESSION_COOKIE = "afa_guest_sid";

/** 7 days in seconds — matches the Buy-Now → Cart → Checkout journey window
 *  without persisting anonymous identity beyond the buyer's active shopping. */
export const GUEST_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** 32 raw bytes = 256 bits of entropy, base64url-encoded (43 chars, no padding). */
const GUEST_TOKEN_BYTES = 32;

function hashGuestToken(rawToken: string): string {
    // SHA-256 hex digest is 64 lowercase hex chars.
    // Matches CheckoutIdempotency_guestSessionHash_shape_chk exactly.
    return createHash("sha256").update(rawToken).digest("hex");
}

function generateRawGuestToken(): string {
    // base64url → URL-safe, no padding, cookie-safe, JS-runtime independent.
    return randomBytes(GUEST_TOKEN_BYTES).toString("base64url");
}

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        // Never require Secure in dev — browsers reject Secure over http://localhost.
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: GUEST_SESSION_MAX_AGE,
    };
}

/** Reads the guest session hash from the existing cookie WITHOUT issuing one.
 *  Returns null when no guest cookie is present or the cookie is malformed. */
export async function readGuestSessionHash(): Promise<string | null> {
    const store = await cookies();
    const raw = store.get(GUEST_SESSION_COOKIE)?.value;
    if (!raw || typeof raw !== "string") return null;
    // Defensive shape guard: base64url characters only, 1..128 chars.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(raw)) return null;
    return hashGuestToken(raw);
}

/** Ensures a guest session cookie exists on the response.
 *  If the request already carries a valid cookie, its hash is returned and
 *  the cookie is NOT re-issued. Otherwise a new 256-bit token is generated,
 *  set on the response via HttpOnly cookie, and its hash returned. */
export async function ensureGuestSession(response: NextResponse): Promise<{ hash: string; issued: boolean }> {
    const existingHash = await readGuestSessionHash();
    if (existingHash) return { hash: existingHash, issued: false };

    const raw = generateRawGuestToken();
    response.cookies.set(GUEST_SESSION_COOKIE, raw, cookieOptions());
    // Return only the hash. The raw token stays inside this function scope
    // and inside the cookie header — never exposed to any caller.
    return { hash: hashGuestToken(raw), issued: true };
}

/** Test-only helper: derive the hash from a known raw token deterministically.
 *  Exported so unit tests can assert the sha256 mapping without reaching into
 *  crypto.subtle. This function does NOT read or write cookies. */
export function guestSessionHashOf(rawToken: string): string {
    return hashGuestToken(rawToken);
}
