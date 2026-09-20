import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/server-auth";
import { createSupabaseServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/admin/products/[id]/stock
//
// Admin-only stock adjustment endpoint.
// Updates product stock AND creates stock_history record (server-side).
//
// Authentication/Authorization:
// - Requires authenticated Supabase session
// - Requires admin role in public.users table
// - Requires isActive = true
//
// Request body:
//   { delta: 1 }      // increase stock by 1
//   { delta: -1 }     // decrease stock by 1
//
// Response (success):
//   { success: true; previousStock: number; newStock: number; transactionId: number }
//
// Response (error):
//   { message: string } with appropriate status code
// ---------------------------------------------------------------------------

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Verify admin authentication and authorization
        const admin = await getCurrentAdmin();
        if (!admin) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        // Extract parameters from dynamic route
        const params = await context.params;
        const productId = params.id;

        // Parse request body
        let body: { delta: number };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
        }

        // Validate delta is exactly +1 or -1
        const delta = body.delta;
        if (delta !== 1 && delta !== -1) {
            return NextResponse.json(
                { message: "Adjustment must be +1 or -1." },
                { status: 400 }
            );
        }

        // Initialize service-role client
        const supabaseAdmin = createSupabaseServiceClient();

        // Read actual product data from DATABASE (not from browser)
        const { data: product, error: productError } = await supabaseAdmin
            .from("products")
            .select("id, name, stock")
            .eq("id", productId)
            .single();

        if (productError || !product) {
            return NextResponse.json({ message: "Product not found." }, { status: 404 });
        }

        // Calculate stock values based on DATABASE value
        const currentStock = Number(product.stock || 0);
        const productName = product.name;

        // Guard: prevent decrement below zero
        if (delta === -1 && currentStock <= 0) {
            return NextResponse.json(
                {
                    success: false,
                    reason: "stock_zero",
                    previousStock: 0,
                    newStock: 0,
                    message: "Stok sudah nol, tidak dapat dikurangi.",
                },
                { status: 400 }
            );
        }

        // Calculate next stock
        const nextStock = currentStock + delta;

        // Step 1: Update products.stock
        const { error: updateError } = await supabaseAdmin
            .from("products")
            .update({ stock: nextStock })
            .eq("id", productId);

        if (updateError) {
            console.error("[api/admin/products/stock] Product update failed", {
                category: "stock_adjustment",
                productId,
                delta,
                name: updateError instanceof Error ? updateError.name : "UnknownError",
                message: updateError instanceof Error ? updateError.message : String(updateError),
            });
            return NextResponse.json({ message: "Gagal memperbarui stok produk." }, { status: 500 });
        }

        // Step 2: Insert stock_history
        // Note: This is a separate query, not wrapped in transaction
        // If this fails after successful product update, no automatic rollback occurs
        const { data: historyRecord, error: insertError } = await supabaseAdmin
            .from("stock_history")
            .insert({
                product_id: productId,
                product_name: productName,
                transaction_type: delta > 0 ? "IN" : "OUT",
                quantity: 1,
                stock_before: currentStock,
                stock_after: nextStock,
                note: delta > 0 ? "Tambah stok admin" : "Kurangi stok admin",
                created_by: admin.email, // From authenticated server user, NOT from browser
            })
            .select("id")
            .single();

        if (insertError) {
            console.error("[api/admin/products/stock] History insert failed", {
                category: "stock_adjustment",
                productId,
                delta,
                currentStock,
                nextStock,
                name: insertError instanceof Error ? insertError.name : "UnknownError",
                message: insertError instanceof Error ? insertError.message : String(insertError),
            });

            // Log but don't roll back (no transaction available)
            // Product was already updated, now audit trail is missing
            // TODO: Implement compensating action or retry logic later

            return NextResponse.json(
                {
                    message: "Stok berhasil diperbarui, tetapi gagal menyimpan riwayat.",
                    historyInsertFailed: true,
                },
                { status: 500 }
            );
        }

        // Success
        return NextResponse.json({
            success: true,
            previousStock: currentStock,
            newStock: nextStock,
            transactionId: historyRecord.id,
        });
    } catch (error) {
        console.error("[api/admin/products/stock] Unexpected error", {
            category: "stock_adjustment",
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ message: "Terjadi kesalahan pada server." }, { status: 500 });
    }
}