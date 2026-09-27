"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// Same client login pattern as the kasir form: Supabase password sign-in and a
// client-side role hint check for fast feedback. The AUTHORITATIVE gate stays
// server-side (requireSales / getCurrentSalesPerson) on every page and API.
export default function SalesLoginForm() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError || !data.user) {
            setError("Email atau password salah.");
            setLoading(false);
            return;
        }
        const { data: account } = await supabase.from("users").select("role,isActive").eq("auth_id", data.user.id).single();
        if (!account || account.isActive === false || account.role !== "sales") {
            await supabase.auth.signOut();
            setError("Akun ini tidak memiliki akses Sales.");
            setLoading(false);
            return;
        }
        router.replace("/sales");
        router.refresh();
    }

    return (
        <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block text-sm font-bold">Email Sales
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#123524]/15 bg-white px-4" />
            </label>
            <label className="block text-sm font-bold">Password
                <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#123524]/15 bg-white px-4" />
            </label>
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            <button disabled={loading} className="h-12 w-full rounded-xl bg-[#184D47] font-bold text-[#F8F5EE]">{loading ? "Memproses..." : "MASUK"}</button>
        </form>
    );
}