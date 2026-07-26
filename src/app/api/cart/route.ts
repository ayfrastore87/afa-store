import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCartResponse, normalizeCartItems, type CartItem } from "@/lib/cart";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

type CartRow = { id: string; userId: string; productId: string; qty: number; createdAt?: string; updatedAt?: string };
type ProductRow = { id: string; name?: string; price?: number; image?: string };

function getSupabaseServerClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase environment belum lengkap.");
    return createClient(url, key, { auth: { persistSession: false } });
}

async function getUserOrUnauthorized() {
    const user = await getCurrentUser();
    return user ? { user } : { response: NextResponse.json({ message: "Silakan login untuk menyimpan keranjang." }, { status: 401 }) };
}

function fallbackItem(productId: string, qty: number): CartItem {
    return { id: productId, name: "Produk AFA STORE", price: 0, image: "/products/parcel.png", qty };
}

async function getCart(userId: string, payloadItems: CartItem[] = []) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("cart").select("*").eq("userId", userId).order("updatedAt", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as CartRow[];
    const ids = rows.map((row) => row.productId);
    const payloadMap = new Map(payloadItems.map((item) => [item.id, item]));
    let productMap = new Map<string, ProductRow>();

    if (ids.length) {
        const products = await supabase.from("products").select("id,name,price,image").in("id", ids);
        if (!products.error) productMap = new Map(((products.data ?? []) as ProductRow[]).map((product) => [product.id, product]));
    }

    const items = rows.map((row) => {
        const product = productMap.get(row.productId);
        const payload = payloadMap.get(row.productId);
        return {
            id: row.productId,
            name: product?.name ?? payload?.name ?? fallbackItem(row.productId, row.qty).name,
            price: Number(product?.price ?? payload?.price ?? 0),
            image: product?.image ?? payload?.image ?? fallbackItem(row.productId, row.qty).image,
            qty: row.qty,
        };
    });

    return buildCartResponse(items);
}

export async function GET() {
    const auth = await getUserOrUnauthorized();
    if ("response" in auth) return auth.response;
    return NextResponse.json(await getCart(auth.user.id));
}

export async function POST(request: Request) {
    const auth = await getUserOrUnauthorized();
    if ("response" in auth) return auth.response;

    const body = await request.json() as { item?: CartItem; items?: CartItem[] };
    const incomingItems = normalizeCartItems(body.items ? body.items : body.item ? [body.item] : []);
    if (!incomingItems.length) return NextResponse.json({ message: "Item keranjang tidak valid." }, { status: 400 });

    const supabase = getSupabaseServerClient();
    const { data: existingData, error: existingError } = await supabase.from("cart").select("*").eq("userId", auth.user.id).in("productId", incomingItems.map((item) => item.id));
    if (existingError) throw new Error(existingError.message);

    const existingMap = new Map(((existingData ?? []) as CartRow[]).map((row) => [row.productId, row]));
    const now = new Date().toISOString();

    await Promise.all(incomingItems.map((item) => {
        const existing = existingMap.get(item.id);
        if (existing) {
            return supabase.from("cart").update({ qty: existing.qty + item.qty, updatedAt: now }).eq("id", existing.id);
        }
        return supabase.from("cart").insert({ userId: auth.user.id, productId: item.id, qty: item.qty, createdAt: now, updatedAt: now });
    }));

    return NextResponse.json(await getCart(auth.user.id, incomingItems));
}

export async function PATCH(request: Request) {
    const auth = await getUserOrUnauthorized();
    if ("response" in auth) return auth.response;

    const body = await request.json() as { id?: string; qty?: number };
    if (!body.id || typeof body.qty !== "number") return NextResponse.json({ message: "Payload update keranjang tidak valid." }, { status: 400 });

    const supabase = getSupabaseServerClient();
    const cartRequest = body.qty <= 0
        ? supabase.from("cart").delete().eq("userId", auth.user.id).eq("productId", body.id)
        : supabase.from("cart").update({ qty: body.qty, updatedAt: new Date().toISOString() }).eq("userId", auth.user.id).eq("productId", body.id);
    const { error } = await cartRequest;
    if (error) throw new Error(error.message);

    return NextResponse.json(await getCart(auth.user.id));
}

export async function DELETE(request: Request) {
    const auth = await getUserOrUnauthorized();
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const supabase = getSupabaseServerClient();
    const query = supabase.from("cart").delete().eq("userId", auth.user.id);
    const { error } = id ? await query.eq("productId", id) : await query;
    if (error) throw new Error(error.message);

    return NextResponse.json(await getCart(auth.user.id));
}