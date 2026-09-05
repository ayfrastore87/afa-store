import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

function imageExtension(buffer: Buffer): string | null {
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
    if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
    return null;
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const formData = await request.formData();
        const invoice = String(formData.get("invoice") || "");
        const file = formData.get("paymentProof");

        if (!(file instanceof File)) return NextResponse.json({ message: "Bukti pembayaran wajib diupload." }, { status: 400 });

        const order = await prisma.order.findFirst({ where: { invoice, userId: user.id } });
        if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });
        if (order.paymentStatus === "PAID" || order.status === "PAID") {
            return NextResponse.json({ message: "Pesanan yang sudah lunas tidak dapat diubah." }, { status: 409 });
        }
        if (order.paymentStatus === "EXPIRED" || order.status === "EXPIRED") {
            return NextResponse.json({ message: "Pesanan yang sudah kedaluwarsa tidak dapat diubah." }, { status: 409 });
        }
        if (order.paymentStatus === "CANCELLED" || order.status === "CANCELLED") {
            return NextResponse.json({ message: "Pesanan yang sudah dibatalkan tidak dapat diubah." }, { status: 409 });
        }
        const paymentMethod = order.paymentMethod;
        if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ message: "Bukti pembayaran harus berupa gambar maksimal 5 MB." }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const extension = imageExtension(buffer);
        if (!extension) {
            return NextResponse.json({ message: "Isi file bukan gambar PNG, JPEG, atau WebP yang valid." }, { status: 400 });
        }
        const safeName = `${randomUUID()}${extension}`;
        const uploadDir = path.join(process.cwd(), "public", "uploads", "payment-proofs");
        await mkdir(uploadDir, { recursive: true });
        await writeFile(path.join(uploadDir, safeName), buffer);

        const paymentProof = `/uploads/payment-proofs/${safeName}`;
        await prisma.payment.upsert({
            where: { orderId: order.id },
            create: {
                orderId: order.id,
                method: paymentMethod || order.paymentMethod,
                amount: order.total,
                status: "PENDING",
                expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                paidAt: null,
            },
            update: {
                method: paymentMethod || order.paymentMethod,
                amount: order.total,
            },
        });

        await prisma.order.update({
            where: { id: order.id },
            data: {
                paymentMethod: paymentMethod || order.paymentMethod,
                paymentProof,
                paymentStatus: "WAITING_CONFIRMATION",
            },
        });

        return NextResponse.json({ message: "Bukti pembayaran berhasil dikirim." }, { status: 200 });
    } catch (error) {
        console.error("Payment upload Error:", error);
        return NextResponse.json({ message: "Bukti pembayaran belum dapat disimpan." }, { status: 500 });
    }
}
