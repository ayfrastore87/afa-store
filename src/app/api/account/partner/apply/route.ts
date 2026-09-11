import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { generatePartnerCode, isPartnerType } from "@/lib/partner";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

const MAX_CODE_ATTEMPTS = 5;

const applySchema = z.object({
    partnerType: z.string().trim(),
    displayName: z.string().trim().min(2, "Nama tampilan minimal 2 karakter.").max(80, "Nama tampilan maksimal 80 karakter."),
    businessName: z.string().trim().max(120, "Nama usaha maksimal 120 karakter.").optional(),
    phone: z.string().trim().max(30, "Nomor WhatsApp maksimal 30 karakter.").optional(),
    address: z.string().trim().max(255, "Alamat maksimal 255 karakter.").optional(),
    village: z.string().trim().max(100, "Kelurahan maksimal 100 karakter.").optional(),
    district: z.string().trim().max(100, "Kecamatan maksimal 100 karakter.").optional(),
    city: z.string().trim().max(100, "Kota maksimal 100 karakter.").optional(),
    postalCode: z.string().trim().max(10, "Kode pos maksimal 10 karakter.").optional(),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { message: parsed.error.issues[0]?.message || "Data pengajuan tidak valid." },
            { status: 400 }
        );
    }

    const { partnerType, displayName, businessName, phone, address, village, district, city, postalCode } = parsed.data;

    if (!isPartnerType(partnerType)) {
        return NextResponse.json({ message: "Jenis mitra tidak valid." }, { status: 400 });
    }

    if (partnerType !== "INDIVIDUAL" && !businessName) {
        return NextResponse.json({ message: "Nama usaha wajib diisi untuk jenis mitra ini." }, { status: 400 });
    }

    // Duplicate protection at the application layer.
    const existing = await prisma.partner.findUnique({ where: { userId: user.id } });
    if (existing) {
        return NextResponse.json(
            { message: "Anda sudah memiliki pengajuan mitra.", partner: { status: existing.status } },
            { status: 409 }
        );
    }

    const finalPhone = phone || user.phone || null;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const partnerCode = generatePartnerCode();

        try {
            const partner = await prisma.partner.create({
                data: {
                    userId: user.id,
                    partnerCode,
                    partnerType,
                    status: "PENDING",
                    displayName,
                    businessName: businessName || null,
                    phone: finalPhone,
                    address: address || null,
                    village: village || null,
                    district: district || null,
                    city: city || null,
                    postalCode: postalCode || null,
                },
                select: {
                    id: true,
                    partnerCode: true,
                    partnerType: true,
                    status: true,
                    displayName: true,
                    createdAt: true,
                },
            });

            return NextResponse.json(
                { message: "Pengajuan mitra berhasil dikirim.", partner },
                { status: 201 }
            );
        } catch (error) {
            const target = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
                ? (error.meta?.target as string | string[] | undefined)
                : undefined;
            const targets = Array.isArray(target) ? target : target ? [target] : [];
            const isCodeCollision = targets.includes("partnerCode");
            const isUserIdCollision = targets.includes("userId");

            if (isUserIdCollision) {
                const current = await prisma.partner.findUnique({ where: { userId: user.id } });
                return NextResponse.json(
                    { message: "Anda sudah memiliki pengajuan mitra.", partner: { status: current?.status ?? "PENDING" } },
                    { status: 409 }
                );
            }

            if (isCodeCollision) {
                continue; // regenerate partner code
            }

            console.error("Partner apply failed", {
                category: "partner_apply",
                name: error instanceof Error ? error.name : "UnknownError",
            });
            return NextResponse.json({ message: "Pengajuan gagal. Silakan coba lagi." }, { status: 500 });
        }
    }

    return NextResponse.json({ message: "Gagal membuat kode mitra. Silakan coba lagi." }, { status: 500 });
}
