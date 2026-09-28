import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";

export const runtime = "nodejs";

// ── Valid settings keys (sourced from defaultSettings in AdminAdvancedPanels) ──
const VALID_KEYS = new Set([
    "storeName", "logo", "favicon", "address", "whatsapp", "email",
    "instagram", "facebook", "tiktok", "maps",
    "shippingEnabled", "couriers", "defaultWeight", "freeShipping",
    "qris", "bankTransfer", "cod", "virtualAccount", "accountNumber", "bankName",
    "websiteTitle", "metaDescription", "seoKeywords", "homeBanner", "footerLogo",
    "themeColor", "darkMode", "twoFA", "session",
]);

// ── Fields with boolean values ────────────────────────────────────────────────
const BOOLEAN_KEYS = new Set([
    "shippingEnabled", "freeShipping", "qris", "bankTransfer",
    "cod", "virtualAccount", "darkMode", "twoFA",
]);

const settingSchema = z.record(z.string(), z.union([z.string(), z.boolean()]));

// ── GET /api/admin/settings ───────────────────────────────────────────────────
// Admin-only. Returns current settings from the database (service-role read).
export async function GET() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const supabase = createSupabaseAdminClient();
        const { data, error } = await supabase.from("settings").select("key,value");
        if (error) {
            console.error("[admin-settings-get] Database read failed", {
                operation: "select",
                code: error.code ?? "unknown",
                message: (error.message ?? "").slice(0, 200),
            });
            return NextResponse.json(
                { error: "Gagal memuat pengaturan toko." },
                { status: 502 }
            );
        }

        const result: Record<string, string | boolean> = {};
        for (const row of data ?? []) {
            if (typeof row.key !== "string") continue;
            if (!VALID_KEYS.has(row.key)) continue;
            const raw =
                typeof row.value === "object" && row.value !== null && "value" in row.value
                    ? (row.value as { value?: unknown }).value
                    : row.value;
            if (BOOLEAN_KEYS.has(row.key)) {
                result[row.key] = raw === true || raw === "true";
            } else if (typeof raw === "string") {
                result[row.key] = raw;
            } else if (typeof raw === "boolean") {
                result[row.key] = raw;
            }
        }

        return NextResponse.json({ settings: result });
    } catch (err) {
        console.error("[admin-settings-get] Unexpected error", {
            operation: "select",
            name: err instanceof Error ? err.name : "unknown",
        });
        return NextResponse.json(
            { error: "Gagal memuat pengaturan toko." },
            { status: 500 }
        );
    }
}

// ── PATCH /api/admin/settings ─────────────────────────────────────────────────
// Admin-only. Validates + whitelists keys. Writes via service-role.
// Revalidates settings cache tag + root layout after successful save.
export async function PATCH(request: Request) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
    }

    const parsed = settingSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Format pengaturan tidak valid." }, { status: 400 });
    }

    // Whitelist: strip any unknown or UI-only keys (dirty, preview, uploading, etc.)
    const sanitized = Object.fromEntries(
        Object.entries(parsed.data).filter(([key]) => VALID_KEYS.has(key))
    );

    if (!Object.keys(sanitized).length) {
        return NextResponse.json(
            { error: "Tidak ada pengaturan yang valid untuk disimpan." },
            { status: 400 }
        );
    }

    // Row shape matches what the settings-loader and SettingsPanel expect: { value: <actual> }
    const rows = Object.entries(sanitized).map(([key, value]) => ({
        key,
        value: { value },
    }));

    try {
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase
            .from("settings")
            .upsert(rows, { onConflict: "key" });

        if (error) {
            console.error("[admin-settings-save] Database upsert failed", {
                operation: "upsert",
                code: error.code ?? "unknown",
                message: (error.message ?? "").slice(0, 200),
            });
            return NextResponse.json(
                { error: "Gagal memperbarui database pengaturan." },
                { status: 502 }
            );
        }

        // Invalidate server-side settings cache so Next.js re-fetches on next request
        revalidateTag("settings", "max");
        revalidatePath("/", "layout");

        console.log("[admin-settings-save] Success", {
            operation: "upsert",
            keys: Object.keys(sanitized).length,
            adminId: admin.id,
        });

        return NextResponse.json({
            success: true,
            saved: Object.keys(sanitized).length,
        });
    } catch (err) {
        console.error("[admin-settings-save] Unexpected error", {
            operation: "upsert",
            name: err instanceof Error ? err.name : "unknown",
        });
        return NextResponse.json(
            { error: "Gagal menyimpan pengaturan toko." },
            { status: 500 }
        );
    }
}
