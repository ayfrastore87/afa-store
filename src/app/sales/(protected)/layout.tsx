import type { Metadata } from "next";
import Link from "next/link";
import { requireSales } from "@/lib/auth";
import { SalesBottomNav } from "@/components/sales/SalesBottomNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: { default: "AFA SALES", template: "%s | AFA SALES" },
    robots: { index: false, follow: false },
};

// Authoritative server-side guard for every protected /sales route. Lives in
// the `(protected)` route group so it NEVER wraps /sales/login (the same
// self-redirect rule as the kasir layout).
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
    const current = await requireSales();

    return (
        <div className="sales-shell min-h-[100dvh] bg-[#F8F5EE] pb-24 text-[#123524]">
            <header className="sales-header sticky top-0 z-30 flex items-center justify-between border-b border-[#123524]/10 bg-[#F8F5EE]/95 px-5 py-4 backdrop-blur">
                <Link href="/sales" className="leading-tight">
                    <span className="block text-lg font-black tracking-tight">AFA STORE</span>
                    <span className="block text-[10px] font-black uppercase tracking-[.3em] text-[#D4AF37]">Sales</span>
                </Link>
                <span className="sales-avatar grid h-10 w-10 place-items-center rounded-full bg-[#184D47] font-black text-[#F8F5EE]">
                    {current.sales.name.slice(0, 1).toUpperCase()}
                </span>
            </header>
            <main className="mx-auto w-full max-w-2xl px-4 py-5">{children}</main>
            <SalesBottomNav />
        </div>
    );
}