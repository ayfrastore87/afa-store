import { NextResponse } from "next/server";
import { clearAuthCookie, createSupabaseServerClient, ensurePublicUser, publicUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    try {
        let body: { identifier?: string; password?: string; remember?: boolean };

        try {
            body = await request.json();
        } catch (error) {
            console.error("Login request JSON parse failed", error);
            return NextResponse.json({ message: "Payload login tidak valid." }, { status: 400 });
        }

        const { identifier, password, remember } = body;
        if (!identifier || !password) {
            return NextResponse.json({ message: "Email dan password wajib diisi." }, { status: 400 });
        }

        const email = String(identifier).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ message: "Format email tidak valid." }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error || !data.user) {
            const providerStatus = error?.status;
            const providerCode = error?.code;
            console.error("Supabase login rejected", {
                category: "authentication_rejected",
                status: providerStatus,
                code: providerCode,
            });

            if (providerStatus === 429) {
                return NextResponse.json({ message: "Terlalu banyak percobaan login. Silakan coba lagi nanti." }, { status: 429 });
            }

            if (providerCode === "email_not_confirmed") {
                return NextResponse.json({ message: "Email belum terverifikasi. Silakan cek email Anda." }, { status: 403 });
            }

            return NextResponse.json({ message: "Login gagal. Periksa email dan password Anda." }, { status: 401 });
        }

        const metadata = data.user.user_metadata || {};
        const user = await ensurePublicUser(data.user, String(metadata.name || data.user.email?.split("@")[0] || "Pelanggan"));

        if (!user.isActive) {
            await supabase.auth.signOut();
            console.warn("Login blocked for inactive application user");
            return NextResponse.json({ message: "Akun tidak aktif." }, { status: 403 });
        }

        const safeUser = publicUser(user);
        const response = NextResponse.json({ user: safeUser });
        // Supabase SSR cookies written by signInWithPassword are the session authority.
        // Remove the legacy application JWT so consumers cannot observe two identities.
        clearAuthCookie(response);
        return response;
    } catch (error) {
        console.error("Login route failed", {
            category: "unexpected_login_failure",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Login gagal karena kesalahan server." }, { status: 500 });
    }
}
