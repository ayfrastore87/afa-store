"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Store, PlusCircle, Wallet, UserCircle } from "lucide-react";

const items = [
    { href: "/sales", label: "Beranda", icon: Home },
    { href: "/sales/toko", label: "Toko", icon: Store },
    { href: "/sales/kunjungan", label: "Kunjungan", icon: PlusCircle, primary: true },
    { href: "/sales/setoran", label: "Setoran", icon: Wallet },
    { href: "/sales/akun", label: "Akun", icon: UserCircle },
] as const;

export function SalesBottomNav() {
    const pathname = usePathname();

    return (
        <nav className="sales-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-[#123524]/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Navigasi sales">
            <div className="mx-auto grid max-w-2xl grid-cols-5">
                {items.map(({ href, label, icon: Icon, ...rest }) => {
                    const primary = "primary" in rest && rest.primary;
                    const active = pathname === href || (href !== "/sales" && pathname.startsWith(`${href}/`));
                    if (primary) {
                        return (
                            <Link key={href} href={href} className="flex flex-col items-center justify-center py-1.5" aria-current={active ? "page" : undefined}>
                                <span className="grid h-12 w-12 -translate-y-3 place-items-center rounded-full bg-[#184D47] text-[#F8F5EE] shadow-lg shadow-[#184D47]/30">
                                    <Icon size={24} />
                                </span>
                                <span className="-mt-2 text-[10px] font-bold text-[#184D47]">{label}</span>
                            </Link>
                        );
                    }
                    return (
                        <Link
                            key={href}
                            href={href}
                            aria-current={active ? "page" : undefined}
                            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active ? "text-[#184D47]" : "text-[#123524]/45"}`}
                        >
                            <Icon size={20} />
                            <span>{label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}