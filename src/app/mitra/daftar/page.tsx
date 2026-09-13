import { redirect } from "next/navigation";

import { MitraApplication } from "@/components/mitra/mitra-application";
import { resolveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daftar Mitra | AFA MITRA" };

// Standalone Mitra registration. Any already-authenticated Mitra account is
// bounced to the correct status view; only a fresh session reaches the form.
export default async function MitraDaftarPage() {
    const route = await resolveMitra();
    if (route.kind === "active") redirect("/mitra/dashboard");
    if (route.kind === "pending" || route.kind === "suspended" || route.kind === "rejected") {
        redirect("/mitra/pengajuan");
    }

    return <MitraApplication />;
}
