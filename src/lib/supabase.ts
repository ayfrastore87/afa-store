import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function getSupabaseBrowserEnv() {
    if (!supabaseUrl) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    }

    if (!supabaseAnonKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    return { supabaseUrl, supabaseAnonKey };
}

const { supabaseUrl: browserSupabaseUrl, supabaseAnonKey: browserSupabaseAnonKey } = getSupabaseBrowserEnv();

export const supabase = createBrowserClient(browserSupabaseUrl, browserSupabaseAnonKey);
