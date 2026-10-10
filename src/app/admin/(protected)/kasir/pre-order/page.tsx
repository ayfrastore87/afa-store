import { requireAdmin } from "@/lib/auth";
import KasirPreOrderPanel from "@/components/admin/kasir/KasirPreOrderPanel";
import AdminPreOrderCreate from "@/components/admin/pre-order/AdminPreOrderCreate";

export const dynamic = "force-dynamic";

// Admin view of the same kasir PO panel (search / DP / pelunasan / serah terima)
// plus manual PO entry. Uses the kasir API (admin is a superset of cashier).
export default async function AdminPreOrderPage() {
    const user = await requireAdmin();
    return (
        <div className="space-y-6">
            <AdminPreOrderCreate />
            <KasirPreOrderPanel cashierName={user.name} />
        </div>
    );
}
