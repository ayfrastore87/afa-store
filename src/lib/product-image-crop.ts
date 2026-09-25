export const PRODUCT_IMAGE_ASPECT = 1;
export const PRODUCT_IMAGE_MAX_EDGE = 1200;
export const PRODUCT_IMAGE_TYPE = "image/webp";
export const PRODUCT_IMAGE_QUALITY = 0.9;

export type NormalizedCrop = { x: number; y: number; size: number };

export function getSquareCropRect(width: number, height: number, crop: NormalizedCrop = { x: 0, y: 0, size: 1 }) {
    const side = Math.min(width, height) * Math.max(0, Math.min(1, crop.size));
    const maxX = width - side;
    const maxY = height - side;
    const defaultX = (width - side) / 2;
    const defaultY = (height - side) / 2;
    return {
        x: Math.round(Math.max(0, Math.min(maxX, crop.size >= 1 ? defaultX : crop.x * width))),
        y: Math.round(Math.max(0, Math.min(maxY, crop.size >= 1 ? defaultY : crop.y * height))),
        width: Math.round(side),
        height: Math.round(side),
    };
}

export function getCropOutputSize(width: number, height: number) {
    const sourceSide = Math.min(width, height);
    const edge = Math.min(PRODUCT_IMAGE_MAX_EDGE, sourceSide);
    return { width: Math.max(1, Math.round(edge)), height: Math.max(1, Math.round(edge)) };
}

export function getCropFileName(name: string) {
    return `${name.replace(/\.[^.]+$/, "") || "produk"}.webp`;
}
