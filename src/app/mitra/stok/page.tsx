import { MitraStok } from "@/components/mitra/mitra-operations";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { gateMitraActive } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stok | AFA MITRA" };

export default async function MitraStokPage() {
    const { code } = await gateMitraActive();

    return (
        <MitraShell title="Stok Mitra" badge={code}>
            <MitraStok />
        </MitraShell>
    );
}
