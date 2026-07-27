import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/auth";

export const runtime = "nodejs";

const resetPasswordSchema = z.object({
    password: z.string().min(6, "Password minimal 6 karakter."),
});

export async function POST(request: Request) {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Password tidak valid." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

    if (error) {
        if (error.name !== "AuthSessionMissingError") {
            console.error("Supabase reset password failed", error);
        }
        return NextResponse.json({ message: "Session reset password tidak valid atau sudah kedaluwarsa." }, { status: 401 });
    }

    return NextResponse.json({ message: "Password berhasil diperbarui. Silakan login." });
}
