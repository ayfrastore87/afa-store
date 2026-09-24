"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";

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
    "/admin/kasir": "Kasir",
    "/admin/kasir/riwayat": "Riwayat Kasir",
    "/admin/mitra": "Mitra",
    "/admin/pelanggan": "Pelanggan",
};

export function AdminDashboardLink({ onClick }: { onClick?: () => void }) {
    const pathname = usePathname();
    const active = pathname === "/admin";

    return (
        <Link
            href="/admin"
            onClick={onClick}
            className={`admin-nav-item flex min-h-12 items-center gap-3 rounded-[15px] px-4 py-3 text-[15px] font-semibold transition duration-200 active:scale-[0.98] ${active ? "admin-nav-active text-white" : "text-white/85 hover:translate-x-0.5 hover:bg-white/[0.08] hover:text-white"}`}
            aria-current={active ? "page" : undefined}
        >
            <Home size={18} className="shrink-0" />
            <span>Dashboard</span>
        </Link>
    );
}

export function AdminHeaderWebsiteButton() {
    return (
        <Link
            href="/"
            className="admin-website-btn flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#2E8B57]/90 px-4 font-semibold text-white shadow-lg shadow-black/10 transition duration-300 hover:scale-[1.03] hover:bg-[#D4AF37] hover:text-[#184D47]"
            aria-label="Buka homepage AFA STORE"
        >
            <Home size={18} />
            <span>Website</span>
        </Link>
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