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

    const protectedCustomerRoute = ["/account", "/cart", "/checkout"].some((route) => pathname === route || pathname.startsWith(`${route}/`));
    const protectedAdminRoute = pathname.startsWith("/admin") && pathname !== "/admin/login";

    if (!protectedCustomerRoute && !protectedAdminRoute) {
        return response;
    }

    if (!user) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = protectedAdminRoute ? "/admin/login" : "/login";
        loginUrl.search = "";
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};