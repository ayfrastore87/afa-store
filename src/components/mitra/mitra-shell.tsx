"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, FileText, Home, LayoutDashboard, MapPin, Receipt, ShoppingCart, User } from "lucide-react";

import { MITRA_BG } from "@/components/mitra/mitra-theme";

// ---------------------------------------------------------------------------
// AFA MITRA — app shell with a compact header and a 5-item sticky bottom nav
// (Tahap 7, 15). "Beranda / Produk / Kasir / Laporan / Akun"; the ops menus
// (Stok, Penjualan, Lokasi) live under Lainnya + dashboard quick actions so we
// never stack 8 icons on mobile.
// ---------------------------------------------------------------------------

type NavItem = { href: string; label: string; icon: typeof Home };

const BOTTOM: NavItem[] = [
    { href: "/mitra/dashboard", label: "Beranda", icon: Home },
    { href: "/mitra/produk", label: "Produk", icon: Boxes },
    { href: "/mitra/kasir", label: "Kasir", icon: ShoppingCart },
    { href: "/mitra/laporan", label: "Laporan", icon: FileText },
    { href: "/mitra/profil", label: "Akun", icon: User },
];

const MORE: NavItem[] = [
    { href: "/mitra/stok", label: "Stok", icon: Boxes },
    { href: "/mitra/penjualan", label: "Penjualan", icon: Receipt },
    { href: "/mitra/lokasi", label: "Lokasi", icon: MapPin },
];

function isActive(path: string, href: string) {
    if (href === "/mitra/dashboard") return path === href;
    return path === href || path.startsWith(`${href}/`);
}

export function MitraShell({
    title,
    badge,
    children,
}: {
    title: string;
    badge?: string;
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <div className={`min-h-screen ${MITRA_BG} pb-28 text-[#184D47]`}>
            <header className="sticky top-0 z-30 border-b border-[#C9A45B]/20 bg-[#F8F5EE]/90 shadow-[0_8px_28px_rgba(18,53,36,0.06)] backdrop-blur-xl">
                <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
                    <Link href="/mitra" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#184D47] text-[#D4AF37]" aria-label="AFA MITRA">
                        <LayoutDashboard size={20} />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#C9A45B]">AFA MITRA</p>
                        <h1 className="truncate text-lg font-black leading-tight">{title}</h1>
                    </div>
                    {badge ? (
                        <span className="shrink-0 rounded-full bg-[#184D47]/8 px-3 py-1 text-xs font-black text-[#184D47]">{badge}</span>
                    ) : null}
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>

            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#C9A45B]/20 bg-[#F8F5EE]/95 backdrop-blur-xl">
                <div className="mx-auto grid max-w-5xl grid-cols-5">
                    {BOTTOM.map((item) => {
                        const active = isActive(pathname, item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition ${
                                    active ? "text-[#184D47]" : "text-[#184D47]/45 hover:text-[#184D47]"
                                }`}
                            >
                                <item.icon size={20} className={active ? "text-[#C9A45B]" : ""} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}

// Quick link strip used on the dashboard for the secondary menus (Tahap 6).
export function MitraQuickLinks() {
    return (
        <div className="grid grid-cols-3 gap-2">
            {MORE.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-white/70 bg-white/70 text-xs font-bold text-[#184D47] transition hover:bg-white active:scale-95"
                >
                    <item.icon size={20} className="text-[#C9A45B]" />
                    <span>{item.label}</span>
                </Link>
            ))}
        </div>
    );
}

export function MitraTag({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#184D47]/8 px-2.5 py-1 text-[11px] font-black text-[#184D47]">
            {children}
        </span>
    );
}
