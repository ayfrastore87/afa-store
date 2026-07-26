import { NextResponse } from "next/server";
import { CHECKOUT_COOKIE, encodeCheckoutItems, isCheckoutItem } from "@/lib/checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const body: unknown = await request.json();
    const item = body as unknown;
    if (!isCheckoutItem(item)) return NextResponse.json({ message: "Produk checkout tidak valid." }, { status: 400 });

    const response = NextResponse.json({ redirectTo: "/checkout" });
    response.cookies.set(CHECKOUT_COOKIE, encodeCheckoutItems([item]), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 30,
    });
    return response;
}
