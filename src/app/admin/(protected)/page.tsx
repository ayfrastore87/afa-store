import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

// Server wrapper for the admin dashboard. The route-group layout above calls
// requireAdmin() and is the authoritative guard; this page simply renders the
// client UI once authorized.
export default function AdminPage() {
    return <AdminDashboard />;
}
