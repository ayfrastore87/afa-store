import "server-only";

import { getCurrentUser as getSupabaseUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Partner } from "@prisma/client";

type ApplicationUser = {
    id: string;
    auth_id: string;
    name: string;
    email: string;
    phone: string | null;
    image: string | null;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export async function getCurrentUser(): Promise<ApplicationUser | null> {
    const authUser = await getSupabaseUser();
    if (!authUser) return null;

    try {
        const users = await prisma.$queryRaw<ApplicationUser[]>`
            SELECT id, auth_id, name, email, phone, image, role, "isActive", "createdAt", "updatedAt"
            FROM public.users
            WHERE auth_id = ${authUser.id}
            LIMIT 1
        `;
        const user = users[0];
        if (!user || user.isActive === false) return null;
        return user;
    } catch (error) {
        console.error("Application user lookup failed", {
            category: "application_user_lookup",
            name: error instanceof Error ? error.name : "DatabaseError",
        });
        return null;
    }
}

export async function getCurrentAdmin() {
    const user = await getCurrentUser();
    return user?.role === "admin" && user.isActive !== false ? user : null;
}

export type CurrentPartner = {
    user: ApplicationUser;
    partner: Partner;
};

// Partner authorization is derived server-side from the ACTIVE Partner record,
// never from a browser-supplied role. PENDING / REJECTED / SUSPENDED are not
// considered active and therefore get no partner access.
export async function getCurrentPartner(): Promise<CurrentPartner | null> {
    const user = await getCurrentUser();
    if (!user) return null;

    try {
        const partner = await prisma.partner.findUnique({ where: { userId: user.id } });
        if (!partner || partner.status !== "ACTIVE") return null;
        return { user, partner };
    } catch (error) {
        console.error("Partner lookup failed", {
            category: "partner_lookup",
            name: error instanceof Error ? error.name : "DatabaseError",
        });
        return null;
    }
}
