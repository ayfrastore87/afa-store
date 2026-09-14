import { requireAdmin } from "@/lib/auth";
import KasirHistory from "@/components/admin/kasir/KasirHistory";

export const dynamic = "force-dynamic";

export default async function KasirRiwayatPage() {
    await requireAdmin();
    return <KasirHistory />;
}
