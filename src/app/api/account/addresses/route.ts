import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const addresses = await prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
    return NextResponse.json({ addresses });
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const data = await request.json();

    const address = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (data.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
        return tx.address.create({ data: { ...data, userId: user.id } });
    });

    return NextResponse.json({ address }, { status: 201 });
}

export async function PATCH(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const { id, ...data } = await request.json();
    if (!id) return NextResponse.json({ message: "ID alamat wajib diisi." }, { status: 400 });

    const address = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (data.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
        const existing = await tx.address.findFirst({ where: { id, userId: user.id } });
        if (!existing) throw new Error("Alamat tidak ditemukan.");
        return tx.address.update({ where: { id }, data });
    });

    return NextResponse.json({ address });
}

export async function DELETE(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const { id } = await request.json();
    const address = await prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!address) return NextResponse.json({ message: "Alamat tidak ditemukan." }, { status: 404 });
    await prisma.address.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}