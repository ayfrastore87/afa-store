import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const { currentPassword, password, confirmPassword } = await request.json();
    if (!password || password !== confirmPassword || password.length < 8) return NextResponse.json({ message: "Password minimal 8 karakter dan konfirmasi harus sama." }, { status: 400 });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (dbUser?.passwordHash && !(await bcrypt.compare(currentPassword || "", dbUser.passwordHash))) return NextResponse.json({ message: "Password lama salah." }, { status: 400 });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
    return NextResponse.json({ message: "Password berhasil diubah." });
}