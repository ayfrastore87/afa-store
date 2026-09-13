import { MitraProfile } from "@/components/mitra/mitra-profile";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { requireActiveMitra } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profil | AFA MITRA" };

export default async function MitraProfilPage() {
    const { code } = await requireActiveMitra();

    return (
        <MitraShell title="Akun Mitra" badge={code}>
            <MitraProfile />
        </MitraShell>
    );
}
