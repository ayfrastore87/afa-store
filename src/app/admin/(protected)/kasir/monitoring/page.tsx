import { requireAdmin } from "@/lib/auth";
import KasirDeliveryMonitoring from "@/components/admin/kasir/KasirDeliveryMonitoring";

export const dynamic = "force-dynamic";

export default async function KasirMonitoringPage() {
    await requireAdmin();
    return <KasirDeliveryMonitoring />;
}