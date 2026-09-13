import { NextResponse } from "next/server";

import { getCurrentMitraAccount } from "@/lib/mitra-auth";

export const runtime = "nodejs";

// Returns minimal identity. Never exposes passwordHash or any customer User data.
export async function GET() {
    const account = await getCurrentMitraAccount();
    if (!account) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    return NextResponse.json({
        user: {
            accountId: account.id,
            username: account.username,
            email: account.email,
            isActive: account.isActive,
            lastLoginAt: account.lastLoginAt,
            partner: {
                id: account.partner.id,
                partnerCode: account.partner.partnerCode,
                partnerType: account.partner.partnerType,
                status: account.partner.status,
                displayName: account.partner.displayName,
                businessName: account.partner.businessName,
                phone: account.partner.phone,
                address: account.partner.address,
                village: account.partner.village,
                district: account.partner.district,
                city: account.partner.city,
                postalCode: account.partner.postalCode,
            },
        },
    });
}
