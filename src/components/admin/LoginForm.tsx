"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LOGIN_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            window.setTimeout(() => reject(new Error("Koneksi login terlalu lama. Coba lagi.")), timeoutMs);
        }),
    ]);
}

export default function LoginForm() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    async function handleLogin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setToast(null);
        setIsLoading(true);

        try {
            const { data, error } = await withTimeout(
                supabase.auth.signInWithPassword({ email: email.trim(), password }),
                LOGIN_TIMEOUT_MS
            );

            if (error) {
                setToast(error.message || "Email atau Password salah");
                return;
            }

            if (!data.user) {
                setToast("Login gagal. User Supabase tidak ditemukan.");
                return;
            }

            const { data: admin, error: adminError } = await supabase
                .from("users")
                .select("role")
                .eq("auth_id", data.user.id)
                .single();

            if (adminError || !admin) {
                await supabase.auth.signOut();
                setToast("Akun belum terdaftar sebagai admin");
                return;
            }

            if (admin.role !== "admin") {
                await supabase.auth.signOut();
                setToast("Akun ini tidak memiliki akses admin");
                return;
            }

            router.replace("/admin");
            router.refresh();
            window.location.assign("/admin");
        } catch (error) {
            setToast(error instanceof Error ? error.message : "Login gagal. Silakan coba lagi.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <motion.div initial={{ opacity: 0, y: 26, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden rounded-[32px] border border-[#C8A14A]/30 bg-white p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] md:p-8">
            <AnimatePresence>{toast && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{toast}</motion.div>}</AnimatePresence>
            <form onSubmit={handleLogin} className="space-y-5">
                <div><label htmlFor="email" className="text-sm font-bold text-[#184D47]">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="admin@afastore.com" required className="mt-2 h-14 w-full rounded-2xl border border-[#184D47]/15 bg-[#184D47]/[0.03] px-4 text-base font-medium outline-none placeholder:text-[#184D47]/35 focus:border-[#C8A14A] focus:ring-4 focus:ring-[#C8A14A]/15" /></div>
                <div><label htmlFor="password" className="text-sm font-bold text-[#184D47]">Password</label><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Password" required className="mt-2 h-14 w-full rounded-2xl border border-[#184D47]/15 bg-[#184D47]/[0.03] px-4 text-base font-medium outline-none placeholder:text-[#184D47]/35 focus:border-[#C8A14A] focus:ring-4 focus:ring-[#C8A14A]/15" /></div>
                <button type="submit" disabled={isLoading} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#184D47] text-base font-bold text-white shadow-[0_18px_38px_rgba(24,77,71,0.28)] transition hover:bg-[#123a36] disabled:cursor-not-allowed disabled:opacity-70">{isLoading && <Loader2 className="animate-spin" size={20} />}{isLoading ? "Memproses..." : "Login"}</button>
            </form>
        </motion.div>
    );
}