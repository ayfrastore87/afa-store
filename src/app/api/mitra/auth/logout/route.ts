import { NextResponse } from "next/server";

import { clearMitraSessionCookie } from "@/lib/mitra-auth";

export const runtime = "nodejs";

// Logout only clears the Mitra cookie. The customer (afa_session) and any admin
// session are left completely untouched.
export async function POST() {
    await clearMitraSessionCookie();
    return NextResponse.json({ ok: true });
}
