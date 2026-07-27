import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/auth";

export const runtime = "nodejs";

const forgotPasswordSchema = z.object({
    email: z.string().trim().email("Format email tidak valid.").transform((value) => value.toLowerCase()),
});

export async function POST(request: Request) {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Email tidak valid." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const redirectTo = new URL("/reset-password", request.url).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });

    if (error) {
        console.error("Supabase forgot password failed", error);
        return NextResponse.json({ message: "Gagal mengirim email reset password." }, { status: 400 });
    }

    return NextResponse.json({ message: "Silakan cek email Anda untuk melakukan reset password." });
}
