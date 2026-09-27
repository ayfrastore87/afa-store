import { requireAdmin } from "@/lib/auth";
import { ConsignmentAdminPanel } from "@/components/admin/consignment/ConsignmentAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminConsignmentPage() {
    await requireAdmin();
    return <ConsignmentAdminPanel />;
}