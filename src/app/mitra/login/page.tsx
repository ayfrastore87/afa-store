import { redirect } from "next/navigation";

import { MitraLogin } from "@/components/mitra/mitra-login";
import { resolveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Masuk AFA MITRA | AFA STORE",
    description: "Kelola usaha mitra Anda — pantau stok, catat penjualan, lihat laporan bersama AFA STORE.",
};

// Presentation-layer login portal for AFA MITRA. Reuses the existing AFA STORE
// auth (Supabase SSR session) and the existing Partner model/status — never a
// second auth system and never a new Partner record here. If the user is already
// authenticated we route them straight to the correct Mitra destination by
// status, reusing resolveMitra() so status logic lives in exactly one place.
export default async function MitraLoginPage() {
    const route = await resolveMitra();

    if (route.kind === "active") redirect("/mitra/dashboard");
    if (route.kind === "not_partner") redirect("/mitra/daftar");
    if (route.kind === "pending" || route.kind === "suspended" || route.kind === "rejected") {
        redirect("/mitra/pengajuan");
    }

    return <MitraLogin />;
}
