import { redirect } from "next/navigation";

import { PartnerPricePanel } from "@/components/admin/PartnerPricePanel";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPartnerPricePage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdmin();

    const { id } = await params;
    const partner = await prisma.partner.findUnique({ where: { id } });

    if (!partner) {
        redirect("/admin/mitra");
    }

    return (
        <PartnerPricePanel
            partnerId={partner.id}
            partnerName={partner.businessName || partner.displayName}
            partnerCode={partner.partnerCode}
            partnerStatus={partner.status}
        />
    );
}
