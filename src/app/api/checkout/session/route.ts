import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CHECKOUT_COOKIE, checkoutSubtotal, decodeCheckoutItems, encodeCheckoutItems } from "@/lib/checkout";
import { getCurrentUser } from "@/lib/server-auth";
import { authorizeProductItems, parseProductRequestItem, productAuthorityResponse } from "@/lib/product-authority";
import { isGuestCheckoutEnabled } from "@/lib/guest-checkout-flag";
import { ensureGuestSession } from "@/lib/guest-checkout-session";

export const runtime = "nodejs";

export async function GET() {
    try {
        const user = await getCurrentUser();
        // Feature-flag gate: unchanged authenticated behaviour when OFF.
        if (!user && !isGuestCheckoutEnabled()) {
            return NextResponse.json({ redirectTo: "/login" }, { status: 401 });
        }
        const store = await cookies();
        const snapshot = decodeCheckoutItems(store.get(CHECKOUT_COOKIE)?.value);
        const items = await authorizeProductItems(snapshot.map(({ id, qty }) => ({ id, qty })));
        const subtotal = checkoutSubtotal(items);
        // Shipping is now quoted live via POST /api/shipping/rates (never a flat fee).
        return NextResponse.json({ items, subtotal, shipping: 0, total: subtotal });
    } catch (error) {
        const safe = productAuthorityResponse(error);
        return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
    }
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        // Feature-flag gate: unchanged authenticated behaviour when OFF.
        if (!user && !isGuestCheckoutEnabled()) {
            return NextResponse.json({ redirectTo: "/login" }, { status: 401 });
        }
        const body: unknown = await request.json();
        const values = typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).items) ? (body as { items: unknown[] }).items : [];
        const requested = values.map(parseProductRequestItem);
        if (!requested.length || requested.some((item) => item === null)) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });
        const items = await authorizeProductItems(requested.filter((item): item is NonNullable<typeof item> => item !== null));

        const response = NextResponse.json({ redirectTo: "/checkout" });
        response.cookies.set(CHECKOUT_COOKIE, encodeCheckoutItems(items), {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 30,
        });
        // Guest branch: mint (or reuse) the HttpOnly guest session cookie so
        // /api/checkout/order can bind this checkout to a stable guest identity.
        // The raw token never leaves the cookie header — only the sha256 hash
        // reaches the database in CheckoutIdempotency.guestSessionHash.
        if (!user) {
            await ensureGuestSession(response);
        }
        return response;
    } catch (error) {
        const safe = productAuthorityResponse(error);
        return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
    }
}