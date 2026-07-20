import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicUser, setAuthCookie, signSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const { identifier, password, remember } = await request.json();
    if (!identifier || !password) {
        return NextResponse.json({ message: "Email/WhatsApp dan password wajib diisi." }, { status: 400 });
    }
    const user = await prisma.user.findFirst({
        where: { OR: [{ email: identifier.toLowerCase() }, { phone: identifier }], isActive: true },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
        return NextResponse.json({ message: "Login gagal. Periksa data Anda." }, { status: 401 });
    }
    const safeUser = publicUser(user);
    const response = NextResponse.json({ user: safeUser });
    setAuthCookie(response, await signSession(safeUser, Boolean(remember)), Boolean(remember));
    return response;
}
