import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PaymentProofForm } from "@/components/payment/payment-proof-form";

export default async function PaymentPage({ params }: { params: Promise<{ invoice: string }> }) {
    const { invoice } = await params;
    const order = await prisma.order.findUnique({ where: { invoice } });
    if (!order) notFound();

    const qrisSrc = "/payment/qris.png";

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(201,164,91,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(18,53,36,0.12),transparent_30%),linear-gradient(135deg,#F8F5EE,#FFFDF8_55%,#EFE6D5)] px-4 py-6 text-[#2E2A26] md:px-6 md:py-8"><div className="mx-auto max-w-6xl"><div className="rounded-[30px] border border-white/70 bg-white/70 p-5 shadow-[0_24px_70px_rgba(18,53,36,0.10)] backdrop-blur md:p-8"><div className="flex flex-col gap-3 text-center"><p className="text-sm font-bold uppercase tracking-[0.22em] text-[#C9A45B]">Pembayaran Pesanan</p><h1 className="font-display text-4xl font-bold text-[#123524] md:text-5xl">Scan QRIS, Upload Bukti, Selesai</h1><p className="mx-auto max-w-2xl text-[#6D6558]">Invoice <b className="text-[#123524]">{order.invoice}</b> sudah dibuat. Silakan scan QRIS AFA Store, unggah bukti pembayaran, lalu klik <b>Saya Sudah Bayar</b>.</p></div><div className="mt-8"><PaymentProofForm invoice={order.invoice} total={order.total} paymentMethod={order.paymentMethod} paymentStatus={order.paymentStatus} qrisSrc={qrisSrc} /></div><div className="mt-8 flex flex-wrap justify-center gap-3 text-sm font-semibold text-[#123524]"><span className="rounded-full bg-[#F8F5EE] px-4 py-2">1. Scan QRIS</span><span className="rounded-full bg-[#F8F5EE] px-4 py-2">2. Upload Bukti</span><span className="rounded-full bg-[#F8F5EE] px-4 py-2">3. Konfirmasi</span></div><div className="mt-8 text-center"><Link href="/account" className="inline-flex rounded-full bg-[#C9A45B] px-6 py-3 font-bold text-white shadow-[0_14px_32px_rgba(201,164,91,0.28)] hover:bg-[#A9853F]">Lihat Pesanan</Link></div></div></div></main>;
}
