import { NextResponse } from "next/server";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { hasSupportedImageSignature, SALES_VISIT_MAX_BYTES, SALES_VISIT_MAX_SOURCE_BYTES } from "@/lib/sales-visit-image";

export const runtime = "nodejs";
const BUCKET = "sales-visits";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ message: "Foto wajib diunggah." }, { status: 400 });
    if (file.size > SALES_VISIT_MAX_SOURCE_BYTES || file.size > SALES_VISIT_MAX_BYTES) return NextResponse.json({ message: "Ukuran foto final maksimal 1 MB." }, { status: 413 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ message: "Format foto harus JPEG, PNG, atau WebP." }, { status: 415 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasSupportedImageSignature(bytes)) return NextResponse.json({ message: "Isi file foto tidak cocok dengan formatnya." }, { status: 415 });
    const path = `sales-visits/${current.sales.id}/${crypto.randomUUID()}.webp`;
    try {
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return NextResponse.json({ url: data.publicUrl, path, size: file.size, contentType: file.type });
    } catch (error) {
        console.error("sales_visit_photo_upload_failed", { category: "storage", name: error instanceof Error ? error.name : "UnknownError" });
        return NextResponse.json({ message: "Foto gagal diunggah. Periksa konfigurasi penyimpanan." }, { status: 503 });
    }
}

export async function DELETE(request: Request) {
    const current = await getCurrentSalesPerson();
    if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const body = await request.json().catch(() => null);
    const path = body?.path;
    if (typeof path !== "string" || !new RegExp(`^sales-visits/${current.sales.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-f0-9-]+\\.webp$`).test(path)) {
        return NextResponse.json({ message: "Foto bukan milik Anda." }, { status: 403 });
    }
    const { prisma } = await import("@/lib/prisma");
    const { data } = createSupabaseAdminClient().storage.from(BUCKET).getPublicUrl(path);
    const completed = await prisma.salesVisit.findFirst({ where: { photoUrl: data.publicUrl }, select: { id: true } });
    if (completed) return NextResponse.json({ message: "Foto kunjungan tersimpan tidak dapat dihapus." }, { status: 409 });
    const { error } = await createSupabaseAdminClient().storage.from(BUCKET).remove([path]);
    if (error) return NextResponse.json({ message: "Foto gagal dihapus." }, { status: 503 });
    return NextResponse.json({ deleted: true });
}