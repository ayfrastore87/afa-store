import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCartResponse, normalizeCartItems, type CartItem } from "@/lib/cart";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

type ProductRow = { id: string; name?: string; price?: number; image?: string };
type CartItemRow = { id: string; userId: string; productId: string | null; productRef: string; name: string; price: number; image: string | null; quantity: number; createdAt?: string; updatedAt?: string };

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

function fallbackItem(productRef: string, qty: number): CartItem {
    return { id: productRef, name: "Produk AFA STORE", price: 0, image: "/products/parcel.png", qty };
}

function cartErrorResponse(error: unknown) {
    console.error("Checkout Error:", error);
    return NextResponse.json(
        {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            stack: process.env.NODE_ENV === "development"
                ? (error instanceof Error ? error.stack : undefined)
                : undefined,
        },
        { status: 500 }
    );
}

async function getCart(userId: string, payloadItems: CartItem[] = []) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("cart_items").select("*").eq("userId", userId).order("updatedAt", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as CartItemRow[];
    const ids = rows.map((row) => row.productId).filter((id): id is string => Boolean(id));
    const payloadMap = new Map(payloadItems.map((item) => [item.id, item]));
    let productMap = new Map<string, ProductRow>();

    if (ids.length) {
        const products = await supabase.from("products").select("id,name,price,image").in("id", ids);
        if (!products.error) productMap = new Map(((products.data ?? []) as ProductRow[]).map((product) => [product.id, product]));
    }

    const items = rows.map((row) => {
        const itemId = row.productRef;
        const product = row.productId ? productMap.get(row.productId) : undefined;
        const payload = payloadMap.get(itemId);
        return {
            id: itemId,
            name: row.name ?? product?.name ?? payload?.name ?? fallbackItem(itemId, row.quantity).name,
            price: Number(row.price ?? product?.price ?? payload?.price ?? 0),
            image: row.image ?? product?.image ?? payload?.image ?? fallbackItem(itemId, row.quantity).image,
            qty: row.quantity,
        };
    });

    return buildCartResponse(items);
}

export async function GET() {
    try {
        const auth = await getUserOrUnauthorized();
        if ("response" in auth) return auth.response;
        return NextResponse.json(await getCart(auth.user.id));
    } catch (error) {
        return cartErrorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const auth = await getUserOrUnauthorized();
        if ("response" in auth) return auth.response;

        const body = await request.json() as { item?: CartItem; items?: CartItem[] };
        const incomingItems = normalizeCartItems(body.items ? body.items : body.item ? [body.item] : []);
        if (!incomingItems.length) return NextResponse.json({ message: "Item keranjang tidak valid." }, { status: 400 });

        const supabase = getSupabaseServerClient();
        const { data: existingData, error: existingError } = await supabase.from("cart_items").select("*").eq("userId", auth.user.id).in("productRef", incomingItems.map((item) => item.id));
        if (existingError) throw new Error(existingError.message);

        const existingMap = new Map(((existingData ?? []) as CartItemRow[]).map((row) => [row.productRef, row]));
        const now = new Date().toISOString();

        await Promise.all(incomingItems.map((item) => {
            const existing = existingMap.get(item.id);
            if (existing) {
                return supabase.from("cart_items").update({ quantity: existing.quantity + item.qty, updatedAt: now }).eq("id", existing.id);
            }
            return supabase.from("cart_items").insert({ userId: auth.user.id, productId: item.id, productRef: item.id, name: item.name, price: item.price, image: item.image, quantity: item.qty, createdAt: now, updatedAt: now });
        }));

        return NextResponse.json(await getCart(auth.user.id, incomingItems));
    } catch (error) {
        return cartErrorResponse(error);
    }
}

export async function PATCH(request: Request) {
    return updateQuantity(request);
}

export async function PUT(request: Request) {
    return updateQuantity(request);
}

async function updateQuantity(request: Request) {
    try {
        const auth = await getUserOrUnauthorized();
        if ("response" in auth) return auth.response;

        const body = await request.json() as { id?: string; qty?: number };
        if (!body.id || typeof body.qty !== "number") return NextResponse.json({ message: "Payload update keranjang tidak valid." }, { status: 400 });

        const supabase = getSupabaseServerClient();
        const cartRequest = body.qty <= 0
            ? supabase.from("cart_items").delete().eq("userId", auth.user.id).eq("productRef", body.id)
            : supabase.from("cart_items").update({ quantity: body.qty, updatedAt: new Date().toISOString() }).eq("userId", auth.user.id).eq("productRef", body.id);
        const { error } = await cartRequest;
        if (error) throw new Error(error.message);

        return NextResponse.json(await getCart(auth.user.id));
    } catch (error) {
        return cartErrorResponse(error);
    }
}

export async function DELETE(request: Request) {
    try {
        const auth = await getUserOrUnauthorized();
        if ("response" in auth) return auth.response;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        const supabase = getSupabaseServerClient();
        const query = supabase.from("cart_items").delete().eq("userId", auth.user.id);
        const { error } = id ? await query.eq("productRef", id) : await query;
        if (error) throw new Error(error.message);

        return NextResponse.json(await getCart(auth.user.id));
    } catch (error) {
        return cartErrorResponse(error);
    }
}