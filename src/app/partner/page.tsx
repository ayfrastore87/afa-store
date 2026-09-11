import { redirect } from "next/navigation";

import { PartnerDashboard } from "@/components/partner/partner-dashboard";
import { getCurrentPartner } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function PartnerPage() {
    const current = await getCurrentPartner();

    if (!current) {
        redirect("/account/mitra");
    }

    return (
        <PartnerDashboard
            partner={{
                partnerCode: current.partner.partnerCode,
                displayName: current.partner.displayName,
                businessName: current.partner.businessName,
                partnerType: current.partner.partnerType,
            }}
        />
    );
}
