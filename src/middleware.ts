import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const protectedAdminRoutes = [
    "/admin",
    "/admin/products",
    "/admin/orders",
    "/admin/parcels",
    "/admin/promotions",
    "/admin/banners",
    "/admin/testimonials",
    "/admin/faqs",
];

function isProtectedAdminPath(pathname: string) {
    return protectedAdminRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (!isProtectedAdminPath(pathname) || pathname === "/admin/login") return NextResponse.next();

    let response = NextResponse.next({ request });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Admin middleware Supabase env missing", {
            hasUrl: Boolean(supabaseUrl),
            hasAnonKey: Boolean(supabaseKey),
        });
        return NextResponse.redirect(new URL("/admin/login", request.url));
    }

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

    const { data } = await supabase.auth.getUser();

    const { data: admin } = data.user
        ? await supabase.from("users").select("role").eq("auth_id", data.user.id).single()
        : { data: null };

    if (!data.user || admin?.role !== "admin") {
        const loginUrl = new URL("/admin/login", request.url);
        loginUrl.searchParams.set("redirectedFrom", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return response;
}

export const config = {
    matcher: ["/admin/:path*"],
};