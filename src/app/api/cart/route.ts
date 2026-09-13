import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-admin";
import { buildCartResponse } from "@/lib/cart";
import { getCurrentUser } from "@/lib/server-auth";
import { authorizeProductItems, parseProductRequestItem, productAuthorityResponse, reconcileProductItems } from "@/lib/product-authority";

export const runtime = "nodejs";

type CartItemRow = { id: string; userId: string; productId: string | null; productRef: string; name: string; price: number; image: string | null; quantity: number; createdAt?: string; updatedAt?: string };

function getSupabaseServerClient() {
    // Server-side reads/writes against cart_items must bypass RLS via the
    // service-role key only. Never fall back to the anon key: without a user
    // JWT, RLS (auth.uid() = user_id) rejects every row and surfaces as a 500.
    return createSupabaseServiceClient();
}

function unauthenticatedCartResponse() {
    return NextResponse.json({ success: false, redirectTo: "/login", error: "Silakan login terlebih dahulu." }, { status: 401 });
}

function traceStage(stage: string) {
    console.info(`[api/cart][POST] ${stage}:start`);
    return Date.now();
}

function traceStageOk(stage: string, started: number) {
    console.info(`[api/cart][POST] ${stage}:ok`, { elapsedMs: Date.now() - started });
}

function cartErrorResponse(error: unknown, stage?: string, elapsedMs?: number) {
    const source = typeof error === "object" && error !== null ? (error as { code?: unknown; message?: unknown }) : {};
    console.error("[api/cart]", {
        code: source.code ?? null,
        message: typeof source.message === "string" ? source.message : String(error),
        ...(stage ? { stage } : {}),
        ...(typeof elapsedMs === "number" ? { elapsedMs } : {}),
    });
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
        const authStarted = traceStage("auth");
        const user = await getCurrentUser();
        if (!user) return unauthenticatedCartResponse();
        traceStageOk("auth", authStarted);

        const body = await request.json() as { item?: { id?: unknown; qty?: unknown }; items?: { id?: unknown; qty?: unknown }[] };
        const rawItems: unknown[] = body.items ? body.items : body.item ? [body.item] : [];
        const requested = rawItems.map((value) => {
            const item = value as Record<string, unknown>;
            return parseProductRequestItem({ id: item.id, qty: item.qty });
        });
        if (!requested.length || requested.some((item) => item === null)) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });

        const productStarted = traceStage("product");
        const incomingItems = await authorizeProductItems(requested.filter((item): item is NonNullable<typeof item> => item !== null));
        traceStageOk("product", productStarted);

        const supabase = getSupabaseServerClient();

        const cartItemStarted = traceStage("cart-item");
        const { data: existingData, error: existingError } = await supabase.from("cart_items").select("*").eq("userId", user.id).in("productRef", incomingItems.map((item) => item.id));
        if (existingError) throw new Error(existingError.message);
        traceStageOk("cart-item", cartItemStarted);

        const existingMap = new Map(((existingData ?? []) as CartItemRow[]).map((row) => [row.productRef, row]));
        const now = new Date().toISOString();

        const writeStarted = traceStage("write");
        const writes = await Promise.all(incomingItems.map((item) => {
            const existing = existingMap.get(item.id);
            if (existing) {
                return supabase.from("cart_items").update({ quantity: Math.min(existing.quantity + item.qty, item.stock), updatedAt: now }).eq("id", existing.id);
            }
            return supabase.from("cart_items").insert({ userId: user.id, productId: item.id, productRef: item.id, name: item.name, price: item.price, image: item.image, quantity: item.qty, createdAt: now, updatedAt: now });
        }));
        const writeError = writes.find((result) => result.error)?.error;
        if (writeError) throw new Error(writeError.message);
        traceStageOk("write", writeStarted);

        const reloadStarted = traceStage("reload");
        const response = await getCart(user.id);
        traceStageOk("reload", reloadStarted);
        return NextResponse.json(response);
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