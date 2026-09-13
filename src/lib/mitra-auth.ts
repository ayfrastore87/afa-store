import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash as bcryptHash, compare as bcryptCompare } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { MitraAccount, Partner } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// AFA MITRA — standalone authentication authority (Fase 2).
//
// afa_mitra_session → MitraAccount → partnerId → Partner
//
// Fully independent from the customer (Supabase) auth system. A customer and a
// Mitra can be logged in simultaneously; logging out of one never touches the
// other. The cookie name, secret and helpers here are entirely separate from
// the customer `afa_session` / JWT_SECRET flow in lib/auth.ts.
// ---------------------------------------------------------------------------

export const MITRA_COOKIE = "afa_mitra_session";

export const MITRA_PASSWORD_MIN_LENGTH = 8;
export const MITRA_BCRYPT_COST = 10;

type MitraSessionPayload = {
    accountId: string;
    partnerId: string;
};

// Secret is server-only and never falls back to the customer JWT secret. When
// missing we fail closed (null / redirect) rather than weakening auth silently.
function getMitraSessionSecret(): Uint8Array | null {
    const secret = process.env.MITRA_SESSION_SECRET;
    if (!secret) return null;
    return new TextEncoder().encode(secret);
}

function requireMitraSessionSecret(): Uint8Array {
    const secret = getMitraSessionSecret();
    if (!secret) {
        throw new Error("MITRA_SESSION_SECRET is not configured.");
    }
    return secret;
}

export async function hashMitraPassword(password: string): Promise<string> {
    return bcryptHash(password, MITRA_BCRYPT_COST);
}

export async function verifyMitraPassword(password: string, passwordHash: string): Promise<boolean> {
    try {
        return await bcryptCompare(password, passwordHash);
    } catch {
        return false;
    }
}

export async function createMitraSession(
    accountId: string,
    partnerId: string,
    remember = false,
): Promise<string> {
    return new SignJWT({ accountId, partnerId } satisfies MitraSessionPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(remember ? "30d" : "1d")
        .sign(requireMitraSessionSecret());
}

export async function readMitraSession(): Promise<MitraSessionPayload | null> {
    const secret = getMitraSessionSecret();
    if (!secret) return null;

    const cookieStore = await cookies();
    const token = cookieStore.get(MITRA_COOKIE)?.value;
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, secret);
        if (typeof payload.accountId !== "string" || typeof payload.partnerId !== "string") {
            return null;
        }
        return { accountId: payload.accountId, partnerId: payload.partnerId };
    } catch {
        return null;
    }
}

export function mitraCookieOptions(remember: boolean) {
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24,
    };
}

export async function clearMitraSessionCookie() {
    const cookieStore = await cookies();
    cookieStore.set(MITRA_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    });
}

export async function getCurrentMitraAccount(): Promise<
    (MitraAccount & { partner: Partner }) | null
> {
    const session = await readMitraSession();
    if (!session) return null;

    try {
        const account = await prisma.mitraAccount.findUnique({
            where: { id: session.accountId },
            include: { partner: true },
        });
        if (!account || account.id !== session.accountId || account.partnerId !== session.partnerId) {
            return null;
        }
        return account;
    } catch (error) {
        console.error("Mitra account lookup failed", {
            category: "mitra_account_lookup",
            name: error instanceof Error ? error.name : "DatabaseError",
        });
        return null;
    }
}

export async function getCurrentPartnerFromMitraSession(): Promise<Partner | null> {
    const account = await getCurrentMitraAccount();
    if (!account) return null;
    if (account.isActive === false) return null;
    if (account.partner.status !== "ACTIVE") return null;
    return account.partner;
}

// ---------------------------------------------------------------------------
// Presentation-layer routing (server pages)
// ---------------------------------------------------------------------------

export type MitraRoute =
    | { kind: "unauthenticated" }
    | { kind: "pending"; partner: Partner }
    | { kind: "suspended"; partner: Partner }
    | { kind: "rejected"; partner: Partner }
    | { kind: "active"; partner: Partner };

export async function resolveMitra(): Promise<MitraRoute> {
    const account = await getCurrentMitraAccount();
    if (!account) return { kind: "unauthenticated" };

    const { partner } = account;
    if (partner.status === "ACTIVE") return { kind: "active", partner };
    if (partner.status === "SUSPENDED") return { kind: "suspended", partner };
    if (partner.status === "REJECTED") return { kind: "rejected", partner };
    return { kind: "pending", partner };
}

// Server gate for the operational /mitra/* routes: ACTIVE-only.
export async function requireActiveMitra(): Promise<{
    name: string;
    code: string;
    partner: Partner;
    account: MitraAccount;
}> {
    const account = await getCurrentMitraAccount();
    if (!account) redirect("/mitra/login");
    if (account.isActive === false) redirect("/mitra/pengajuan");
    if (account.partner.status !== "ACTIVE") redirect("/mitra/pengajuan");

    return {
        name: account.partner.businessName || account.partner.displayName,
        code: account.partner.partnerCode,
        partner: account.partner,
        account,
    };
}

export async function requireMitra(): Promise<MitraAccount & { partner: Partner }> {
    const account = await getCurrentMitraAccount();
    if (!account) redirect("/mitra/login");
    return account;
}
