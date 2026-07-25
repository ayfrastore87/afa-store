import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { jwtVerify, SignJWT } from "jose";
import type { NextResponse } from "next/server";

export const AUTH_COOKIE = "afa_session";

export type PublicUser = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    image: string | null;
    role: string;
    createdAt?: string;
};

type UserLike = Omit<PublicUser, "createdAt"> & { createdAt?: Date | string };

function getJwtSecret() {
    return new TextEncoder().encode(process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "afa-store-dev-secret");
}

function getSupabaseServerEnv() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase server env missing", {
            hasUrl: Boolean(supabaseUrl),
            hasAnonKey: Boolean(supabaseAnonKey),
        });
        throw new Error("Konfigurasi Supabase belum lengkap.");
    }

    return { supabaseUrl, supabaseAnonKey };
}

export function publicUser<T extends UserLike>(user: T): PublicUser {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    };
}

export async function signSession(user: PublicUser, remember = false) {
    const maxAge = remember ? "30d" : "1d";

    return new SignJWT(publicUser(user))
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(maxAge)
        .sign(getJwtSecret());
}

export async function verifyToken(token?: string) {
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, getJwtSecret());
        return payload as PublicUser;
    } catch (error) {
        console.error("Auth token verification failed", error);
        return null;
    }
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

export async function getSession() {
    const cookieStore = await cookies();
    return verifyToken(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function createSupabaseServerClient() {
    const cookieStore = await cookies();
    const { supabaseUrl, supabaseAnonKey } = getSupabaseServerEnv();

    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet: {
                    name: string;
                    value: string;
                    options: CookieOptions;
                }[]) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                },
            },
        }
    );
}

export async function getCurrentUser(): Promise<User | null> {
    const supabase = await createSupabaseServerClient();

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        if (error) console.error("Supabase getCurrentUser failed", error);
        return null;
    }

    return user;
}

export async function getCurrentAdmin() {
    const user = await getCurrentUser();

    if (!user) {
        return null;
    }

    const supabase = await createSupabaseServerClient();

    const { data: admin, error } = await supabase
        .from("users")
        .select("*")
        .eq("auth_id", user.id)
        .single();

    if (error || !admin) {
        if (error) console.error("Supabase getCurrentAdmin failed", error);
        return null;
    }

    if (admin.role !== "admin") {
        return null;
    }

    return admin;
}

export async function requireAdmin() {
    const admin = await getCurrentAdmin();

    if (!admin) {
        redirect("/admin/login");
    }

    return admin;
}