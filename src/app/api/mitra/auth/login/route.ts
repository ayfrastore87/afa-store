import { NextResponse } from "next/server";

import {
    createMitraSession,
    MITRA_COOKIE,
    mitraCookieOptions,
    verifyMitraPassword,
} from "@/lib/mitra-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Anti-enumeration: identical message for unknown identifier and wrong password.
const INVALID_CREDENTIALS = "Username/email atau password tidak sesuai.";

export async function POST(request: Request) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const identifier = typeof (body as { identifier?: unknown }).identifier === "string"
        ? ((body as { identifier: string }).identifier.trim().toLowerCase())
        : "";
    const password = typeof (body as { password?: unknown }).password === "string"
        ? (body as { password: string }).password
        : "";
    const remember = (body as { remember?: unknown }).remember === true;

    if (!identifier || !password) {
        return NextResponse.json({ message: "Username/email dan password wajib diisi." }, { status: 400 });
    }

    const account = await prisma.mitraAccount.findFirst({
        where: { OR: [{ username: identifier }, { email: identifier }] },
        include: { partner: true },
    });

    if (!account) {
        return NextResponse.json({ message: INVALID_CREDENTIALS }, { status: 401 });
    }

    const valid = await verifyMitraPassword(password, account.passwordHash);
    if (!valid) {
        return NextResponse.json({ message: INVALID_CREDENTIALS }, { status: 401 });
    }

    if (account.isActive === false) {
        return NextResponse.json({ message: "Akun mitra tidak aktif. Hubungi admin AFA STORE." }, { status: 403 });
    }

    await prisma.mitraAccount.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
    });

    const redirectTo =
        account.partner.status === "ACTIVE" ? "/mitra/dashboard" : "/mitra/pengajuan";

    const token = await createMitraSession(account.id, account.partnerId, remember);
    const response = NextResponse.json({
        message: "Login berhasil.",
        redirectTo,
        user: {
            username: account.username,
            email: account.email,
            partnerCode: account.partner.partnerCode,
            status: account.partner.status,
        },
    });
    response.cookies.set(MITRA_COOKIE, token, mitraCookieOptions(remember));
    return response;
}
