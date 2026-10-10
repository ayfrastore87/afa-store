import { requireCashier } from "@/lib/auth";
import KasirPreOrderPanel from "@/components/admin/kasir/KasirPreOrderPanel";

export const dynamic = "force-dynamic";

export default async function KasirPreOrderPage() {
    const user = await requireCashier();
    return <KasirPreOrderPanel cashierName={user.name} />;
}
