import { NextResponse } from "next/server";
import { createBrowserClient } from "@supabase/ssr";

export const runtime = "edge";

const ALLOWED_KEYS = new Set(["logo","favicon","address","whatsapp","email","instagram","facebook","tiktok","maps","websiteTitle","metaDescription","seoKeywords","homeBanner","footerLogo","themeColor","storeName"]);

/** GET /api/public/settings?keys=homeBanner,whatsapp
 *  Returns a subset of public settings (no auth required, all data is public). */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const keysParam = searchParams.get("keys");
    const requestedKeys = keysParam
        ? keysParam.split(",").map(k => k.trim()).filter(k => ALLOWED_KEYS.has(k))
        : [];
    if (!requestedKeys.length) {
        return NextResponse.json({});
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({});
    try {
        const supabase = createBrowserClient(url, key);
        const { data } = await supabase
            .from("settings")
            .select("key,value")
            .in("key", requestedKeys);
        if (!data) return NextResponse.json({});
        const result: Record<string, string> = {};
        for (const row of data) {
            if (typeof row.key !== "string") continue;
            const raw =
                typeof row.value === "object" && row.value && "value" in row.value
                    ? (row.value as { value?: unknown }).value
                    : row.value;
            if (typeof raw === "string" && raw.trim()) {
                result[row.key] = raw;
            }
        }
        return NextResponse.json(result, {
            headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
        });
    } catch {
        return NextResponse.json({});
    }
}
