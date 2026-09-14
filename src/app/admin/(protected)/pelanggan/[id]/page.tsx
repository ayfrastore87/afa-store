import { redirect } from "next/navigation";

import { CustomerAdminDetailPanel } from "@/components/admin/CustomerAdminDetailPanel";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPelangganDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();

    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });

    if (!user) {
        redirect("/admin/pelanggan");
    }

    return <CustomerAdminDetailPanel customerId={user.id} />;
}