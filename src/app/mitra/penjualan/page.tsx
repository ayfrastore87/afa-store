import { MitraPenjualan } from "@/components/mitra/mitra-operations";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { gateMitraActive } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Penjualan | AFA MITRA" };

export default async function MitraPenjualanPage() {
    const { code } = await gateMitraActive();

    return (
        <MitraShell title="Riwayat Penjualan" badge={code}>
            <MitraPenjualan />
        </MitraShell>
    );
}
