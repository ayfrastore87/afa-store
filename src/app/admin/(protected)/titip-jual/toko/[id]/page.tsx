import { requireAdmin } from "@/lib/auth";
import { ConsignmentStoreDetail } from "@/components/admin/consignment/ConsignmentStoreDetail";

export const dynamic = "force-dynamic";

export default async function AdminConsignmentStorePage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();
    const { id } = await params;
    return <ConsignmentStoreDetail storeId={id} />;
}