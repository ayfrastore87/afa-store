import Link from "next/link";

export default async function PaymentPage({ params }: { params: Promise<{ invoice: string }> }) {
    const { invoice } = await params;
    return <main className="grid min-h-screen place-items-center bg-[linear-gradient(135deg,#F8F4EC,#FFFDF8_55%,#EFE6D5)] px-4 text-[#2E2A26]"><section className="max-w-xl rounded-[30px] bg-white p-8 text-center shadow-[0_24px_70px_rgba(46,42,38,0.12)]"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#C8A45D]">Pembayaran</p><h1 className="mt-3 font-display text-4xl font-bold">Order Berhasil Dibuat</h1><p className="mt-4 text-[#8B6B3F]">Invoice <b className="text-[#2E2A26]">{invoice}</b> sudah tersimpan dengan status PENDING. Tim AFA Store akan memproses instruksi pembayaran.</p><Link href="/account" className="mt-6 inline-flex rounded-full bg-[#C8A45D] px-6 py-3 font-bold text-white shadow-[0_14px_32px_rgba(200,164,93,0.28)] hover:bg-[#A9853F]">Lihat Pesanan</Link></section></main>;
}
