import { requireAdmin } from "@/lib/auth";
import KasirAccounts from "@/components/admin/KasirAccounts";
export const dynamic = "force-dynamic";
export default async function AkunKasirPage() { await requireAdmin(); return <KasirAccounts />; }