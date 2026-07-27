import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return response;

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                response = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
        },
    });

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error && error.name !== "AuthSessionMissingError") {
        console.error("Supabase proxy getUser failed", error);
    }

    const pathname = request.nextUrl.pathname;

    if (!pathname.startsWith("/admin") || pathname === "/admin/login") {
        return response;
    }

    if (!user) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/admin/login";
        loginUrl.search = "";
        return NextResponse.redirect(loginUrl);
    }

    const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("role, isActive")
        .eq("auth_id", user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Supabase proxy admin profile failed", profileError);
    }

    if (!profile || profile.role !== "admin" || profile.isActive === false) {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = "/";
        homeUrl.search = "";
        return NextResponse.redirect(homeUrl);
    }

    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};