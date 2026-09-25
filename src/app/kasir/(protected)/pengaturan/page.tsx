import { requireCashier } from "@/lib/auth";
import KasirSettings from "@/components/kasir/KasirSettings";

export const dynamic = "force-dynamic";

// Server page: the same requireCashier() guard as the (protected) layout already
// resolved the active cashier for this request. Only the display name + email are
// handed to the client (never id / auth_id / role / token).
export default async function PengaturanKasirPage() {
    const user = await requireCashier();
    return <KasirSettings cashier={{ name: user.name, email: user.email }} />;
}