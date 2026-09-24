import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.next({ request });
    }

    // Create response that will carry forwarded cookies
    const response = NextResponse.next({ request });

    // Initialize Supabase SSR client with proper cookie handling
    const supabase = createServerClient(
        supabaseUrl,
        supabaseKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
                    // IMPORTANT: Set cookies on BOTH request and response to maintain chain
                    cookiesToSet.forEach(({ name, value, options }) => {
                        // Update request cookies for subsequent middleware/runtime calls
                        request.cookies.set(name, value);
                        
                        // Set cookie on response headers (this is what browser receives)
                        response.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    // Get current authenticated user from Supabase session
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error && error.name !== "AuthSessionMissingError") {
        console.error("Supabase proxy getUser failed", {
            pathname: request.nextUrl.pathname,
            error: error.message,
            hasUser: Boolean(user),
        });
    }

    const pathname = request.nextUrl.pathname;

    // Protected customer routes
    const protectedCustomerRoute = ["/account", "/cart", "/checkout"].some((route) => 
        pathname === route || pathname.startsWith(`${route}/`)
    );
    
    // Protected admin routes
    const protectedAdminRoute = pathname.startsWith("/admin") && pathname !== "/admin/login";
    const protectedKasirRoute = pathname.startsWith("/kasir") && pathname !== "/kasir/login";

    // If not protecting this route, just forward the request
    if (!protectedCustomerRoute && !protectedAdminRoute && !protectedKasirRoute) {
        return response;
    }

    // Check if user exists in Supabase session
    if (!user) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = protectedKasirRoute ? "/kasir/login" : protectedAdminRoute ? "/admin/login" : "/login";
        loginUrl.search = "";
        loginUrl.searchParams.set("next", pathname);
        
        // Return redirect response - will be properly processed by Next.js
        return NextResponse.redirect(loginUrl);
    }

    // User authenticated - allow access
    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files (img/, icons/, etc.)
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
    ],
};