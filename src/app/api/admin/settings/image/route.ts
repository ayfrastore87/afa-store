import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const BUCKET = "settings";
const MAX_IMAGE_BYTES = 1_048_576;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type SettingsImageType = "logo" | "favicon" | "banner" | "footer-logo";
const VALID_IMAGE_TYPES: ReadonlyArray<string> = ["logo", "favicon", "banner", "footer-logo"];

async function hasImageSignature(file: File): Promise<boolean> {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (file.type === "image/png") {
        return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
    }
    const riff = String.fromCharCode(...Array.from(bytes.slice(0, 4)));
    const webp = String.fromCharCode(...Array.from(bytes.slice(8, 12)));
    return riff === "RIFF" && webp === "WEBP";
}

function categorizeStorageError(error: unknown): { status: number; message: string } {
    const e = error as { name?: unknown; message?: unknown; statusCode?: unknown; status?: unknown } | null;
    const name = typeof e?.name === "string" ? e.name : "";
    const msg = typeof e?.message === "string" ? e.message : "";
    const code =
        typeof e?.statusCode === "number" ? e.statusCode :
        typeof e?.status === "number" ? e.status : 0;
    const lower = `${name} ${msg}`.toLowerCase();
    if (code === 404 || (lower.includes("bucket") && (lower.includes("not found") || lower.includes("does not exist")))) {
        return { status: 503, message: "Konfigurasi Storage belum tersedia." };
    }
    if (code === 401 || code === 403 || lower.includes("permission") || lower.includes("unauthorized") || lower.includes("forbidden")) {
        return { status: 502, message: "Izin Storage tidak mencukupi." };
    }
    return { status: 502, message: "Upload gagal. Silakan coba lagi." };
}

export async function POST(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        return NextResponse.json(
            { error: user ? "Forbidden" : "Unauthorized" },
            { status: user ? 403 : 401 }
        );
    }
    let formData: FormData;
    try { formData = await request.formData(); }
    catch {
        return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    const file = formData.get("file");
    const imageTypeRaw = formData.get("imageType");
    if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "File gambar tidak valid." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Gambar terlalu besar setelah optimasi. Maksimal 1 MB." }, { status: 413 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Format gambar tidak didukung." }, { status: 400 });
    }
    const imageType =
        typeof imageTypeRaw === "string" && VALID_IMAGE_TYPES.includes(imageTypeRaw)
            ? (imageTypeRaw as SettingsImageType)
            : null;
    if (!imageType) {
        return NextResponse.json({ error: "Jenis gambar tidak valid." }, { status: 400 });
    }
    const signatureValid = await hasImageSignature(file);
    if (!signatureValid) {
        return NextResponse.json({ error: "Format gambar tidak didukung." }, { status: 400 });
    }
    const path = `settings/${imageType}/${Date.now()}-${crypto.randomUUID()}.webp`;
    try {
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
            contentType: file.type,
            upsert: false,
        });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return NextResponse.json({ url: data.publicUrl, path });
    } catch (error) {
        console.error("[settings-image-upload]", {
            imageType,
            size: file.size,
            errorName: error instanceof Error ? error.name : "unknown",
        });
        const { status, message } = categorizeStorageError(error);
        return NextResponse.json({ error: message }, { status });
    }
}

export async function DELETE(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        return NextResponse.json(
            { error: user ? "Forbidden" : "Unauthorized" },
            { status: user ? 403 : 401 }
        );
    }
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
    const path =
        typeof body === "object" && body !== null && "path" in body
            ? (body as { path: unknown }).path
            : undefined;
    if (typeof path !== "string") {
        return NextResponse.json({ error: "Path tidak valid." }, { status: 400 });
    }
    if (!path.startsWith("settings/")) {
        return NextResponse.json({ error: "Path tidak valid." }, { status: 400 });
    }
    if (!/^settings\/(logo|favicon|banner|footer-logo)\/[a-zA-Z0-9_.-]+\.webp$/.test(path)) {
        return NextResponse.json({ error: "Path tidak valid." }, { status: 400 });
    }
    try {
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase.storage.from(BUCKET).remove([path]);
        if (error) throw error;
        return NextResponse.json({ deleted: true });
    } catch (error) {
        console.error("[settings-image-delete]", {
            path,
            errorName: error instanceof Error ? error.name : "unknown",
        });
        return NextResponse.json({ deleted: false, note: "Cleanup skipped" });
    }
}
