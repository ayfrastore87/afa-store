import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const AUTH_COOKIE = "afa_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "afa-store-dev-secret-change-me");

export type SessionUser = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    image: string | null;
    role: string;
};

export async function signSession(user: SessionUser, remember = false) {
    return new SignJWT({ user })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(remember ? "30d" : "1d")
        .sign(secret);
}

export async function verifySession(token?: string) {
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, secret);
        return payload.user as SessionUser;
    } catch {
        return null;
    }
}

export async function getCurrentUser() {
    const store = await cookies();
    const session = await verifySession(store.get(AUTH_COOKIE)?.value);
    if (!session) return null;
    return prisma.user.findFirst({
        where: { id: session.id, isActive: true },
        select: { id: true, name: true, email: true, phone: true, image: true, role: true, createdAt: true },
    });
}

export function publicUser(user: { id: string; name: string; email: string; phone: string | null; image: string | null; role: string; createdAt?: Date }) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt?.toISOString(),
    };
}

export function setAuthCookie(response: NextResponse, token: string, remember = false) {
    response.cookies.set(AUTH_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24,
    });
}

export function clearAuthCookie(response: NextResponse) {
    response.cookies.set(AUTH_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    });
}