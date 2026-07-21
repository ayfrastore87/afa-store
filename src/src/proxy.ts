import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
    if (!request.nextUrl.pathname.startsWith("/account")) return NextResponse.next();

    const session = await verifyToken(request.cookies.get(AUTH_COOKIE)?.value);
    if (!session) {
        return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url));
    }

    return NextResponse.next();
}

export const config = { matcher: ["/account/:path*"] };