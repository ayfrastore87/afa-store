import { supabase } from "@/lib/supabase";

export type ParcelPackage = {
    id: string;
    name: string;
    slug: string | null;
    category: string;
    price: number;
    description: string;
    image: string;
    contents: string[];
    badge: string | null;
    isActive: boolean;
    createdAt: string | null;
};

type ParcelRow = Record<string, unknown>;

const numberValue = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const stringValue = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value : fallback;

const contentsValue = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (typeof value === "string" && value.trim()) return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    if (value && typeof value === "object") return Object.values(value).map((item) => String(item)).filter(Boolean);
    return [];
};

export function mapParcelPackage(row: ParcelRow): ParcelPackage {
    const category = stringValue(row.category, "Parcel");
    const isActive = typeof row.isActive === "boolean"
        ? row.isActive
        : typeof row.is_active === "boolean"
            ? row.is_active
            : true;

    return {
        id: String(row.id),
        name: stringValue(row.name, "Parcel"),
        slug: typeof row.slug === "string" ? row.slug : null,
        category,
        price: numberValue(row.price),
        description: stringValue(row.description, stringValue(row.deskripsi, category)),
        image: stringValue(row.image, "/products/Parcel 1.png"),
        contents: contentsValue(row.contents),
        badge: typeof row.badge === "string" && row.badge.trim() ? row.badge : null,
        isActive,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : typeof row.created_at === "string" ? row.created_at : null,
    };
}

export async function fetchParcelPackages() {
    const { data, error } = await supabase
        .from("parcel_packages")
        .select("*")
        .order("createdAt", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);

    const parcels = (data ?? []).map((row) => mapParcelPackage(row as ParcelRow));
    return parcels.length ? parcels : [];
}