import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Product } from "@/lib/products";
import { CATALOG_PAGE_SIZE, type CatalogSort, parseCatalogQuery } from "@/lib/catalog";
import CatalogExperience, { type CatalogCategory } from "@/components/catalog/catalog-experience";

// The catalog reads live filters/sort/pagination from the URL and queries the
// database on every request, so it must never be statically cached.
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Katalog Produk | AFA STORE",
    description: "Jelajahi seluruh produk AFA STORE: bawang goreng premium, parcel, dan hampers. Filter, urutkan, dan cari produk favorit Anda.",
};

const orderByMap: Record<CatalogSort, Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[]> = {
    recommended: [{ rating: "desc" }, { createdAt: "desc" }],
    newest: { createdAt: "desc" },
    rating: [{ rating: "desc" }, { createdAt: "desc" }],
    price_asc: { price: "asc" },
    price_desc: { price: "desc" },
};

function buildWhere(query: ReturnType<typeof parseCatalogQuery>): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (query.category) where.category = { slug: query.category };
    if (query.inStock) where.stock = { gt: 0 };
    if (query.minRating != null) where.rating = { gte: query.minRating };

    if (query.minPrice != null || query.maxPrice != null) {
        where.price = {
            ...(query.minPrice != null ? { gte: query.minPrice } : {}),
            ...(query.maxPrice != null ? { lte: query.maxPrice } : {}),
        };
    }

    if (query.search) {
        where.OR = [
            { name: { contains: query.search, mode: "insensitive" } },
            { flavor: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
        ];
    }

    return where;
}

export default async function CatalogPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const query = parseCatalogQuery(await searchParams);
    const where = buildWhere(query);
    const orderBy = orderByMap[query.sort];

    // Categories own their visual independently from Product images.
    const [categoryRows, activeForCategories] = await Promise.all([
        prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, imageUrl: true } }),
        prisma.product.findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            select: { categoryId: true, image: true },
        }),
    ]);

    const countByCategory = new Map<string, number>();
    for (const product of activeForCategories) {
        if (!product.categoryId) continue;
        countByCategory.set(product.categoryId, (countByCategory.get(product.categoryId) ?? 0) + 1);
    }

    const categories: CatalogCategory[] = categoryRows
        .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            count: countByCategory.get(category.id) ?? 0,
            image: category.imageUrl,
        }))

    const totalActive = activeForCategories.length;

    // Server-side pagination: count first so we can clamp the requested page,
    // then fetch only the current window with skip/take.
    const total = await prisma.product.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
    const currentPage = Math.min(Math.max(query.page, 1), totalPages);

    const rows = await prisma.product.findMany({
        where,
        orderBy,
        skip: (currentPage - 1) * CATALOG_PAGE_SIZE,
        take: CATALOG_PAGE_SIZE,
        include: { category: true },
    });

    const products: Product[] = rows.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        categoryId: product.categoryId,
        category: product.category?.name ?? "Tanpa Kategori",
        flavor: product.flavor,
        size: product.size,
        price: product.price,
        stock: product.stock,
        image: product.image || "/products/parcel.png",
        badge: product.badge,
        rating: product.rating,
        isActive: product.isActive,
        createdAt: product.createdAt.toISOString(),
    }));

    return (
        <CatalogExperience
            products={products}
            categories={categories}
            totalActive={totalActive}
            query={query}
            total={total}
            totalPages={totalPages}
            currentPage={currentPage}
        />
    );
}
