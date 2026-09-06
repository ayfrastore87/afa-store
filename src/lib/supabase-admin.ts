import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
        console.error("Supabase admin environment is incomplete", { hasUrl: Boolean(url), hasServiceRoleKey: Boolean(serviceRoleKey) });
        throw new Error("Konfigurasi upload belum lengkap.");
    }
    return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}