import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const BUCKET = "categories";
const MAX_IMAGE_BYTES = 512000;
const MIME_EXTENSIONS: Readonly<Record<string, string>> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
async function hasImageSignature(file: File) { const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()); if (file.type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255; if (file.type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value); return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"; }

export async function POST(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        return NextResponse.json({ error: user ? "Forbidden" : "Unauthorized" }, { status: user ? 403 : 401 });
    }
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image file too large" }, { status: 413 });
    const extension = MIME_EXTENSIONS[file.type];
    if (!extension) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    if (!(await hasImageSignature(file))) return NextResponse.json({ error: "Invalid image signature" }, { status: 400 });
    const path = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    try {
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return NextResponse.json({ url: data.publicUrl, path });
    } catch (error) {
        console.error("Category image upload failed", { name: error instanceof Error ? error.name : "StorageError" });
        return NextResponse.json({ error: "Image upload failed" }, { status: 502 });
    }
}