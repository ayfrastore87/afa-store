import { NextResponse } from "next/server";
import { publicUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
    const user = await getCurrentUser();
    return NextResponse.json({ user: user ? publicUser(user) : null });
}
