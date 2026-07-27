import { NextResponse } from "next/server";
import { createSupabaseServerClient, ensurePublicUser, publicUser, setAuthCookie, signSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    console.log("Login request received");

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
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error || !data.user) {
            console.error("Supabase login failed", { email, error: error?.message });
            return NextResponse.json({ message: "Login gagal. Periksa email dan password Anda." }, { status: 401 });
        }

        const metadata = data.user.user_metadata || {};
        const user = await ensurePublicUser(data.user, String(metadata.name || data.user.email?.split("@")[0] || "Pelanggan"));

        if (!user.isActive) {
            console.error("Login blocked for inactive user", { userId: user.id, email: user.email });
            return NextResponse.json({ message: "Akun tidak aktif." }, { status: 403 });
        }

        const safeUser = publicUser(user);
        const response = NextResponse.json({ user: safeUser });
        setAuthCookie(response, await signSession(safeUser, Boolean(remember)), Boolean(remember));
        console.log("Login response success", { userId: safeUser.id, email: safeUser.email });
        return response;
    } catch (error) {
        console.error("Login route failed", error);
        const message = error instanceof Error ? error.message : "Login gagal karena kesalahan server.";
        const stack = error instanceof Error ? error.stack : undefined;

        return NextResponse.json(
            {
                message,
                stack: process.env.NODE_ENV === "development" ? stack : undefined,
            },
            { status: 500 }
        );
    }
}
