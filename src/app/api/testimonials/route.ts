import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");

function clean(value: FormDataEntryValue | null) {
    return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const rating = Number(searchParams.get("rating") || 0);
    const search = (searchParams.get("search") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || 60), 100);
    let query = supabase.from("testimonials").select("*").eq("isActive", true).eq("isVerified", true).order("createdAt", { ascending: false }).limit(limit);
    if (rating >= 1 && rating <= 5) query = query.eq("rating", rating);
    if (search) query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%,message.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ testimonials: data ?? [] });
}

export async function POST(request: NextRequest) {
    const form = await request.formData();
    const name = clean(form.get("name"));
    const city = clean(form.get("city"));
    const whatsapp = clean(form.get("whatsapp")) || null;
    const message = clean(form.get("message"));
    const consent = clean(form.get("consent")) === "true";
    const rating = Number(clean(form.get("rating")) || 0);
    if (!name || !city || !message || rating < 1 || rating > 5 || !consent) return NextResponse.json({ message: "Lengkapi data testimoni dan persetujuan." }, { status: 400 });

    let avatar: string | null = null;
    const file = form.get("avatar");
    if (file instanceof File && file.size > 0) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `testimonials/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("testimonial").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (!error) avatar = supabase.storage.from("testimonial").getPublicUrl(path).data.publicUrl;
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("testimonials").insert({ id: crypto.randomUUID(), name, city, whatsapp, message, rating, avatar, isActive: false, isVerified: false, createdAt: now, updatedAt: now });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ message: "Testimoni berhasil dikirim dan menunggu verifikasi admin." }, { status: 201 });
}