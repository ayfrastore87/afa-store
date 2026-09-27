import { requireAdmin } from "@/lib/auth";
import ProtectedAdminChrome from "@/components/admin/ProtectedAdminChrome";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Authoritative server-side guard for every protected /admin route.
    // Unauthenticated, customer, mitra-only (cookie), or inactive/non-admin
    // users are redirected to /admin/login before any admin HTML is rendered.
    await requireAdmin();

    return (
        <ProtectedAdminChrome>{children}</ProtectedAdminChrome>
    );
}
