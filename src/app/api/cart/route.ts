import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { buildCartResponse, normalizeCartItems, type CartItem } from "@/lib/cart";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

type ProductRow = { id: string; name?: string; slug?: string | null; price?: number; image?: string };
type CartItemRow = { id: string; userId: string; productId: string | null; productRef: string; name: string; price: number; image: string | null; quantity: number; createdAt?: string; updatedAt?: string };
const GUEST_CART_COOKIE = "afa-guest-cart";

function getSupabaseServerClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase environment belum lengkap.");
    return createClient(url, key, { auth: { persistSession: false } });
}

function fallbackItem(productRef: string, qty: number): CartItem {
    return { id: productRef, name: "Produk AFA STORE", price: 0, image: "/products/parcel.png", qty };
}

async function getOptionalUser() {
    try {
        return await getCurrentUser();
    } catch {
        return null;
    }
}

async function getGuestCart() {
    const store = await cookies();
    const raw = store.get(GUEST_CART_COOKIE)?.value;
    if (!raw) return buildCartResponse([]);
    try {
        const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CartItem[];
        return buildCartResponse(normalizeCartItems(Array.isArray(parsed) ? parsed : []));
    } catch {
        return buildCartResponse([]);
    }
}

function withGuestCartCookie(items: CartItem[]) {
    const response = NextResponse.json(buildCartResponse(items));
    response.cookies.set(GUEST_CART_COOKIE, Buffer.from(JSON.stringify(normalizeCartItems(items)), "utf8").toString("base64url"), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    });
    return response;
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
        const products = await supabase.from("products").select("id,name,slug,price,image").in("id", ids);
        if (!products.error) productMap = new Map(((products.data ?? []) as ProductRow[]).map((product) => [product.id, product]));
    }

    const items = rows.map((row) => {
        const itemId = row.productRef;
        const product = row.productId ? productMap.get(row.productId) : undefined;
        const payload = payloadMap.get(itemId);
        return {
            id: itemId,
            name: row.name ?? product?.name ?? payload?.name ?? fallbackItem(itemId, row.quantity).name,
            slug: product?.slug ?? payload?.slug ?? null,
            price: Number(row.price ?? product?.price ?? payload?.price ?? 0),
            image: row.image ?? product?.image ?? payload?.image ?? fallbackItem(itemId, row.quantity).image,
            qty: row.quantity,
        };
    });

    return buildCartResponse(items);
}

export async function GET() {
    try {
        const user = await getOptionalUser();
        return user ? NextResponse.json(await getCart(user.id)) : NextResponse.json(await getGuestCart());
    } catch (error) {
        return cartErrorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const user = await getOptionalUser();
        const body = await request.json() as { item?: CartItem; items?: CartItem[] };
        const incomingItems = normalizeCartItems(body.items ? body.items : body.item ? [body.item] : []);
        if (!incomingItems.length) return NextResponse.json({ message: "Item keranjang tidak valid." }, { status: 400 });

        if (!user) {
            const current = await getGuestCart();
            return withGuestCartCookie([...current.items, ...incomingItems]);
        }

        const supabase = getSupabaseServerClient();
        const { data: existingData, error: existingError } = await supabase.from("cart_items").select("*").eq("userId", user.id).in("productRef", incomingItems.map((item) => item.id));
        if (existingError) throw new Error(existingError.message);

        const existingMap = new Map(((existingData ?? []) as CartItemRow[]).map((row) => [row.productRef, row]));
        const now = new Date().toISOString();

        const productIds = incomingItems.map((item) => item.id);
        const products = await supabase.from("products").select("id").in("id", productIds);
        const validProductIds = new Set(((products.data ?? []) as ProductRow[]).map((product) => product.id));

        await Promise.all(incomingItems.map((item) => {
            const existing = existingMap.get(item.id);
            if (existing) {
                return supabase.from("cart_items").update({ quantity: existing.quantity + item.qty, updatedAt: now }).eq("id", existing.id);
            }
            return supabase.from("cart_items").insert({ userId: user.id, productId: validProductIds.has(item.id) ? item.id : null, productRef: item.id, name: item.name, price: item.price, image: item.image, quantity: item.qty, createdAt: now, updatedAt: now });
        }));

        return NextResponse.json(await getCart(user.id, incomingItems));
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
        const user = await getOptionalUser();
        const body = await request.json() as { id?: string; qty?: number };
        if (!body.id || typeof body.qty !== "number") return NextResponse.json({ message: "Payload update keranjang tidak valid." }, { status: 400 });

        if (!user) {
            const current = await getGuestCart();
            const next = body.qty <= 0 ? current.items.filter((item) => item.id !== body.id) : current.items.map((item) => item.id === body.id ? { ...item, qty: body.qty ?? item.qty } : item);
            return withGuestCartCookie(next);
        }

        const supabase = getSupabaseServerClient();
        const cartRequest = body.qty <= 0
            ? supabase.from("cart_items").delete().eq("userId", user.id).eq("productRef", body.id)
            : supabase.from("cart_items").update({ quantity: body.qty, updatedAt: new Date().toISOString() }).eq("userId", user.id).eq("productRef", body.id);
        const { error } = await cartRequest;
        if (error) throw new Error(error.message);

        return NextResponse.json(await getCart(user.id));
    } catch (error) {
        return cartErrorResponse(error);
    }
}

export async function DELETE(request: Request) {
    try {
        const user = await getOptionalUser();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!user) {
            const current = await getGuestCart();
            return withGuestCartCookie(id ? current.items.filter((item) => item.id !== id) : []);
        }

        const supabase = getSupabaseServerClient();
        const query = supabase.from("cart_items").delete().eq("userId", user.id);
        const { error } = id ? await query.eq("productRef", id) : await query;
        if (error) throw new Error(error.message);

        return NextResponse.json(await getCart(user.id));
    } catch (error) {
        return cartErrorResponse(error);
    }
}