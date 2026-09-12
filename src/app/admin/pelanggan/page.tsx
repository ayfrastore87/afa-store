import { requireAdmin } from "@/lib/auth";
import { CustomerAdminPanel } from "@/components/admin/CustomerAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPelangganPage() {
    await requireAdmin();
    return <CustomerAdminPanel />;
}