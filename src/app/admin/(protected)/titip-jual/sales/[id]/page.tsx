import { requireAdmin } from "@/lib/auth";
import { ConsignmentSalesDetail } from "@/components/admin/consignment/ConsignmentSalesDetail";

export const dynamic = "force-dynamic";

export default async function AdminConsignmentSalesDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();
    const { id } = await params;
    return <ConsignmentSalesDetail salesId={id} />;
}