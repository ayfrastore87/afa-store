import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/auth";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type ParcelPayload = {
    id?: string;
    categoryId?: string | null;
    name?: string;
    slug?: string | null;
    price?: number;
    description?: string | null;
    image?: string | null;
    contents?: string[];
    badge?: string | null;
    isActive?: boolean;
    images?: { url: string; alt?: string | null; sortOrder?: number }[];
};

function json(message: string, status: number) {
    return NextResponse.json({ message }, { status });
}

async function requireAdmin() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("users").select("role").eq("auth_id", user.id).single();
    return data?.role === "admin";
}

function storagePathFromPublicUrl(url: string | null | undefined, bucket: string) {
    if (!url) return null;
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.indexOf(marker);
    return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : null;
}

export async function GET() {
    if (!await requireAdmin()) return json("Akses admin diperlukan.", 403);

    const { data, error } = await supabaseAdmin
        .from("parcel_packages")
        .select("*, parcel_categories(*), parcel_images(*)")
        .order("createdAt", { ascending: false });

    if (error) return json(error.message, 500);
    return NextResponse.json({ parcels: data ?? [] });
}

export async function POST(request: Request) {
    if (!await requireAdmin()) return json("Akses admin diperlukan.", 403);
    const body = await request.json() as ParcelPayload;

    const parcel = {
        categoryId: body.categoryId ?? null,
        name: body.name ?? "Parcel",
        slug: body.slug ?? null,
        price: Number(body.price ?? 0),
        description: body.description ?? null,
        image: body.image ?? null,
        contents: body.contents ?? [],
        badge: body.badge ?? null,
        isActive: body.isActive ?? true,
    };

    const { data, error } = body.id
        ? await supabaseAdmin.from("parcel_packages").update(parcel).eq("id", body.id).select("id").single()
        : await supabaseAdmin.from("parcel_packages").insert(parcel).select("id").single();

    if (error) return json(error.message, 500);

    if (Array.isArray(body.images)) {
        await supabaseAdmin.from("parcel_images").delete().eq("parcelId", data.id);
        const images = body.images.filter((image) => image.url).map((image, index) => ({
            parcelId: data.id,
            url: image.url,
            alt: image.alt ?? parcel.name,
            sortOrder: image.sortOrder ?? index,
        }));
        if (images.length) {
            const { error: imageError } = await supabaseAdmin.from("parcel_images").insert(images);
            if (imageError) return json(imageError.message, 500);
        }
    }

    return NextResponse.json({ id: data.id });
}

export async function DELETE(request: Request) {
    if (!await requireAdmin()) return json("Akses admin diperlukan.", 403);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return json("ID parcel wajib diisi.", 400);

    const { data: existing } = await supabaseAdmin.from("parcel_packages").select("image, parcel_images(url)").eq("id", id).single();
    const urls = [existing?.image, ...((existing?.parcel_images as { url?: string }[] | null) ?? []).map((image) => image.url)];
    const paths = urls.map((url) => storagePathFromPublicUrl(url, "parcel")).filter((path): path is string => Boolean(path));

    const { error } = await supabaseAdmin.from("parcel_packages").delete().eq("id", id);
    if (error) return json(error.message, 500);
    if (paths.length) await supabaseAdmin.storage.from("parcel").remove(paths);

    return NextResponse.json({ ok: true });
}