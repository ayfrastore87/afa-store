import { NextResponse } from "next/server";
import { publicUser } from "@/lib/auth";
import { getCurrentCustomer } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
    // Customer-aware identity. An admin (or partner / inactive) Supabase user must
    // not be exposed as a customer identity to customer-facing callers.
    const customer = await getCurrentCustomer();
    if (!customer) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: publicUser(customer) });
}
