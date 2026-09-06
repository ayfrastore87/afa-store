import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, ensurePublicUser, publicUser } from "@/lib/auth";

export const runtime = "nodejs";

const RATE_LIMIT_MESSAGE = "Terlalu banyak email verifikasi yang dikirim dalam waktu singkat. Silakan tunggu beberapa saat lalu coba lagi.";

const registerSchema = z.object({
    name: z.string().trim().min(2, "Nama minimal 2 karakter."),
    email: z.string().trim().email("Format email tidak valid.").transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(8, "Nomor WhatsApp tidak valid."),
    password: z.string().min(8, "Password minimal 8 karakter."),
    confirmPassword: z.string().min(8, "Konfirmasi password minimal 8 karakter."),
});

export async function POST(request: Request) {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { message: parsed.error.issues[0]?.message || "Data registrasi tidak valid." },
            { status: 400 }
        );
    }

    const { name, email, phone, password, confirmPassword } = parsed.data;

    if (password !== confirmPassword) {
        return NextResponse.json({ message: "Konfirmasi password tidak sama." }, { status: 400 });
    }

    try {
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name, phone },
                emailRedirectTo: new URL("/login", request.url).toString(),
            },
        });

        if (error) {
            console.error("Supabase register failed", {
                category: "auth_provider",
                name: error.name || "AuthError",
                status: error.status,
            });
            const message = /email rate limit exceeded/i.test(error.message)
                ? RATE_LIMIT_MESSAGE
                : /already|registered|exists/i.test(error.message)
                    ? "Email sudah digunakan."
                    : "Registrasi gagal. Silakan coba lagi.";
            const status = /already|registered|exists/i.test(error.message) ? 409 : 400;
            return NextResponse.json({ message }, { status });
        }

        const authUser = data.user;
        if (!authUser || authUser.identities?.length === 0) {
            return NextResponse.json({ message: "Email sudah digunakan." }, { status: 409 });
        }

        const user = await ensurePublicUser(authUser, name);
        return NextResponse.json(
            { message: "Silakan cek email untuk verifikasi akun.", user: publicUser(user) },
            { status: 201 }
        );
    } catch (error) {
        console.error("Registration failed", {
            category: "unexpected_registration_failure",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Registrasi gagal. Silakan coba lagi." }, { status: 500 });
    }
}
