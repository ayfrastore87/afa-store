import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const BUCKET = "products";
const MAX_IMAGE_BYTES = 1024 * 1024;
const MIME_EXTENSIONS: Readonly<Record<string, string>> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function storageFailure(error: unknown) {
    const value = error as { name?: unknown; message?: unknown; statusCode?: unknown; status?: unknown } | null;
    const name = typeof value?.name === "string" ? value.name : "UnknownError";
    const message = typeof value?.message === "string" ? value.message : "Unknown storage error";
    const status = typeof value?.statusCode === "number" ? value.statusCode : typeof value?.status === "number" ? value.status : undefined;
    const lower = `${name} ${message}`.toLowerCase();
    const bucketMissing = status === 404 || lower.includes("bucket") && (lower.includes("not found") || lower.includes("does not exist"));
    const tooLarge = status === 413 || lower.includes("too large") || lower.includes("payload");
    const permission = status === 401 || status === 403 || lower.includes("permission") || lower.includes("unauthorized") || lower.includes("forbidden");
    const category = bucketMissing ? "bucket_not_found" : tooLarge ? "file_too_large" : permission ? "storage_permission" : "storage_api";
    console.error("Product image storage failure", { category, name, status, message });
    return category;
}

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
    catch (error) { console.error("Product image formData parse failed", { name: error instanceof Error ? error.name : "UnknownError" }); return NextResponse.json({ error: "Invalid image form" }, { status: 400 }); }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) { console.warn("Product image rejected", { reason: "missing_or_empty_file" }); return NextResponse.json({ error: "Invalid image file" }, { status: 400 }); }
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image file too large" }, { status: 413 });
    const extension = MIME_EXTENSIONS[file.type];
    if (!extension) { console.warn("Product image rejected", { reason: "unsupported_mime", mimeType: file.type }); return NextResponse.json({ error: "Unsupported image type" }, { status: 400 }); }

    const path = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    try {
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return NextResponse.json({ url: data.publicUrl, path });
    } catch (error) {
        const category = storageFailure(error);
        const response = category === "file_too_large" ? "Image file too large" : category === "bucket_not_found" ? "Image storage is unavailable" : category === "storage_permission" ? "Image storage permission denied" : "Image upload failed";
        const status = category === "file_too_large" ? 413 : category === "storage_permission" ? 502 : category === "bucket_not_found" ? 503 : 502;
        return NextResponse.json({ error: response }, { status });
    }
}