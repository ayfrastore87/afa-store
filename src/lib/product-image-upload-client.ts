const MAX_IMAGE_BYTES = 1024 * 1024;

export async function uploadProductImage(file: File) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Ukuran gambar terlalu besar.");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/admin/products/image", { method: "POST", body: formData });
    if (!response.ok) {
        const messages: Record<number, string> = {
            400: "File gambar tidak valid.",
            401: "Silakan login sebagai admin.",
            403: "Anda tidak memiliki izin mengunggah gambar produk.",
            413: "Ukuran gambar terlalu besar.",
            500: "Gambar gagal diunggah. Silakan coba lagi.",
        };
        throw new Error(messages[response.status] ?? messages[500]);
    }
    const result = await response.json() as { url?: unknown; path?: unknown };
    if (typeof result.url !== "string" || typeof result.path !== "string") throw new Error("Gambar gagal diunggah. Silakan coba lagi.");
    return { url: result.url, path: result.path };
}