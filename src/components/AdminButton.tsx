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
            className="inline-flex items-center gap-2 text-sm font-medium text-white/55 transition duration-300 hover:text-[#E4C982] focus:outline-none focus:ring-1 focus:ring-[#C9A45B]/50"
        >
            <ShieldCheck size={14} className="shrink-0" />
            <span>AFA_store</span>
        </button>
    );
}