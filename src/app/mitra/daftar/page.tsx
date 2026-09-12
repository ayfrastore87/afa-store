import { redirect } from "next/navigation";

import { MitraApplication } from "@/components/mitra/mitra-application";
import { resolveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daftar Mitra | AFA MITRA" };

// If the user already has an application, bounce to the correct status view.
// Only a fresh (not_partner / unauthenticated) user reaches the form.
export default async function MitraDaftarPage() {
    const route = await resolveMitra();
    if (route.kind === "active") redirect("/mitra/dashboard");
    if (route.kind === "pending" || route.kind === "suspended" || route.kind === "rejected") {
        redirect("/mitra/pengajuan");
    }

    const user = route.kind === "not_partner" ? route.user : { name: null, phone: null };
    return <MitraApplication applicant={user} />;
}
