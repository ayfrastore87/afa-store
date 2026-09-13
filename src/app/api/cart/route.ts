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

type SupabaseErrorLike = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown; status?: unknown };

function cartErrorResponse(error: unknown, stage?: string, elapsedMs?: number) {
    // Preserve the original PostgREST/Prisma error fields (code, status, details,
    // hint) so the exact failing call is identifiable in logs. The previous code
    // wrapped everything in `new Error(error.message)`, which discarded `code`
    // and left `{ code: null, message: "Gateway Timeout" }` unidentifiable.
    const source = typeof error === "object" && error !== null ? (error as SupabaseErrorLike) : {};
    const details = typeof source.details === "string" && source.details.trim() ? { details: source.details } : {};
    const hint = typeof source.hint === "string" && source.hint.trim() ? { hint: source.hint } : {};
    console.error("[api/cart]", {
        code: source.code ?? null,
        status: typeof source.status === "number" ? source.status : null,
        message: typeof source.message === "string" ? source.message : String(error),
        ...details,
        ...hint,
        ...(stage ? { stage } : {}),
        ...(typeof elapsedMs === "number" ? { elapsedMs } : {}),
    });
    const safe = productAuthorityResponse(error);
    return NextResponse.json({ success: false, error: safe.error }, { status: safe.status });
}

async function getCart(userId: string) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("cart_items").select("*").eq("userId", userId).order("updatedAt", { ascending: false });
    if (error) throw error;

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
    let stage = "parse";
    let stageStarted = Date.now();
    try {
        stage = "auth";
        stageStarted = traceStage(stage);
        const user = await getCurrentUser();
        if (!user) return unauthenticatedCartResponse();
        traceStageOk(stage, stageStarted);

        const body = await request.json() as { item?: { id?: unknown; qty?: unknown }; items?: { id?: unknown; qty?: unknown }[] };
        const rawItems: unknown[] = body.items ? body.items : body.item ? [body.item] : [];
        const requested = rawItems.map((value) => {
            const item = value as Record<string, unknown>;
            return parseProductRequestItem({ id: item.id, qty: item.qty });
        });
        if (!requested.length || requested.some((item) => item === null)) return NextResponse.json({ success: false, error: "Data tidak valid" }, { status: 400 });

        stage = "product";
        stageStarted = traceStage(stage);
        const incomingItems = await authorizeProductItems(requested.filter((item): item is NonNullable<typeof item> => item !== null));
        traceStageOk(stage, stageStarted);

        const supabase = getSupabaseServerClient();

        stage = "cart-item";
        stageStarted = traceStage(stage);
        const { data: existingData, error: existingError } = await supabase.from("cart_items").select("*").eq("userId", user.id).in("productRef", incomingItems.map((item) => item.id));
        if (existingError) throw existingError;
        traceStageOk(stage, stageStarted);

        const existingMap = new Map(((existingData ?? []) as CartItemRow[]).map((row) => [row.productRef, row]));
        const now = new Date().toISOString();

        stage = "write";
        stageStarted = traceStage(stage);
        const writes = await Promise.all(incomingItems.map((item) => {
            const existing = existingMap.get(item.id);
            if (existing) {
                return supabase.from("cart_items").update({ quantity: Math.min(existing.quantity + item.qty, item.stock), updatedAt: now }).eq("id", existing.id);
            }
            // cart_items.id is a TEXT primary key with no DB default (see
            // supabase/migrations/20260726171200_create_cart_items.sql), and this
            // route writes via the Supabase client (not Prisma), so Prisma's
            // client-side @default(cuid()) never applies. Without a server-side id,
            // PostgREST sends NULL and Postgres raises 23502 not-null violation.
            return supabase.from("cart_items").insert({ id: crypto.randomUUID(), userId: user.id, productId: item.id, productRef: item.id, name: item.name, price: item.price, image: item.image, quantity: item.qty, createdAt: now, updatedAt: now });
        }));
        const writeError = writes.find((result) => result.error)?.error;
        if (writeError) throw writeError;
        traceStageOk(stage, stageStarted);

        stage = "reload";
        stageStarted = traceStage(stage);
        const response = await getCart(user.id);
        traceStageOk(stage, stageStarted);
        return NextResponse.json(response);
    } catch (error) {
        return cartErrorResponse(error, stage, Date.now() - stageStarted);
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
        if (error) throw error;

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
        if (error) throw error;

        return NextResponse.json(await getCart(user.id));
    } catch (error) {
        return cartErrorResponse(error);
    }
}