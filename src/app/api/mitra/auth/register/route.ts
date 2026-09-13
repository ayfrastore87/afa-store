import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
    createMitraSession,
    hashMitraPassword,
    MITRA_COOKIE,
    MITRA_PASSWORD_MIN_LENGTH,
    mitraCookieOptions,
} from "@/lib/mitra-auth";
import { generatePartnerCode, isPartnerType } from "@/lib/partner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_CODE_ATTEMPTS = 5;

const registerSchema = z
    .object({
        username: z
            .string()
            .trim()
            .toLowerCase()
            .min(3, "Username minimal 3 karakter.")
            .max(32, "Username maksimal 32 karakter.")
            .regex(/^[a-z0-9._-]+$/, "Username hanya boleh huruf kecil, angka, titik, garis bawah, atau strip."),
        email: z.string().trim().toLowerCase().email("Format email tidak valid.").max(120, "Email maksimal 120 karakter."),
        password: z.string().min(MITRA_PASSWORD_MIN_LENGTH, `Password minimal ${MITRA_PASSWORD_MIN_LENGTH} karakter.`).max(72, "Password maksimal 72 karakter."),
        confirmPassword: z.string(),
        partnerType: z.string().trim(),
        displayName: z.string().trim().min(2, "Nama tampilan minimal 2 karakter.").max(80, "Nama tampilan maksimal 80 karakter."),
        businessName: z.string().trim().max(120, "Nama usaha maksimal 120 karakter.").optional(),
        phone: z.string().trim().max(30, "Nomor WhatsApp maksimal 30 karakter.").optional(),
        address: z.string().trim().max(255, "Alamat maksimal 255 karakter.").optional(),
        village: z.string().trim().max(100, "Kelurahan maksimal 100 karakter.").optional(),
        district: z.string().trim().max(100, "Kecamatan maksimal 100 karakter.").optional(),
        city: z.string().trim().max(100, "Kota maksimal 100 karakter.").optional(),
        postalCode: z.string().trim().max(10, "Kode pos maksimal 10 karakter.").optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Konfirmasi password tidak sesuai.",
        path: ["confirmPassword"],
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
            { message: parsed.error.issues[0]?.message || "Data pendaftaran tidak valid." },
            { status: 400 }
        );
    }

    const {
        username,
        email,
        password,
        partnerType,
        displayName,
        businessName,
        phone,
        address,
        village,
        district,
        city,
        postalCode,
    } = parsed.data;

    if (!isPartnerType(partnerType)) {
        return NextResponse.json({ message: "Jenis mitra tidak valid." }, { status: 400 });
    }

    if (partnerType !== "INDIVIDUAL" && !businessName) {
        return NextResponse.json({ message: "Nama usaha wajib diisi untuk jenis mitra ini." }, { status: 400 });
    }

    const duplicate = await prisma.mitraAccount.findFirst({
        where: { OR: [{ username }, { email }] },
        select: { username: true, email: true },
    });
    if (duplicate) {
        const field = duplicate.username === username ? "Username" : "Email";
        return NextResponse.json({ message: `${field} sudah terdaftar. Gunakan yang lain.` }, { status: 409 });
    }

    const passwordHash = await hashMitraPassword(password);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const partnerCode = generatePartnerCode();

        try {
            const created = await prisma.$transaction(async (tx) => {
                const partner = await tx.partner.create({
                    data: {
                        userId: null,
                        partnerCode,
                        partnerType,
                        status: "PENDING",
                        displayName,
                        businessName: businessName || null,
                        phone: phone || null,
                        address: address || null,
                        village: village || null,
                        district: district || null,
                        city: city || null,
                        postalCode: postalCode || null,
                    },
                    select: { id: true, partnerCode: true, status: true },
                });

                const account = await tx.mitraAccount.create({
                    data: {
                        partnerId: partner.id,
                        username,
                        email,
                        passwordHash,
                        isActive: true,
                    },
                    select: { id: true, username: true, email: true },
                });

                return { partner, account };
            });

            const token = await createMitraSession(created.account.id, created.partner.id, false);
            const response = NextResponse.json(
                {
                    message: "Akun mitra berhasil dibuat.",
                    redirectTo: "/mitra/pengajuan",
                    partner: { id: created.partner.id, partnerCode: created.partner.partnerCode, status: created.partner.status },
                },
                { status: 201 }
            );
            response.cookies.set(MITRA_COOKIE, token, mitraCookieOptions(false));
            return response;
        } catch (error) {
            const target =
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
                    ? (error.meta?.target as string | string[] | undefined)
                    : undefined;
            const targets = Array.isArray(target) ? target : target ? [target] : [];

            if (targets.includes("partnerCode")) continue;
            if (targets.includes("username")) {
                return NextResponse.json({ message: "Username sudah terdaftar. Gunakan username lain." }, { status: 409 });
            }
            if (targets.includes("email")) {
                return NextResponse.json({ message: "Email sudah terdaftar. Gunakan email lain." }, { status: 409 });
            }

            console.error("Mitra register failed", {
                category: "mitra_register",
                name: error instanceof Error ? error.name : "UnknownError",
            });
            return NextResponse.json({ message: "Pendaftaran gagal. Silakan coba lagi." }, { status: 500 });
        }
    }

    return NextResponse.json({ message: "Gagal membuat kode mitra. Silakan coba lagi." }, { status: 500 });
}

