import { NextResponse } from "next/server";
import { CHECKOUT_COOKIE, encodeCheckoutItems } from "@/lib/checkout";
import { authorizeProductItems, parseProductRequestItem, productAuthorityResponse } from "@/lib/product-authority";

export const runtime = "nodejs";

export async function POST(request: Request) {
    try {
        const item = parseProductRequestItem(await request.json());
        if (!item) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });
        const [authorized] = await authorizeProductItems([item]);

        const response = NextResponse.json({ success: true, redirectTo: "/checkout" });
        response.cookies.set(CHECKOUT_COOKIE, encodeCheckoutItems([authorized]), {
            httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 30,
        });
        return response;
    } catch (error) {
        const safe = productAuthorityResponse(error);
        return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
    }
}
