import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
const createSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().transform((v) => v.toLowerCase()), password: z.string().min(8).max(128), phone: z.string().trim().max(30).optional() });

export async function GET() {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const accounts = await prisma.user.findMany({ where: { role: "cashier" }, select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data akun tidak valid." }, { status: 400 });
    const { name, email, password, phone } = parsed.data;
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return NextResponse.json({ message: "Email sudah terdaftar." }, { status: 409 });
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (error || !data.user) return NextResponse.json({ message: "Akun Auth gagal dibuat." }, { status: 400 });
    try {
        const id = crypto.randomUUID();
        await prisma.$executeRaw`INSERT INTO public.users (id, auth_id, name, email, phone, role, "isActive", "createdAt", "updatedAt") VALUES (${id}, ${data.user.id}, ${name}, ${email}, ${phone || null}, ${"cashier"}, ${true}, NOW(), NOW())`;
        const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true } });
        return NextResponse.json({ account: user }, { status: 201 });
    } catch (error) {
        await supabase.auth.admin.deleteUser(data.user.id);
        if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") return NextResponse.json({ message: "Email atau nomor WhatsApp sudah terdaftar." }, { status: 409 });
        return NextResponse.json({ message: "Mapping akun gagal dibuat." }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const body = await request.json().catch(() => null) as { id?: unknown; isActive?: unknown } | null;
    if (typeof body?.id !== "string" || typeof body.isActive !== "boolean") return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    const account = await prisma.user.update({ where: { id: body.id, role: "cashier" }, data: { isActive: body.isActive }, select: { id: true, name: true, email: true, isActive: true } });
    return NextResponse.json({ account });
}