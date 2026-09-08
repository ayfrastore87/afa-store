import { NextResponse } from "next/server";
import { clearAuthCookie, createSupabaseServerClient } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error && error.name !== "AuthSessionMissingError") {
        console.error("Supabase logout failed", {
            category: "logout_failure",
            name: error.name || "AuthError",
            status: error.status,
        });
        return NextResponse.json({ message: "Logout gagal. Silakan coba lagi." }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true });
    clearAuthCookie(response);
    return response;
}
