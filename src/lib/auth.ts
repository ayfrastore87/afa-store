import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

export async function signToken(user: SessionUser, remember = false) {
    return new SignJWT({ user })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(remember ? "30d" : "1d")
        .sign(secret);
}

export async function verifyToken(token?: string) {
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, secret);
        return payload.user as SessionUser;
    } catch {
        return null;
    }
}

export async function getSession() {
    const store = await cookies();
    return verifyToken(store.get(AUTH_COOKIE)?.value);
}

export const signSession = signToken;
export const verifySession = verifyToken;

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