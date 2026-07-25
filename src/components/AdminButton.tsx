"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminButton() {
    const router = useRouter();

    const handleAdminClick = async () => {
        const { data } = await supabase.auth.getUser();

        if (!data.user) {
            router.push("/admin/login");
            return;
        }

        const { data: admin } = await supabase
            .from("users")
            .select("role")
            .eq("auth_id", data.user.id)
            .single();

        router.push(admin?.role === "admin" ? "/admin" : "/admin/login");
    };

    return (
        <button
            type="button"
            onClick={handleAdminClick}
            title="Dashboard Admin"
            aria-label="Dashboard Admin"
            className="relative z-80 inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-linear-to-r from-[#0F766E] to-[#16A34A] px-3 text-sm font-bold text-white shadow-[0_12px_26px_rgba(15,118,110,0.28)] ring-1 ring-white/55 transition duration-300 hover:scale-105 hover:shadow-[0_0_22px_rgba(22,163,74,0.58),0_14px_30px_rgba(15,118,110,0.28)] focus:outline-none focus:ring-2 focus:ring-[#C9A45B] md:px-4"
        >
            <ShieldCheck size={18} className="shrink-0" />
            <span className="hidden md:inline">Admin</span>
        </button>
    );
}