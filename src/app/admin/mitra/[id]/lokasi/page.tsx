import { redirect } from "next/navigation";

import { PartnerLocationPanel } from "@/components/admin/PartnerLocationPanel";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPartnerLocationPage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();

    const { id } = await params;
    const partner = await prisma.partner.findUnique({ where: { id } });

    if (!partner) {
        redirect("/admin/mitra");
    }

    return (
        <PartnerLocationPanel
            partnerId={partner.id}
            partnerName={partner.businessName || partner.displayName}
            partnerCode={partner.partnerCode}
            partnerStatus={partner.status}
        />
    );
}
