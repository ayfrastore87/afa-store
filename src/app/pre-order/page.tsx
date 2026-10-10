import type { Metadata } from "next";
import Link from "next/link";
import GuestPreOrderForm from "@/components/pre-order/GuestPreOrderForm";

export const metadata: Metadata = {
    title: "Pre-Order | AFA STORE",
    description: "Ajukan pre-order produk AFA STORE tanpa perlu login. Pilih produk, jumlah, tanggal pengambilan, lalu kami konfirmasi via WhatsApp.",
    alternates: { canonical: "https://afastore.online/pre-order" },
};

export default function PreOrderPage() {
    return (
        <main className="min-h-screen bg-[#F8F5EE] px-4 py-8 text-[#123524] sm:px-6">
            <div className="mx-auto max-w-5xl space-y-6">
                <header className="space-y-2">
                    <Link href="/" className="text-sm font-semibold text-[#A7833A] hover:underline">← Kembali ke AFA STORE</Link>
                    <p className="text-xs font-black uppercase tracking-[.22em] text-[#C9A45B]">Pre-Order</p>
                    <h1 className="font-display text-3xl font-bold sm:text-4xl">Pesan Lebih Awal, Ambil Sesuai Jadwal</h1>
                    <p className="max-w-2xl text-sm text-[#6D6558] sm:text-base">
                        Tanpa login. Pilih produk dan jumlah, tentukan tanggal pengambilan, lalu isi nama dan nomor WhatsApp.
                        Tim kami akan mengonfirmasi pesanan dan DP/pelunasan dapat dilakukan di toko.
                    </p>
                </header>
                <GuestPreOrderForm />
            </div>
        </main>
    );
}
