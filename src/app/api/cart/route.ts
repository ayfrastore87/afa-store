import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCartResponse } from "@/lib/cart";
import { getCurrentUser } from "@/lib/server-auth";
import { authorizeProductItems, parseProductRequestItem, productAuthorityResponse, reconcileProductItems } from "@/lib/product-authority";

export const runtime = "nodejs";

type CartItemRow = { id: string; userId: string; productId: string | null; productRef: string; name: string; price: number; image: string | null; quantity: number; createdAt?: string; updatedAt?: string };

function getSupabaseServerClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase environment belum lengkap.");
    return createClient(url, key, { auth: { persistSession: false } });
}

function unauthenticatedCartResponse() {
    return NextResponse.json({ success: false, redirectTo: "/login", error: "Silakan login terlebih dahulu." }, { status: 401 });
}

function cartErrorResponse(error: unknown) {
    console.error("Cart Error:", error);
    const safe = productAuthorityResponse(error);
    return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
}

async function getCart(userId: string) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("cart_items").select("*").eq("userId", userId).order("updatedAt", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as CartItemRow[];
    const items = await reconcileProductItems(rows.map((row) => ({ id: row.productRef, qty: row.quantity })));
    return buildCartResponse(items);
}

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) return unauthenticatedCartResponse();
        return NextResponse.json(await getCart(user.id));
    } catch (error) {
        return cartErrorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return unauthenticatedCartResponse();
        const body = await request.json() as { item?: { id?: unknown; qty?: unknown }; items?: { id?: unknown; qty?: unknown }[] };
        const rawItems: unknown[] = body.items ? body.items : body.item ? [body.item] : [];
        const requested = rawItems.map((value) => {
            const item = value as Record<string, unknown>;
            return parseProductRequestItem({ id: item.id, qty: item.qty });
        });
        if (!requested.length || requested.some((item) => item === null)) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });
        const incomingItems = await authorizeProductItems(requested.filter((item): item is NonNullable<typeof item> => item !== null));

        const supabase = getSupabaseServerClient();
        const { data: existingData, error: existingError } = await supabase.from("cart_items").select("*").eq("userId", user.id).in("productRef", incomingItems.map((item) => item.id));
        if (existingError) throw new Error(existingError.message);

        const existingMap = new Map(((existingData ?? []) as CartItemRow[]).map((row) => [row.productRef, row]));
        const now = new Date().toISOString();

        const writes = await Promise.all(incomingItems.map((item) => {
            const existing = existingMap.get(item.id);
            if (existing) {
                return supabase.from("cart_items").update({ quantity: Math.min(existing.quantity + item.qty, item.stock), updatedAt: now }).eq("id", existing.id);
            }
            return supabase.from("cart_items").insert({ userId: user.id, productId: item.id, productRef: item.id, name: item.name, price: item.price, image: item.image, quantity: item.qty, createdAt: now, updatedAt: now });
        }));
        const writeError = writes.find((result) => result.error)?.error;
        if (writeError) throw new Error(writeError.message);

        return NextResponse.json(await getCart(user.id));
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
        const user = await getCurrentUser();
        if (!user) return unauthenticatedCartResponse();
        const body = await request.json() as { id?: string; qty?: number };
        if (!body.id || typeof body.qty !== "number" || !Number.isInteger(body.qty)) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });

        const supabase = getSupabaseServerClient();
        if (body.qty > 0) await authorizeProductItems([{ id: body.id, qty: body.qty }]);
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
        const user = await getCurrentUser();
        if (!user) return unauthenticatedCartResponse();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        const supabase = getSupabaseServerClient();
        const query = supabase.from("cart_items").delete().eq("userId", user.id);
        const { error } = id ? await query.eq("productRef", id) : await query;
        if (error) throw new Error(error.message);

        return NextResponse.json(await getCart(user.id));
    } catch (error) {
        return cartErrorResponse(error);
    }
}