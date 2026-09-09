import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET() {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const { data, error } = await createSupabaseAdminClient().from("testimonials").select("*").order("createdAt", { ascending: false });
    if (error) return NextResponse.json({ message: "Testimoni belum dapat dimuat." }, { status: 500 });
    return NextResponse.json({ testimonials: data ?? [] });
}

export async function PATCH(request: NextRequest) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const { id, action } = body;
    if (!id) return NextResponse.json({ message: "ID wajib diisi" }, { status: 400 });
    const update = action === "approve" ? { isVerified: true } : action === "publish" ? { isActive: true } : action === "unpublish" ? { isActive: false } : null;
    if (!update) return NextResponse.json({ message: "Aksi tidak valid" }, { status: 400 });
    const { error } = await createSupabaseAdminClient().from("testimonials").update({ ...update, updatedAt: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ message: "Testimoni belum dapat diperbarui." }, { status: 500 });
    return NextResponse.json({ message: "Testimoni diperbarui" });
}

export async function DELETE(request: NextRequest) {
    if (!(await getCurrentAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ message: "ID wajib diisi" }, { status: 400 });
    const { error } = await createSupabaseAdminClient().from("testimonials").delete().eq("id", id);
    if (error) return NextResponse.json({ message: "Testimoni belum dapat dihapus." }, { status: 500 });
    return NextResponse.json({ message: "Testimoni dihapus" });
}