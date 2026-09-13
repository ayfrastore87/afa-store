import { MitraProduk } from "@/components/mitra/mitra-produk";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { requireActiveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Produk Mitra | AFA MITRA" };

export default async function MitraProdukPage() {
    const { code } = await requireActiveMitra();

    return (
        <MitraShell title="Produk Mitra" badge={code}>
            <MitraProduk />
        </MitraShell>
    );
}
