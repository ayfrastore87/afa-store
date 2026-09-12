import { MitraProduk } from "@/components/mitra/mitra-produk";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { gateMitraActive } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Produk Mitra | AFA MITRA" };

export default async function MitraProdukPage() {
    const { code } = await gateMitraActive();

    return (
        <MitraShell title="Produk Mitra" badge={code}>
            <MitraProduk />
        </MitraShell>
    );
}
