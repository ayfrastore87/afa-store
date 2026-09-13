import { MitraKasir } from "@/components/mitra/mitra-operations";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { requireActiveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Kasir | AFA MITRA" };

export default async function MitraKasirPage() {
    const { code } = await requireActiveMitra();

    return (
        <MitraShell title="Kasir Mitra" badge={code}>
            <MitraKasir />
        </MitraShell>
    );
}
