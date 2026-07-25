import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient, publicUser, setAuthCookie, signSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const { identifier, password, remember } = await request.json();
    if (!identifier || !password) {
        return NextResponse.json({ message: "Email dan password wajib diisi." }, { status: 400 });
    }

    const email = String(identifier).trim().toLowerCase();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
        return NextResponse.json({ message: "Login gagal. Periksa email dan password Anda." }, { status: 401 });
    }

    const metadata = data.user.user_metadata || {};
    const user = await prisma.user.upsert({
        where: { email: data.user.email || email },
        update: {
            id: data.user.id,
            name: String(metadata.name || data.user.email?.split("@")[0] || "Pelanggan"),
            phone: typeof metadata.phone === "string" ? metadata.phone : null,
            passwordHash: null,
            isActive: true,
        },
        create: {
            id: data.user.id,
            name: String(metadata.name || data.user.email?.split("@")[0] || "Pelanggan"),
            email: data.user.email || email,
            phone: typeof metadata.phone === "string" ? metadata.phone : null,
            passwordHash: null,
        },
    });

    if (!user.isActive) {
        return NextResponse.json({ message: "Akun tidak aktif." }, { status: 403 });
    }

    const safeUser = publicUser(user);
    const response = NextResponse.json({ user: safeUser });
    setAuthCookie(response, await signSession(safeUser, Boolean(remember)), Boolean(remember));
    return response;
}
