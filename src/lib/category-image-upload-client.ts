export const CATEGORY_IMAGE_SIZE = 600;
export const CATEGORY_IMAGE_MAX_BYTES = 512000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export type CategoryImagePreview = { file: File; previewUrl: string; sourceWidth: number; sourceHeight: number; finalWidth: number; finalHeight: number; finalBytes: number };

function loadImage(file: File): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const image = new Image(); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gambar tidak dapat dibaca.")); }; image.src = url; }); }

export async function optimizeCategoryImage(source: File): Promise<CategoryImagePreview> {
    if (!IMAGE_TYPES.has(source.type)) throw new Error("Format gambar harus JPG, PNG, atau WEBP.");
    if (source.size > 20 * 1024 * 1024) throw new Error("Ukuran gambar sumber maksimal 20 MB.");
    const image = await loadImage(source); const side = Math.min(image.naturalWidth, image.naturalHeight); const canvas = document.createElement("canvas"); canvas.width = CATEGORY_IMAGE_SIZE; canvas.height = CATEGORY_IMAGE_SIZE; const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar.");
    context.imageSmoothingQuality = "high"; context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, CATEGORY_IMAGE_SIZE, CATEGORY_IMAGE_SIZE);
    let blob: Blob | null = null; for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) { blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality)); if (blob && blob.size <= CATEGORY_IMAGE_MAX_BYTES) break; }
    if (!blob || blob.size > CATEGORY_IMAGE_MAX_BYTES) throw new Error("Gambar tidak dapat dikompres di bawah 500 KB. Pilih gambar yang lebih sederhana.");
    const file = new File([blob], `${source.name.replace(/\.[^.]+$/, "") || "kategori"}.webp`, { type: "image/webp" });
    return { file, previewUrl: URL.createObjectURL(file), sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight, finalWidth: CATEGORY_IMAGE_SIZE, finalHeight: CATEGORY_IMAGE_SIZE, finalBytes: file.size };
}

export async function uploadCategoryImage(file: File) { const formData = new FormData(); formData.set("file", file); const response = await fetch("/api/admin/categories/image", { method: "POST", body: formData }); if (!response.ok) throw new Error("Gambar gagal diunggah. Silakan coba lagi."); const result = await response.json() as { url?: unknown }; if (typeof result.url !== "string") throw new Error("Gambar gagal diunggah. Silakan coba lagi."); return result.url; }