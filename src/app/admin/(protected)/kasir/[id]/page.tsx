import { requireAdmin } from "@/lib/auth";
import KasirTransactionDetail from "@/components/admin/kasir/KasirTransactionDetail";

export const dynamic = "force-dynamic";

export default async function KasirDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();
    const { id } = await params;
    return <KasirTransactionDetail id={id} />;
}
