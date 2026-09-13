import { MitraDashboard } from "@/components/mitra/mitra-dashboard";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { requireActiveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard | AFA MITRA" };

export default async function MitraDashboardPage() {
    const { name, code } = await requireActiveMitra();

    return (
        <MitraShell title={name} badge={code}>
            <MitraDashboard name={name} code={code} />
        </MitraShell>
    );
}
