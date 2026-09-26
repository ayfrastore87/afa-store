const MAX_IMAGE_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadCategoryImage(file: File) {
    if (!(file instanceof File) || file.size === 0 || !IMAGE_TYPES.has(file.type)) throw new Error("File gambar tidak valid.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Ukuran gambar terlalu besar.");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/admin/categories/image", { method: "POST", body: formData });
    if (!response.ok) throw new Error(response.status === 413 ? "Ukuran gambar terlalu besar." : "Gambar gagal diunggah.");
    const result = await response.json() as { url?: unknown };
    if (typeof result.url !== "string") throw new Error("Gambar gagal diunggah.");
    return result.url;
}