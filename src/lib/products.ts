import { supabase } from "@/lib/supabase";

export type Product = {
    id: string;
    name: string;
    category: string;
    price: number;
    stock: number;
    image: string;
    rating: number;
    reviews: number | null;
    badge: string | null;
    flavor?: string | null;
    size?: string | null;
    isActive?: boolean | null;
    slug?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
};

type ProductRow = Record<string, unknown>;

type CategoryRelation = { name?: unknown; slug?: unknown } | { name?: unknown; slug?: unknown }[];

const numberValue = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const stringValue = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value : fallback;

const relationStringValue = (value: unknown, key: "name" | "slug") => {
    const relation = Array.isArray(value) ? value[0] : value;
    return relation && typeof relation === "object" ? stringValue((relation as Record<string, unknown>)[key]) : "";
};

const categoryValue = (row: ProductRow) => {
    return stringValue(
        row.category,
        stringValue(
            row.category_name,
            stringValue(relationStringValue(row.category, "name"), stringValue(relationStringValue(row.categories, "name"), stringValue(row.flavor, "Bawang Goreng")))
        )
    );
};

export const formatRupiah = (price: number) => `Rp ${price.toLocaleString("id-ID")}`;

export function mapProduct(row: ProductRow): Product {
    return {
        id: String(row.id),
        name: stringValue(row.name, "Produk"),
        category: categoryValue(row),
        price: numberValue(row.price),
        stock: numberValue(row.stock),
        image: stringValue(row.image, "/window.svg"),
        rating: numberValue(row.rating, 0),
        reviews: row.reviews === null || row.reviews === undefined ? null : numberValue(row.reviews, 0),
        badge: typeof row.badge === "string" && row.badge.trim() ? row.badge : null,
        flavor: typeof row.flavor === "string" ? row.flavor : null,
        size: typeof row.size === "string" ? row.size : null,
        isActive: typeof row.isActive === "boolean" ? row.isActive : typeof row.is_active === "boolean" ? row.is_active : null,
        slug: typeof row.slug === "string" ? row.slug : null,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : typeof row.created_at === "string" ? row.created_at : null,
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : typeof row.updated_at === "string" ? row.updated_at : null,
    };
}

export async function fetchProducts() {
    const { data, error } = await supabase
        .from("products")
        .select("*, categories(name, slug)")
        .order("createdAt", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapProduct(row as ProductRow & { categories?: CategoryRelation }));
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