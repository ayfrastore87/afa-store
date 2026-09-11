import { requireAdmin } from "@/lib/auth";
import { PartnerAdminPanel } from "@/components/admin/PartnerAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminMitraPage() {
    await requireAdmin();
    return <PartnerAdminPanel />;
}
