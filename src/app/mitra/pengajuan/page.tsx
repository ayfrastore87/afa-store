import { redirect } from "next/navigation";

import { MitraStatus } from "@/components/mitra/mitra-application";
import { resolveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Status Pengajuan | AFA MITRA" };

// Status pengajuan. ACTIVE partners are sent to the dashboard; every other
// authenticated Mitra account lands on the correct status view.
export default async function MitraPengajuanPage() {
    const route = await resolveMitra();
    if (route.kind === "active") redirect("/mitra/dashboard");
    if (route.kind === "unauthenticated") redirect("/mitra/login?next=/mitra/pengajuan");

    return <MitraStatus status={route.partner.status} partnerCode={route.partner.partnerCode} />;
}
