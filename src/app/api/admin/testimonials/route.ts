import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/auth";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");

async function assertAdmin() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("users").select("role").eq("auth_id", user.id).single();
    return data?.role === "admin";
}

export async function GET() {
    if (!(await assertAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const { data, error } = await supabaseAdmin.from("testimonials").select("*").order("createdAt", { ascending: false });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ testimonials: data ?? [] });
}

export async function PATCH(request: NextRequest) {
    if (!(await assertAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { id, action, ...rest } = body;
    if (!id) return NextResponse.json({ message: "ID wajib diisi" }, { status: 400 });
    const update = action === "approve" ? { isVerified: true } : action === "publish" ? { isActive: true } : action === "unpublish" ? { isActive: false } : rest;
    const { error } = await supabaseAdmin.from("testimonials").update({ ...update, updatedAt: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ message: "Testimoni diperbarui" });
}

export async function DELETE(request: NextRequest) {
    if (!(await assertAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ message: "ID wajib diisi" }, { status: 400 });
    const { error } = await supabaseAdmin.from("testimonials").delete().eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ message: "Testimoni dihapus" });
}