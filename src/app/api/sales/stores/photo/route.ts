import { NextResponse } from "next/server";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { hasSupportedImageSignature, SALES_VISIT_MAX_BYTES, SALES_VISIT_MAX_SOURCE_BYTES } from "@/lib/sales-visit-image";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const current = await getCurrentSalesPerson(); if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Foto wajib diunggah." }, { status: 400 });
  if (file.size > SALES_VISIT_MAX_SOURCE_BYTES || file.size > SALES_VISIT_MAX_BYTES) return NextResponse.json({ message: "Ukuran foto final maksimal 1 MB." }, { status: 413 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !hasSupportedImageSignature(new Uint8Array(await file.arrayBuffer()))) return NextResponse.json({ message: "Format foto tidak valid." }, { status: 415 });
  const path = `sales-visits/stores/${current.sales.id}/${crypto.randomUUID()}.webp`; const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from("sales-visits").upload(path, file, { contentType: "image/webp", upsert: false });
  if (error) return NextResponse.json({ message: "Foto gagal diunggah." }, { status: 503 });
  return NextResponse.json({ path, url: supabase.storage.from("sales-visits").getPublicUrl(path).data.publicUrl });
}

export async function DELETE(request: Request) {
  const current = await getCurrentSalesPerson();
  if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const path = body?.path;
  const escapedSalesId = current.sales.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (typeof path !== "string" || !new RegExp(`^sales-visits/stores/${escapedSalesId}/[a-f0-9-]+\\.webp$`).test(path)) {
    return NextResponse.json({ message: "Foto bukan milik Anda." }, { status: 403 });
  }
  const { error } = await createSupabaseAdminClient().storage.from("sales-visits").remove([path]);
  if (error) {
    console.error("sales_store_photo_cleanup_failed", { name: error instanceof Error ? error.name : "StorageError" });
    return NextResponse.json({ message: "Foto gagal dihapus." }, { status: 503 });
  }
  return NextResponse.json({ deleted: true });
}