export const MAX_PRODUCT_IMAGE_BYTES = 1024 * 1024;
export const MAX_PRODUCT_SOURCE_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type OptimizedProductImage = { file: File; width: number; height: number };

function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
    return "createImageBitmap" in window
        ? createImageBitmap(file, { imageOrientation: "from-image" })
        : new Promise<HTMLImageElement>((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gambar tidak dapat dibaca.")); };
            image.src = url;
        });
}

export async function optimizeProductImage(source: File): Promise<OptimizedProductImage> {
    if (!(source instanceof File) || source.size === 0 || !IMAGE_TYPES.has(source.type)) throw new Error("Format gambar harus JPG, PNG, atau WEBP.");
    if (source.size > MAX_PRODUCT_SOURCE_BYTES) throw new Error("Foto terlalu besar. Maksimal file sumber 15 MB.");
    const image = await loadImage(source);
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    let scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    let result: Blob | null = null;
    let width = sourceWidth;
    let height = sourceHeight;
    for (let pass = 0; pass < 12; pass++) {
        width = Math.max(1, Math.round(sourceWidth * scale));
        height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d"); if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar.");
        context.imageSmoothingQuality = "high"; context.drawImage(image, 0, 0, width, height);
        const quality = [0.85, 0.78, 0.7, 0.62, 0.55, 0.48][Math.min(pass, 5)];
        result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (result && result.size <= MAX_PRODUCT_IMAGE_BYTES) break;
        if (pass >= 5) scale *= 0.82;
    }
    if ("close" in image && typeof image.close === "function") image.close();
    if (!result || result.size > MAX_PRODUCT_IMAGE_BYTES) throw new Error("Foto belum dapat dioptimalkan hingga 1 MB. Silakan gunakan foto lain.");
    const base = source.name.replace(/\.[^.]+$/, "") || "produk";
    return { file: new File([result], `${base}.webp`, { type: "image/webp" }), width, height };
}

export async function uploadProductImage(file: File) {
    if (!(file instanceof File) || file.size === 0 || !IMAGE_TYPES.has(file.type)) throw new Error("File gambar tidak valid.");
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) throw new Error("Foto belum dioptimalkan hingga 1 MB.");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/admin/products/image", { method: "POST", body: formData });
    if (!response.ok) {
        const messages: Record<number, string> = {
            400: "File gambar tidak valid.",
            401: "Silakan login sebagai admin.",
            403: "Anda tidak memiliki izin mengunggah gambar produk.",
            413: "Foto belum dapat dioptimalkan hingga 1 MB. Silakan gunakan foto lain.",
            500: "Gambar gagal diunggah. Silakan coba lagi.",
        };
        throw new Error(messages[response.status] ?? messages[500]);
    }
    const result = await response.json() as { url?: unknown; path?: unknown };
    if (typeof result.url !== "string" || typeof result.path !== "string") throw new Error("Gambar gagal diunggah. Silakan coba lagi.");
    return { url: result.url, path: result.path };
}