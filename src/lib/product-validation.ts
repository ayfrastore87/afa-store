import { z } from "zod";
import { MAX_PRODUCT_WEIGHT_GRAMS, MIN_PRODUCT_WEIGHT_GRAMS } from "@/lib/shipping-weight";

export const PRODUCT_DESCRIPTION_MAX_LENGTH = 1000;

export const PRODUCT_DEFAULT_WEIGHT_GRAMS = 1000;

const optionalText = (max: number) =>
    z
        .string()
        .trim()
        .max(max)
        .nullable()
        .optional()
        .transform((value) => (value && value.length > 0 ? value : null));

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
    description: optionalText(PRODUCT_DESCRIPTION_MAX_LENGTH),
    rating: z.number().min(0).max(5),
    weight: z.number().int().min(MIN_PRODUCT_WEIGHT_GRAMS).max(MAX_PRODUCT_WEIGHT_GRAMS),
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
        description: value.description ?? null,
        rating: value.rating,
        weight: value.weight ?? PRODUCT_DEFAULT_WEIGHT_GRAMS,
        isActive: value.isActive,
    });
}