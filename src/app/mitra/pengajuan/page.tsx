import { redirect } from "next/navigation";

import { MitraStatus } from "@/components/mitra/mitra-application";
import { resolveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Status Pengajuan | AFA MITRA" };

// Status pengajuan (Tahap 5). ACTIVE partners are sent to the dashboard;
// everyone with a Partner row lands on the correct status view. Duplicate
// submits are already blocked by POST /api/account/partner/apply.
export default async function MitraPengajuanPage() {
    const route = await resolveMitra();
    if (route.kind === "active") redirect("/mitra/dashboard");
    if (route.kind === "unauthenticated") redirect("/mitra/login?next=/mitra/pengajuan");
    if (route.kind === "not_partner") redirect("/mitra/daftar");

    return <MitraStatus status={route.partner.status} partnerCode={route.partner.partnerCode} />;
}
