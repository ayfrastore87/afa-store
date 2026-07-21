import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const registerSchema = z.object({
    name: z.string().trim().min(2, "Nama minimal 2 karakter."),
    email: z.string().trim().email("Format email tidak valid.").transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(8, "Nomor WhatsApp tidak valid."),
    password: z.string().min(8, "Password minimal 8 karakter."),
    confirmPassword: z.string().min(8, "Konfirmasi password minimal 8 karakter."),
});

export async function POST(request: Request) {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { message: parsed.error.issues[0]?.message || "Data registrasi tidak valid." },
            { status: 400 }
        );
    }

    const { name, email, phone, password, confirmPassword } = parsed.data;

    if (password !== confirmPassword) {
        return NextResponse.json({ message: "Konfirmasi password tidak sama." }, { status: 400 });
    }

    const exists = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { phone }],
        },
    });

    if (exists) {
        return NextResponse.json({ message: "Email atau WhatsApp sudah terdaftar." }, { status: 409 });
    }

    const user = await prisma.user.create({
        data: {
            name,
            email,
            phone,
            passwordHash: await bcrypt.hash(password, 12),
        },
    });

    return NextResponse.json(
        {
            message: "Registrasi berhasil.",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
            },
        },
        { status: 201 }
    );
}
