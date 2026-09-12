import "server-only";

import { redirect } from "next/navigation";
import type { Partner } from "@prisma/client";

import { getCurrentUser } from "@/lib/server-auth";

// ---------------------------------------------------------------------------
// AFA MITRA — shared presentation-layer auth gate (Tahap 3).
//
// The /mitra/* app is a presentation layer over the existing AFA STORE account,
// Partner model and auth. It never creates a second auth system, a second
// database, or a second Partner model. All status routing here is derived from
// the server-side Partner record of the authenticated user.
// ---------------------------------------------------------------------------

export type Applicant = { name: string | null; phone: string | null };

export type MitraRoute =
    | { kind: "unauthenticated" }
    | { kind: "not_partner"; user: Applicant }
    | { kind: "pending"; partner: Partner }
    | { kind: "suspended"; partner: Partner }
    | { kind: "rejected"; partner: Partner }
    | { kind: "active"; partner: Partner };

// Resolve the current user's partner record and map it to the correct /mitra
// destination. A customer who has not applied (no Partner row) is directed to
// /mitra/daftar; PENDING -> pengajuan; SUSPENDED / REJECTED get their own views;
// only ACTIVE reaches the operational dashboard.
export async function resolveMitra(): Promise<MitraRoute> {
    const user = await getCurrentUser();
    if (!user) return { kind: "unauthenticated" };

    const { prisma } = await import("@/lib/prisma");
    const partner = await prisma.partner.findUnique({ where: { userId: user.id } });

    if (!partner) return { kind: "not_partner", user: { name: user.name, phone: user.phone } };
    if (partner.status === "ACTIVE") return { kind: "active", partner };
    if (partner.status === "SUSPENDED") return { kind: "suspended", partner };
    if (partner.status === "REJECTED") return { kind: "rejected", partner };
    return { kind: "pending", partner };
}

// Server gate for the operational /mitra/* routes (dashboard, produk, stok,
// kasir, penjualan, laporan, lokasi, profil): ACTIVE-only. Non-active statuses
// are bounced server-side to the correct destination before any render.
export async function gateMitraActive(): Promise<{ name: string; code: string; partner: Partner }> {
    const route = await resolveMitra();
    if (route.kind === "unauthenticated") redirect("/mitra/login?next=/mitra/dashboard");
    if (route.kind === "not_partner") redirect("/mitra/daftar");
    if (route.kind === "pending" || route.kind === "suspended" || route.kind === "rejected") {
        redirect("/mitra/pengajuan");
    }
    return { name: route.partner.businessName || route.partner.displayName, code: route.partner.partnerCode, partner: route.partner };
}
