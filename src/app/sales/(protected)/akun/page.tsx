import { requireSales } from "@/lib/auth";
import { LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SalesAccountPage() {
    const current = await requireSales();

    return (
        <div className="space-y-4">
            <h1 className="text-xl font-black">Akun</h1>
            <div className="sales-card rounded-2xl bg-white p-5 shadow-sm shadow-[#123524]/5">
                <p className="text-lg font-black">{current.sales.name}</p>
                <p className="text-sm font-semibold text-[#123524]/55">{current.user.email}</p>
                {current.sales.phone && <p className="text-sm font-semibold text-[#123524]/55">{current.sales.phone}</p>}
                <p className="mt-2 inline-block rounded-full bg-[#e8f3e3] px-3 py-1 text-xs font-black text-[#29621a]">SALES AKTIF</p>
            </div>
            <form action="/api/auth/logout" method="post">
                <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white font-black text-red-600">
                    <LogOut size={18} /> Keluar
                </button>
            </form>
        </div>
    );
}