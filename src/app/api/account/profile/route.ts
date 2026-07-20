import { NextResponse } from "next/server";
import { publicUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim() || null;
    const image = String(body.image || "").trim() || null;

    if (name.length < 2) return NextResponse.json({ message: "Nama minimal 2 karakter." }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ message: "Email tidak valid." }, { status: 400 });

    try {
        const updated = await prisma.user.update({
            where: { id: user.id },
            data: { name, email, phone, image },
        });
        return NextResponse.json({ user: publicUser(updated), message: "Profil berhasil diperbarui." });
    } catch {
        return NextResponse.json({ message: "Email atau nomor HP sudah digunakan akun lain." }, { status: 409 });
    }
}
