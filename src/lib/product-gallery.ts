export const MAX_PRODUCT_IMAGES = 7;

export type ProductImageLike = { url: string; sortOrder: number; isPrimary: boolean };

/** Resolve gallery rows without requiring a backfill of legacy Product.image. */
export function resolveProductImages(productImage: string | null | undefined, rows: ProductImageLike[] = []) {
    const unique = new Map<string, ProductImageLike>();
    for (const row of [...rows].sort((a, b) => a.sortOrder - b.sortOrder)) {
        const url = row.url.trim();
        if (url && !unique.has(url)) unique.set(url, { ...row, url });
    }
    if (!unique.size && productImage?.trim()) unique.set(productImage.trim(), { url: productImage.trim(), sortOrder: 0, isPrimary: true });
    const images = [...unique.values()].slice(0, MAX_PRODUCT_IMAGES);
    const primary = images.find((image) => image.isPrimary) ?? images.find((image) => image.url === productImage?.trim()) ?? images[0];
    return images.map((image, index) => ({ ...image, sortOrder: index, isPrimary: image.url === primary?.url }));
}