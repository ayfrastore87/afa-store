import { NextResponse } from "next/server";
import { CHECKOUT_COOKIE, encodeCheckoutItems } from "@/lib/checkout";
import { authorizeProductItems, parseProductRequestItem, productAuthorityResponse } from "@/lib/product-authority";
import { getCurrentUser } from "@/lib/server-auth";
import { isGuestCheckoutEnabled } from "@/lib/guest-checkout-flag";
import { ensureGuestSession } from "@/lib/guest-checkout-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        // Feature-flag gate: when GUEST_CHECKOUT_ENABLED != "true", behaviour is
        // exactly what it was pre-guest — an unauthenticated request receives a
        // login redirect. This preserves current production semantics until the
        // guest migration is applied and the flag is flipped.
        if (!user && !isGuestCheckoutEnabled()) {
            return NextResponse.json({ redirectTo: "/login" }, { status: 401 });
        }
        const item = parseProductRequestItem(await request.json());
        if (!item) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });
        const [authorized] = await authorizeProductItems([item]);

        const response = NextResponse.json({ success: true, redirectTo: "/checkout" });
        response.cookies.set(CHECKOUT_COOKIE, encodeCheckoutItems([authorized]), {
            httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 30,
        });
        // Guest branch: mint (or reuse) the HttpOnly guest session cookie so the
        // subsequent /api/checkout/session and /api/checkout/order calls can
        // resolve the same anonymous identity. The raw token never leaves the
        // cookie header — only its sha256 hash is used server-side.
        if (!user) {
            await ensureGuestSession(response);
        }
        return response;
    } catch (error) {
        const safe = productAuthorityResponse(error);
        return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
    }
}
