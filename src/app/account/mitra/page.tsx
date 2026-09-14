import { redirect } from "next/navigation";

import { publicUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer, getCurrentUser } from "@/lib/server-auth";
import { PartnerApplication } from "@/components/account/partner-application";

export const dynamic = "force-dynamic";

export default async function MitraPage() {
    const user = await getCurrentUser();
    // Unauthenticated → customer login.
    if (!user) redirect("/login?next=/account/mitra");
    // Admin is never a customer / mitra applicant.
    if (user.role === "admin") redirect("/admin");
    // Only an active "customer" role may enter the partner application flow.
    const customer = await getCurrentCustomer();
    if (!customer) redirect("/login?next=/account/mitra");

    const partner = await prisma.partner.findUnique({ where: { userId: customer.id } });

    return <PartnerApplication initialUser={publicUser(customer)} initialPartner={partner} />;
}
