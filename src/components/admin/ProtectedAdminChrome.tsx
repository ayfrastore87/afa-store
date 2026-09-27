"use client";

import AdminThemeToggle from "@/components/admin/AdminThemeToggle";

export default function ProtectedAdminChrome({ children }: { children: React.ReactNode }) {
    return <div className="admin-route-shell"><div className="admin-route-tools" aria-label="Kontrol tampilan admin"><AdminThemeToggle /></div>{children}</div>;
}