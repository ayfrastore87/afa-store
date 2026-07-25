import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
    const { currentPassword, password, confirmPassword } = await request.json();
    if (!password || password !== confirmPassword || password.length < 8) {
        return NextResponse.json(
            { message: "Password minimal 8 karakter dan konfirmasi harus sama." },
            { status: 400 }
        );
    }
    if (password === currentPassword) {
        return NextResponse.json({ message: "Password baru harus berbeda dari password lama." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });

    return NextResponse.json({ message: "Password berhasil diubah." });
}
