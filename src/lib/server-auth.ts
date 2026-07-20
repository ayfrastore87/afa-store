import "server-only";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
    const session = await getSession();
    if (!session) return null;

    return prisma.user.findFirst({
        where: { id: session.id, isActive: true },
        select: { id: true, name: true, email: true, phone: true, image: true, role: true, createdAt: true },
    });
}