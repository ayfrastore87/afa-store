import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
    const { token, password, confirmPassword } = await request.json();

    if (!token || !password || password !== confirmPassword) {
        return NextResponse.json({ message: "Token/password tidak valid." }, { status: 400 });
    }

    const reset = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
        return NextResponse.json({ message: "Link reset tidak valid atau kadaluarsa." }, { status: 400 });
    }

    await prisma.$transaction([
        prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
        prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    ]);

    return NextResponse.json({ message: "Password berhasil diubah." });
}