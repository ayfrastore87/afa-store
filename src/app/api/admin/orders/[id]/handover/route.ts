import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCashier } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const MAX_FILE_SIZE = 1 * 1024 * 1024;
const BUCKET = "products";
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
async function signature(file: File) { const b = new Uint8Array(await file.slice(0, 12).arrayBuffer()); return file.type === "image/jpeg" ? b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255 : file.type === "image/png" ? b.length >= 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10 : b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"; }
function safeError(error: unknown) { const value = error as { name?: unknown; message?: unknown; status?: unknown; statusCode?: unknown } | null; return { name: typeof value?.name === "string" ? value.name : "UnknownError", message: typeof value?.message === "string" ? value.message : "Unknown error", status: typeof value?.statusCode === "number" ? value.statusCode : typeof value?.status === "number" ? value.status : undefined }; }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let uploadedPath: string | null = null; let storage: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
  if (!(await getCurrentCashier())) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const { id } = await params; const order = await prisma.order.findUnique({ where: { id }, select: { id: true, status: true, biteshipOrderId: true, handoverPhotoUrl: true, handedOverAt: true } });
  if (!order) return NextResponse.json({ success: false, error: "Pesanan tidak ditemukan." }, { status: 404 });
  if (order.handoverPhotoUrl && order.handedOverAt) return NextResponse.json({ success: true, order, idempotent: true });
  if (["COMPLETED", "CANCELLED", "CANCELED"].includes(order.status.toUpperCase())) return NextResponse.json({ success: false, error: "Status pesanan tidak dapat diubah." }, { status: 409 });
  let form: FormData; try { form = await request.formData(); } catch (error) { console.error("Handover formData parse failed", safeError(error)); return NextResponse.json({ success: false, error: "Form foto tidak valid." }, { status: 400 }); } const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ success: false, error: "Foto wajib diunggah." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ success: false, error: "Ukuran foto hasil kompresi maksimal 1 MB." }, { status: 413 });
  if (!TYPES[file.type] || !(await signature(file))) return NextResponse.json({ success: false, error: "Format foto harus JPG, PNG, atau WEBP." }, { status: 400 });
  if (!order.biteshipOrderId || order.biteshipOrderId.startsWith("claim:")) return NextResponse.json({ success: false, error: "Shipment Biteship belum dibuat." }, { status: 409 });
  const path = `handover/${crypto.randomUUID()}.${TYPES[file.type]}`; uploadedPath = path; storage = createSupabaseAdminClient();
  const upload = await storage.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) { console.error("Handover storage upload failed", { bucket: BUCKET, path, ...safeError(upload.error) }); return NextResponse.json({ success: false, error: "Foto gagal disimpan." }, { status: 502 }); }
  const { data } = storage.storage.from(BUCKET).getPublicUrl(path); const now = new Date();
  const updated = await prisma.order.updateMany({ where: { id, handoverPhotoUrl: null, handedOverAt: null, status: { notIn: ["COMPLETED", "CANCELLED", "CANCELED"] } }, data: { handoverPhotoUrl: data.publicUrl, handedOverAt: now, status: "SHIPPED", shippedAt: now } });
  const result = await prisma.order.findUnique({ where: { id }, select: { status: true, handoverPhotoUrl: true, handedOverAt: true } });
  return NextResponse.json({ success: true, order: result, idempotent: updated.count === 0 });
  } catch (error) {
    console.error("Handover request failed", { ...safeError(error), bucket: storage ? BUCKET : undefined, uploaded: Boolean(uploadedPath) });
    if (storage && uploadedPath) { try { await storage.storage.from(BUCKET).remove([uploadedPath]); } catch (cleanupError) { console.error("Handover storage cleanup failed", { bucket: BUCKET, path: uploadedPath, ...safeError(cleanupError) }); } }
    return NextResponse.json({ success: false, error: "Gagal menyimpan bukti penyerahan. Silakan coba lagi." }, { status: 500 });
  }
}