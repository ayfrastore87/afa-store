import { requireAdmin } from "@/lib/auth";
import { ConsignmentStoreMap } from "@/components/admin/consignment/ConsignmentStoreMap";

export const dynamic = "force-dynamic";

export default async function AdminConsignmentMapPage() {
    await requireAdmin();
    return <ConsignmentStoreMap />;
}