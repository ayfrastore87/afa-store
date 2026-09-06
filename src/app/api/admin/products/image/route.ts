import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const BUCKET = "products";
const MAX_IMAGE_BYTES = 1024 * 1024;
const MIME_EXTENSIONS: Readonly<Record<string, string>> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(request: Request) {
    const user = await getCurrentAdmin();
    if (!user) {
        // getCurrentAdmin intentionally combines authentication and authorization.
        // Preserve the public API distinction without exposing internal auth details.
        const supabase = await createSupabaseServerClient();
        const { data: { user: authenticated } } = await supabase.auth.getUser();
        return NextResponse.json({ error: authenticated ? "Forbidden" : "Unauthorized" }, { status: authenticated ? 403 : 401 });
    }

    let formData: FormData;
    try { formData = await request.formData(); }
    catch { return NextResponse.json({ error: "Invalid image file" }, { status: 400 }); }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image file too large" }, { status: 413 });
    const extension = MIME_EXTENSIONS[file.type];
    if (!extension) return NextResponse.json({ error: "Invalid image file" }, { status: 400 });

    const path = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    try {
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return NextResponse.json({ url: data.publicUrl, path });
    } catch (error) {
        console.error("Product image upload failed", error instanceof Error ? error.name : "UnknownError");
        return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
    }
}