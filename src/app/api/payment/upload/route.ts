import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const invoice = String(formData.get("invoice") || "");
    const paymentMethod = String(formData.get("paymentMethod") || "QRIS");
    const file = formData.get("paymentProof");

    if (!(file instanceof File)) return NextResponse.json({ message: "Bukti pembayaran wajib diupload." }, { status: 400 });

    const order = await prisma.order.findFirst({ where: { invoice, userId: user.id } });
    if (!order) return NextResponse.json({ message: "Pesanan tidak ditemukan." }, { status: 404 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = `${invoice}-${Date.now()}${path.extname(file.name || ".png") || ".png"}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "payment-proofs");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, safeName), buffer);

    const paymentProof = `/uploads/payment-proofs/${safeName}`;
    await prisma.order.update({
        where: { id: order.id },
        data: {
            paymentMethod: paymentMethod || order.paymentMethod,
            paymentStatus: "WAITING_CONFIRMATION",
            paymentProof,
            paidAt: new Date(),
        },
    });

    return NextResponse.json({ message: "Bukti pembayaran berhasil dikirim.", paymentProof }, { status: 200 });
}