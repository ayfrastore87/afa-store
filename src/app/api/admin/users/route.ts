import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const users = await prisma.user.findMany({
        where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }] } : undefined,
        include: { orders: { include: { items: true }, orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ users });
}
export async function PATCH(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const body = await request.json() as { id?: unknown; name?: unknown; phone?: unknown; image?: unknown; isActive?: unknown };
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ message: "ID wajib diisi" }, { status: 400 });
    const data = {
        ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
        ...(typeof body.phone === "string" || body.phone === null ? { phone: body.phone } : {}),
        ...(typeof body.image === "string" || body.image === null ? { image: body.image } : {}),
        ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    };
    if (!Object.keys(data).length) return NextResponse.json({ message: "Tidak ada perubahan yang valid" }, { status: 400 });
    const user = await prisma.user.update({ where: { id: body.id }, data });
    return NextResponse.json({ user });
}
