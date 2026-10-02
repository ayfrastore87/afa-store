"use client";

export const HANDOVER_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressHandoverImage(source: File): Promise<File> {
    if (!ACCEPTED_IMAGE_TYPES.has(source.type)) throw new Error("Format foto harus JPG, PNG, atau WEBP.");
    const objectUrl = URL.createObjectURL(source);
    try {
        let image: ImageBitmap | HTMLImageElement;
        if (typeof createImageBitmap === "function") {
            image = await createImageBitmap(source, { imageOrientation: "from-image" });
        } else {
            const fallback = new Image(); fallback.src = objectUrl;
            await new Promise<void>((resolve, reject) => { fallback.onload = () => resolve(); fallback.onerror = () => reject(new Error("Foto tidak dapat diproses.")); });
            image = fallback;
        }
        const width = image instanceof ImageBitmap ? image.width : image.naturalWidth;
        const height = image instanceof ImageBitmap ? image.height : image.naturalHeight;
        let maxDimension = 1600;
        const qualities = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34];
        for (let attempt = 0; attempt < 4; attempt += 1) {
            const scale = Math.min(1, maxDimension / Math.max(width, height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Browser tidak mendukung pemrosesan foto.");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            for (const quality of qualities) {
                const blob = await canvasBlob(canvas, quality);
                if (blob && blob.size <= HANDOVER_IMAGE_MAX_BYTES) return new File([blob], "handover.jpg", { type: "image/jpeg", lastModified: Date.now() });
            }
            maxDimension = Math.floor(maxDimension * 0.7);
        }
        if (image instanceof ImageBitmap) image.close();
    } finally { URL.revokeObjectURL(objectUrl); }
    throw new Error("Foto tidak dapat dikompres hingga maksimal 1 MB. Silakan pilih foto lain.");
}