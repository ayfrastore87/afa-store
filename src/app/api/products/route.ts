import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
    const { data, error } = await supabase.from("products").select("*").order("createdAt", { ascending: false });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ products: data ?? [] });
}

export async function POST(request: Request) {
    const payload = await request.json().catch(() => ({}));
    const { data, error } = await supabase.from("products").insert(payload).select("*").single();
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ product: data }, { status: 201 });
}