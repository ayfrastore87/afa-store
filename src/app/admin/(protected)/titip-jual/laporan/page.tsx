import { requireAdmin } from "@/lib/auth";
import { ConsignmentReport } from "@/components/admin/consignment/ConsignmentReport";

export const dynamic = "force-dynamic";

export default async function AdminConsignmentReportPage() {
    await requireAdmin();
    return <ConsignmentReport />;
}