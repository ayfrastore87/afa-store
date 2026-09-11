import { requireAdmin } from "@/lib/auth";
import KasirPOS from "@/components/admin/kasir/KasirPOS";

export const dynamic = "force-dynamic";

export default async function KasirPage() {
    await requireAdmin();
    return <KasirPOS />;
}
