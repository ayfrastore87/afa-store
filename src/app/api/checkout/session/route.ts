import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CHECKOUT_COOKIE, SHIPPING_COST, checkoutSubtotal, decodeCheckoutItems } from "@/lib/checkout";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ redirectTo: "/login" }, { status: 401 });
        const store = await cookies();
        const items = decodeCheckoutItems(store.get(CHECKOUT_COOKIE)?.value);
        const subtotal = checkoutSubtotal(items);
        return NextResponse.json({ items, subtotal, shipping: SHIPPING_COST, total: subtotal + SHIPPING_COST });
    } catch (error) {
        console.error("Checkout session Error:", error);
        return NextResponse.json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}