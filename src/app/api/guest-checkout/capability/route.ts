import { NextResponse } from "next/server";
import { isGuestCheckoutEnabled } from "@/lib/guest-checkout-flag";

export const runtime = "nodejs";

/** Public capability only; never expose the environment or other settings. */
export async function GET() {
    return NextResponse.json({ guestCheckoutEnabled: isGuestCheckoutEnabled() }, {
        headers: { "Cache-Control": "no-store" },
    });
}