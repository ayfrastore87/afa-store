import type { Metadata } from "next";
import { requireCashier } from "@/lib/auth";
import Link from "next/link";
import { ClipboardList, FileText, History, Menu, Settings, ShoppingCart, LogOut } from "lucide-react";
import { KASIR_APP_DESCRIPTION, KASIR_APP_NAME, KASIR_MANIFEST_PATH } from "@/lib/kasir-pwa";

export const dynamic = "force-dynamic";

// PWA identity for the kasir only. Next merges this with the root metadata, so
// the customer site keeps /manifest.webmanifest while every kasir page links the
// "AFA KASIR" manifest (separate installable app, see src/lib/kasir-pwa.ts).
export const metadata: Metadata = {
    title: { default: KASIR_APP_NAME, template: `%s | ${KASIR_APP_NAME}` },
    description: KASIR_APP_DESCRIPTION,
    applicationName: KASIR_APP_NAME,
    manifest: KASIR_MANIFEST_PATH,
    appleWebApp: { capable: true, title: KASIR_APP_NAME, statusBarStyle: "black-translucent" },
    robots: { index: false, follow: false },
};

// Authoritative server-side guard for every protected /kasir route.
// This layout belongs to the `(protected)` route group so it NEVER wraps
// /kasir/login; otherwise requireCashier() would redirect the login page to
// itself and the browser would report ERR_TOO_MANY_REDIRECTS.
export default async function KasirLayout({ children }: { children: React.ReactNode }) {
    const user = await requireCashier();
    const menu = [['Transaksi','/kasir',ShoppingCart],['Pesanan','/kasir/pesanan',ClipboardList],['Riwayat','/kasir/riwayat',History],['Laporan','/kasir/laporan',FileText],['Pengaturan','/kasir/pengaturan',Settings]] as const;
    return <div className="kasir-shell min-h-[100dvh] bg-[#F8F5EE] text-[#123524]">
        <aside className="kasir-sidebar hidden lg:flex"><Link href="/kasir" className="mb-10 block"><span className="block text-xl font-black">AFA STORE</span><span className="text-xs font-black uppercase tracking-[.3em] text-[#D4AF37]">Kasir</span></Link><nav className="space-y-2">{menu.map(([label, href, Icon]) => <Link key={href} href={href} className="kasir-nav-link"><Icon size={19} />{label}</Link>)}</nav><div className="mt-auto border-t border-white/15 pt-5"><p className="truncate text-sm font-bold text-white">{user.name}</p><p className="mb-4 text-xs text-white/55">Kasir aktif</p><form action="/api/auth/logout" method="post"><button type="submit" className="kasir-nav-link w-full text-white/70"><LogOut size={18} />Keluar</button></form></div></aside>
        <div className="kasir-content"><header className="kasir-mobile-header lg:hidden"><Link href="/kasir"><b>AFA STORE</b><span>KASIR</span></Link><span className="kasir-avatar">{user.name.slice(0,1).toUpperCase()}</span></header><main className="min-w-0">{children}</main></div>
        <nav className="kasir-bottom-nav lg:hidden">{[...menu.slice(0,4),['Menu','#',Menu] as const].map(([label, href, Icon]) => <Link key={label} href={href} className="kasir-bottom-link"><Icon size={19}/><span>{label}</span></Link>)}</nav>
    </div>;
}