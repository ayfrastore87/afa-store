import { requireAdmin } from "@/lib/auth";
import KasirPOS from "@/components/admin/kasir/KasirPOS";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function KasirPage() {
    await requireAdmin();
    return <><div className="mb-4 flex justify-end"><Link href="/kasir" className="rounded-xl bg-[#C9A45B] px-4 py-3 font-black text-[#123524]">Buka Sistem Kasir</Link></div><KasirPOS /></>;
}
