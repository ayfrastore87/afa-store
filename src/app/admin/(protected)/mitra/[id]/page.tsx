import { redirect } from "next/navigation";

import { PartnerAdminDetailPanel } from "@/components/admin/PartnerAdminDetailPanel";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();

    const { id } = await params;
    const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true } });

    if (!partner) {
        redirect("/admin/mitra");
    }

    return <PartnerAdminDetailPanel partnerId={partner.id} />;
}
