import { MitraLaporan } from "@/components/mitra/mitra-operations";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { gateMitraActive } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Laporan | AFA MITRA" };

export default async function MitraLaporanPage() {
    const { code } = await gateMitraActive();

    return (
        <MitraShell title="Laporan Penjualan" badge={code}>
            <MitraLaporan />
        </MitraShell>
    );
}
