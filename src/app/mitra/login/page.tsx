import { redirect } from "next/navigation";

import { MitraLogin } from "@/components/mitra/mitra-login";
import { resolveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Masuk AFA MITRA | AFA STORE",
    description: "Kelola usaha mitra Anda — pantau stok, catat penjualan, lihat laporan bersama AFA STORE.",
};

// Standalone AFA MITRA login portal. Auth authority is the Mitra session
// (afa_mitra_session → MitraAccount), fully independent from the customer
// Supabase session. Already-authenticated Mitra accounts are routed by status.
export default async function MitraLoginPage() {
    const route = await resolveMitra();

    if (route.kind === "active") redirect("/mitra/dashboard");
    if (route.kind === "pending" || route.kind === "suspended" || route.kind === "rejected") {
        redirect("/mitra/pengajuan");
    }

    return <MitraLogin />;
}
