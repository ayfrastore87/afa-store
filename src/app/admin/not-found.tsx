import Link from "next/link";
import { AdminBackToDashboard } from "@/components/admin/AdminNav";

export default function AdminNotFound() {
    return (
        <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#fff8df_0,#f7efd9_36%,#e7dcc1_100%)] px-4 text-[#184D47]">
            <div className="w-full max-w-xl rounded-[2rem] bg-white/90 p-8 text-center shadow-2xl">
                <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#C8A14A]">404</p>
                <h1 className="mt-4 text-3xl font-black">Halaman admin tidak ditemukan</h1>
                <p className="mt-3 text-[#184D47]/70">Gunakan tombol di bawah untuk kembali ke dashboard admin.</p>
                <div className="mt-8 flex justify-center">
                    <AdminBackToDashboard />
                </div>
                <div className="mt-4 text-sm text-[#184D47]/60">
                    <Link href="/admin" className="font-semibold text-[#184D47] underline decoration-[#D4AF37] underline-offset-4 hover:text-[#D4AF37]">
                        Dashboard
                    </Link>
                </div>
            </div>
        </main>
    );
}