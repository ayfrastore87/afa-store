import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
const schema = z.object({
  name: z.string().trim().min(1).max(150), ownerName: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(30).optional(), address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  photoPath: z.string().max(300).optional(),
}).strict();

export async function POST(request: Request) {
  const current = await getCurrentSalesPerson();
  if (!current) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data toko tidak valid." }, { status: 400 });
  const data = parsed.data;
  const photoPathPattern = new RegExp(`^sales-visits/stores/${current.sales.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-f0-9-]+\\.webp$`);
  if (data.photoPath && !photoPathPattern.test(data.photoPath)) return NextResponse.json({ message: "Foto bukan milik Anda." }, { status: 403 });
  const name = data.name.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const phone = data.phone?.replace(/\D/g, "") || null;
  const candidates = await prisma.consignmentStore.findMany({ where: { assignedSalesId: current.sales.id }, select: { id: true, name: true, phone: true } });
  const duplicate = candidates.find((candidate) => candidate.name.toLocaleLowerCase().replace(/\s+/g, " ").trim() === name || (phone && candidate.phone?.replace(/\D/g, "") === phone));
  if (duplicate) return NextResponse.json({ message: "Toko dengan nama/nomor yang sama mungkin sudah terdaftar." }, { status: 409 });
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}`;
  const photoUrl = data.photoPath ? (await import("@/lib/supabase-admin")).createSupabaseAdminClient().storage.from("sales-visits").getPublicUrl(data.photoPath).data.publicUrl : null;
  try {
    const store = await prisma.consignmentStore.create({ data: { name: data.name, ownerName: data.ownerName || null, phone: data.phone || null, address: data.address || null, notes: data.notes || null, latitude: data.latitude, longitude: data.longitude, mapsUrl, photoUrl, assignedSalesId: current.sales.id }, select: { id: true, name: true, address: true } });
    return NextResponse.json({ store }, { status: 201 });
  } catch (error) {
    if (data.photoPath) {
      const cleanup = await createSupabaseAdminClient().storage.from("sales-visits").remove([data.photoPath]);
      if (cleanup.error) console.error("sales_store_photo_orphan_cleanup_failed", { name: cleanup.error.name });
    }
    console.error("sales_store_registration_failed", { name: error instanceof Error ? error.name : "RegistrationError" });
    return NextResponse.json({ message: "Toko gagal disimpan." }, { status: 500 });
  }
}