export type Product = {
    id: string;
    name: string;
    slug: string;
    categoryId: string | null;
    category: string | null;
    flavor: string | null;
    size: string | null;
    price: number;
    stock: number;
    image: string;
    badge: string | null;
    rating: number;
    isActive: boolean;
    createdAt: string;
};

type ProductRow = Record<string, unknown>;

type ProductsApiResponse = {
    success: boolean;
    data?: ProductRow[];
    error?: string;
};

const numberValue = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const stringValue = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value : fallback;

const categoryValue = (row: ProductRow) => {
    return stringValue(row.category, stringValue(row.category_name, "Tanpa Kategori"));
};

export const formatRupiah = (price: number) => `Rp ${price.toLocaleString("id-ID")}`;

export function mapProduct(row: ProductRow): Product {
    const category = categoryValue(row);
    return {
        id: String(row.id),
        name: stringValue(row.name, "Produk"),
        slug: stringValue(row.slug, String(row.id)),
        categoryId: typeof row.categoryId === "string" ? row.categoryId : null,
        category,
        price: numberValue(row.price),
        stock: numberValue(row.stock),
        image: stringValue(row.image, "/products/parcel.png"),
        rating: numberValue(row.rating, 0),
        badge: typeof row.badge === "string" && row.badge.trim() ? row.badge : null,
        flavor: typeof row.flavor === "string" ? row.flavor : null,
        size: typeof row.size === "string" ? row.size : null,
        isActive: typeof row.isActive === "boolean" ? row.isActive : false,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : typeof row.created_at === "string" ? row.created_at : "",
    };
}

export async function fetchProducts() {
    try {
        const response = await fetch("/api/products", {
            headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => null) as ProductsApiResponse | null;

        if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
            throw new Error("Produk belum dapat dimuat. Silakan coba lagi.");
        }

        return payload.data.map(mapProduct);
    } catch (error) {
        if (error instanceof Error && error.message === "Produk belum dapat dimuat. Silakan coba lagi.") {
            throw error;
        }
        throw new Error("Produk belum dapat dimuat. Silakan coba lagi.");
    }
}

export const productSizes = ["35g", "100g", "250g", "500g", "1 Kg"];

export const testimonials = [
    ["Siti Aisyah", "Cilegon", "Bawang gorengnya benar-benar gurih dan renyah, bikin nagih!"],
    ["Andi Setiawan", "Serang", "Parcelnya cantik dan elegan, cocok untuk hadiah keluarga."],
    ["Dewi Sartika", "Pandeglang", "Pengiriman cepat, produk aman sampai tujuan."],
    ["Rina Marlina", "Jakarta", "Customer service sangat ramah dan responsif."],
    ["Budi Prakoso", "Bandung", "Tanpa tepung, rasa bawangnya asli dan wangi."],
    ["Maya Putri", "Tangerang", "Custom parcel corporate kami terlihat premium."],
    ["Hendra Wijaya", "Bekasi", "Repeat order untuk acara kantor, semua suka."],
    ["Nadia Rahma", "Depok", "Packaging aman, rasa pedasnya pas."],
];