import { redirect } from "next/navigation";

import { MitraLanding } from "@/components/mitra/mitra-landing";
import { resolveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "AFA MITRA | Partner Bisnis AFA STORE",
    description: "Harga khusus, kelola stok, catat penjualan, dan kembangkan usaha bersama AFA STORE.",
};

// Routing aman untuk /mitra:
//   - unauthenticated           → public landing (konsep bisnis)
//   - ACTIVE                    → dashboard (behavior existing)
//   - ACTIVE + ?view=business   → TETAP landing/concept (logo authenticated membuka konsep bisnis)
//   - PENDING/REJECTED/SUSPENDED → behavior existing (tidak pernah diarahkan ke operasional)
export default async function MitraLandingPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    const params = await searchParams;
    const route = await resolveMitra();

    if (route.kind === "active" && params.view !== "business") {
        redirect("/mitra/dashboard");
    }

    return <MitraLanding isActive={route.kind === "active"} />;
}
