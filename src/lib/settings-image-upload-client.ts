// Settings image upload client — browser-only (used only in "use client" components)
// Optimizes images via Canvas API and uploads to the admin settings image endpoint.
// No service-role key; no Supabase admin client — server handles those.

const MAX_BYTES = 1_048_576; // 1 MiB hard limit
const MAX_SOURCE_BYTES = 20 * 1024 * 1024; // 20 MB source file limit
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type SettingsImageProfile = "logo" | "favicon" | "banner" | "footer-logo";

const PROFILE_DIMS: Record<SettingsImageProfile, { maxW: number; maxH: number; square?: boolean }> = {
    "logo":         { maxW: 1200, maxH: 1200 },
    "favicon":      { maxW: 512,  maxH: 512, square: true },
    "banner":       { maxW: 1920, maxH: 1080 },
    "footer-logo":  { maxW: 1200, maxH: 1200 },
};

// Bounded quality steps — at most 8 attempts (no infinite loop)
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15] as const;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gambar tidak dapat dibaca.")); };
        img.src = url;
    });
}

function calcDimensions(
    srcW: number, srcH: number, maxW: number, maxH: number, square?: boolean
): { w: number; h: number } {
    if (square) {
        const side = Math.min(srcW, srcH, maxW, maxH);
        return { w: Math.max(1, side), h: Math.max(1, side) };
    }
    let w = srcW, h = srcH;
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
    return { w: Math.max(1, w), h: Math.max(1, h) };
}

export async function optimizeSettingsImage(
    source: File,
    profile: SettingsImageProfile
): Promise<{ blob: Blob; previewUrl: string; width: number; height: number }> {
    if (!ALLOWED_TYPES.has(source.type)) {
        throw new Error("Format gambar harus JPG, PNG, atau WEBP.");
    }
    if (source.size > MAX_SOURCE_BYTES) {
        throw new Error("Ukuran gambar sumber maksimal 20 MB.");
    }
    const img = await loadImage(source);
    const dims = PROFILE_DIMS[profile];
    const { w, h } = calcDimensions(img.naturalWidth, img.naturalHeight, dims.maxW, dims.maxH, dims.square);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung pemrosesan gambar.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (dims.square) {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, w, h);
    } else {
        ctx.drawImage(img, 0, 0, w, h);
    }
    const supportsWebP = canvas.toDataURL("image/webp").startsWith("data:image/webp");
    const outputType = supportsWebP ? "image/webp" : "image/jpeg";
    let blob: Blob | null = null;
    for (let i = 0; i < QUALITY_STEPS.length; i++) {
        blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, outputType, QUALITY_STEPS[i]));
        if (blob && blob.size <= MAX_BYTES) break;
        blob = null;
    }
    if (!blob || blob.size > MAX_BYTES) {
        throw new Error("Gambar terlalu besar setelah optimasi. Pilih gambar yang lebih sederhana.");
    }
    const previewUrl = URL.createObjectURL(blob);
    return { blob, previewUrl, width: w, height: h };
}

export async function uploadSettingsImage(
    blob: Blob,
    profile: SettingsImageProfile
): Promise<{ url: string; path: string }> {
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
    const file = new File([blob], `settings-${profile}.${ext}`, { type: blob.type });
    const formData = new FormData();
    formData.set("file", file);
    formData.set("imageType", profile);
    const response = await fetch("/api/admin/settings/image", {
        method: "POST",
        body: formData,
    });
    if (!response.ok) {
        let msg = "Upload gagal. Silakan coba lagi.";
        try {
            const data = await response.json() as { error?: string };
            if (typeof data.error === "string" && data.error) msg = data.error;
        } catch { /* ignore */ }
        throw new Error(msg);
    }
    const result = await response.json() as { url?: unknown; path?: unknown };
    if (typeof result.url !== "string" || typeof result.path !== "string") {
        throw new Error("Upload gagal. Silakan coba lagi.");
    }
    return { url: result.url, path: result.path };
}

/** Extracts the storage path from a Supabase settings image public URL.
 *  Returns null if the URL is not from the settings bucket. */
export function extractSettingsStoragePath(url: string): string | null {
    try {
        const parsed = new URL(url);
        const match = /\/storage\/v1\/object\/public\/(settings\/.+)$/.exec(parsed.pathname);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
}
