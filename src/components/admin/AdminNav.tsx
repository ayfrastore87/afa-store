"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Globe2, Home, Store } from "lucide-react";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "/";

const breadcrumbs: Record<string, string> = {
    "/admin/products": "Produk",
    "/admin/products/new": "Tambah Produk",
    "/admin/orders": "Pesanan",
    "/admin/account": "Akun",
    "/admin/stock": "Stok Barang",
    "/admin/reports": "Laporan",
    "/admin/settings": "Pengaturan",
    "/admin/produk": "Produk",
    "/admin/pesanan": "Pesanan",
    "/admin/stok": "Stok",
    "/admin/laporan": "Laporan",
    "/admin/pengaturan": "Pengaturan",
    "/admin/tambah": "Tambah Produk",
    "/admin/akun": "Akun",
};

export function AdminDashboardLink() {
    const pathname = usePathname();
    const active = pathname === "/admin";

    return (
        <Link
            href="/admin"
            className={`flex items-center gap-3 rounded-[12px] bg-[#0F4C45] px-4 py-3 font-semibold text-white transition-colors duration-200 hover:bg-[#D4AF37] hover:text-[#0F4C45] ${active ? "ring-2 ring-[#D4AF37]/45" : ""}`}
            aria-current={active ? "page" : undefined}
        >
            <Home size={18} className="shrink-0" />
            <span>Dashboard</span>
        </Link>
    );
}

export function AdminWebsiteButton({ compact = false }: { compact?: boolean }) {
    const router = useRouter();

    return (
        <button
            type="button"
            onClick={() => router.push(SITE_URL)}
            className={`group flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#0F766E] to-[#D4AF37] p-4 font-black text-white shadow-md transition duration-300 hover:scale-[1.03] hover:shadow-[0_0_28px_rgba(212,175,55,0.55)] ${compact ? "px-3 py-3" : ""}`}
            aria-label="Kembali ke AFA STORE"
        >
            <Store size={20} className="shrink-0" />
            <span className={compact ? "hidden" : "hidden sm:inline"}>Kembali ke AFA STORE</span>
        </button>
    );
}

export function AdminWebsiteFooterButton() {
    const router = useRouter();

    return (
        <button
            type="button"
            onClick={() => router.push(SITE_URL)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-3 text-sm font-bold text-white/85 transition duration-300 hover:scale-[1.03] hover:border-[#D4AF37] hover:text-[#D4AF37]"
        >
            <Globe2 size={16} />
            <span>Buka Website</span>
        </button>
    );
}

export function AdminHeaderWebsiteButton() {
    const router = useRouter();

    return (
        <button
            type="button"
            onClick={() => router.push(SITE_URL)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 font-semibold text-white transition duration-300 hover:scale-[1.03] hover:bg-[#D4AF37] hover:text-[#184D47]"
        >
            <Home size={18} />
            <span className="hidden sm:inline">Website</span>
        </button>
    );
}

export function AdminBreadcrumb() {
    const pathname = usePathname();
    const label = breadcrumbs[pathname];

    if (!label) {
        return null;
    }

    return (
        <nav aria-label="Breadcrumb" className="mb-5 text-sm font-medium text-[#184D47]/70">
            <Link href="/admin" className="font-semibold text-[#184D47] transition-colors hover:text-[#D4AF37]">
                Dashboard
            </Link>
            <span className="mx-2">/</span>
            <span>{label}</span>
        </nav>
    );
}

export function AdminBackToDashboard() {
    return (
        <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-[12px] bg-[#0F4C45] px-4 py-3 font-semibold text-white transition-colors duration-200 hover:bg-[#D4AF37] hover:text-[#0F4C45]"
        >
            <span aria-hidden="true">←</span>
            <span>Kembali ke Dashboard</span>
        </Link>
    );
}