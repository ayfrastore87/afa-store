import { z } from "zod";

export const productSchema = z.object({
    name: z.string().trim().min(1),
    slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    categoryId: z.string().trim().min(1).nullable(),
    flavor: z.string().trim().nullable(),
    size: z.string().trim().nullable(),
    price: z.number().int().min(0),
    stock: z.number().int().min(0),
    image: z.string().trim().nullable(),
    badge: z.string().trim().nullable(),
    rating: z.number().min(0).max(5),
    isActive: z.boolean(),
});

export function productPayload(input: unknown) {
    const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
    return productSchema.safeParse({
        name: value.name,
        slug: value.slug,
        categoryId: value.categoryId === "" || value.categoryId === undefined ? null : value.categoryId,
        flavor: value.flavor || null,
        size: value.size || null,
        price: value.price,
        stock: value.stock,
        image: value.image || null,
        badge: value.badge || null,
        rating: value.rating,
        isActive: value.isActive,
    });
}