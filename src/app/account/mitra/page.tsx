import { redirect } from "next/navigation";

import { publicUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";
import { PartnerApplication } from "@/components/account/partner-application";

export const dynamic = "force-dynamic";

export default async function MitraPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=/account/mitra");

    const partner = await prisma.partner.findUnique({ where: { userId: user.id } });

    return <PartnerApplication initialUser={publicUser(user)} initialPartner={partner} />;
}
