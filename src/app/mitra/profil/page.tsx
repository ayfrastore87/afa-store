import { MitraProfile } from "@/components/mitra/mitra-profile";
import { MitraShell } from "@/components/mitra/mitra-shell";
import { gateMitraActive } from "@/lib/mitra-auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profil | AFA MITRA" };

export default async function MitraProfilPage() {
    const { code } = await gateMitraActive();

    return (
        <MitraShell title="Akun Mitra" badge={code}>
            <MitraProfile />
        </MitraShell>
    );
}
