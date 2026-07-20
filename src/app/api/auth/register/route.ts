import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicUser, setAuthCookie, signSession } from "@/lib/auth";

export async function POST(request: Request) {
    const { name, email, phone, password, confirmPassword } = await request.json();

    if (!name || !email || !phone || !password || !confirmPassword) {
        return NextResponse.json({ message: "Semua field wajib diisi." }, { status: 400 });
    }

    if (password !== confirmPassword) {
        return NextResponse.json({ message: "Konfirmasi password tidak sama." }, { status: 400 });
    }

    if (password.length < 8) {
        return NextResponse.json({ message: "Password minimal 8 karakter." }, { status: 400 });
    }

    const exists = await prisma.user.findFirst({ where: { OR: [{ email: email.toLowerCase() }, { phone }] } });
    if (exists) return NextResponse.json({ message: "Email atau WhatsApp sudah terdaftar." }, { status: 409 });

    const user = await prisma.user.create({
        data: { name, email: email.toLowerCase(), phone, passwordHash: await bcrypt.hash(password, 12) },
    });

    const safeUser = publicUser(user);
    const response = NextResponse.json({ user: safeUser }, { status: 201 });
    setAuthCookie(response, await signSession(safeUser), false);
    return response;
}