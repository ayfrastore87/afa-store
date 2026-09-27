export const SALES_VISIT_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const SALES_VISIT_MAX_BYTES = 1024 * 1024;
export const SALES_VISIT_MAX_EDGE = 1600;

export function hasSupportedImageSignature(bytes: Uint8Array): boolean {
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v);
    const webp = bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    return jpeg || png || webp;
}

export function nextImageAttempt(width: number, height: number, quality: number, attempt: number) {
    if (attempt >= 10) return null;
    if (quality > 0.55) return { width, height, quality: Math.max(0.55, quality - 0.1) };
    const scale = 0.82;
    return { width: Math.max(320, Math.round(width * scale)), height: Math.max(320, Math.round(height * scale)), quality: 0.78 };
}

export async function optimizeSalesVisitImage(file: File): Promise<{ file: File; width: number; height: number }> {
    if (!file.type.startsWith("image/") || file.size > SALES_VISIT_MAX_SOURCE_BYTES) throw new Error("Foto harus JPEG, PNG, atau WebP dan maksimal 20 MB.");
    const bitmap = await createImageBitmap(file);
    try {
        const scale = Math.min(1, SALES_VISIT_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
        let width = Math.max(1, Math.round(bitmap.width * scale));
        let height = Math.max(1, Math.round(bitmap.height * scale));
        let quality = 0.85;
        for (let attempt = 0; attempt < 10; attempt++) {
            const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Browser tidak dapat memproses foto.");
            ctx.drawImage(bitmap, 0, 0, width, height);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
            if (!blob) throw new Error("Foto gagal dikonversi ke WebP.");
            if (blob.size <= SALES_VISIT_MAX_BYTES) return { file: new File([blob], `visit-${Date.now()}.webp`, { type: "image/webp" }), width, height };
            const next = nextImageAttempt(width, height, quality, attempt); if (!next) break;
            width = next.width; height = next.height; quality = next.quality;
        }
        throw new Error("Foto tidak dapat diperkecil sampai maksimal 1 MB.");
    } finally { bitmap.close(); }
}