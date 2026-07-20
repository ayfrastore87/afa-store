import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ message: "Email wajib diisi." }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return NextResponse.json({ message: "Jika email terdaftar, link reset akan dibuat." });
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + 1000 * 60 * 30) },
    });
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;
    return NextResponse.json({ message: "Link reset password berhasil dibuat.", resetUrl });
}
