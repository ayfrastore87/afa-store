import { requireAdmin } from "@/lib/auth";
import { ConsignmentSalesPanel } from "@/components/admin/consignment/ConsignmentSalesPanel";

export const dynamic = "force-dynamic";

export default async function AdminConsignmentSalesPage() {
    await requireAdmin();
    return <ConsignmentSalesPanel />;
}