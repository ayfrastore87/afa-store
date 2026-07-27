import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const { data, error } = await supabase.from("products").update(payload).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ product: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
}