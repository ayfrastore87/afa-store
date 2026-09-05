import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CHECKOUT_COOKIE, SHIPPING_COST, checkoutSubtotal, decodeCheckoutItems, encodeCheckoutItems } from "@/lib/checkout";
import { getCurrentUser } from "@/lib/server-auth";
import { authorizeProductItems, parseProductRequestItem, productAuthorityResponse } from "@/lib/product-authority";

export const runtime = "nodejs";

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ redirectTo: "/login" }, { status: 401 });
        const store = await cookies();
        const snapshot = decodeCheckoutItems(store.get(CHECKOUT_COOKIE)?.value);
        const items = await authorizeProductItems(snapshot.map(({ id, qty }) => ({ id, qty })));
        const subtotal = checkoutSubtotal(items);
        return NextResponse.json({ items, subtotal, shipping: SHIPPING_COST, total: subtotal + SHIPPING_COST });
    } catch (error) {
        const safe = productAuthorityResponse(error);
        return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
    }
}

export async function POST(request: Request) {
    try {
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
        return response;
    } catch (error) {
        const safe = productAuthorityResponse(error);
        return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
    }
}