import { MitraLokasi } from "@/components/mitra/mitra-operations";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { requireActiveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Live Location | AFA MITRA" };

export default async function MitraLokasiPage() {
    const { code } = await requireActiveMitra();

    return (
        <MitraShell title="Live Location" badge={code}>
            <MitraLokasi />
        </MitraShell>
    );
}
