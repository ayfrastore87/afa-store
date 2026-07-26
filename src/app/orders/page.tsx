import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";
import { orderStatusLabels } from "@/lib/orders";

const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

export default async function OrdersPage() {
    const user = await getCurrentUser();
    if (!user) notFound();

    const orders = await prisma.order.findMany({
        where: { userId: user.id },
        include: { items: true },
        orderBy: { createdAt: "desc" },
    });

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(201,164,91,0.18),transparent_28%),linear-gradient(135deg,#F8F5EE,#FFFDF8_55%,#EFE6D5)] px-4 py-6 text-[#2E2A26] md:px-6 md:py-8"><div className="mx-auto max-w-6xl"><div className="flex items-center justify-between gap-4"><Link href="/account" className="font-semibold text-[#8B6B3F] hover:text-[#C9A45B]">← Akun Saya</Link><Link href="/checkout" className="rounded-full bg-[#123524] px-4 py-2 text-sm font-bold text-white">Checkout Baru</Link></div><section className="mt-6 rounded-[28px] bg-white/90 p-5 shadow-[0_24px_70px_rgba(46,42,38,0.10)] backdrop-blur md:p-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#C8A45D]">Riwayat Order</p><h1 className="mt-3 font-display text-4xl font-bold text-[#123524] md:text-5xl">Semua Pesanan Anda</h1>{orders.length ? <div className="mt-6 grid gap-4">{orders.map((order) => <article key={order.id} className="rounded-[24px] border border-[#C9A45B]/15 bg-[#FFFBF4] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#8B6B3F]">Invoice</p><Link href={`/order/${order.invoice}`} className="text-2xl font-bold text-[#123524] hover:text-[#C9A45B]">{order.invoice}</Link><p className="mt-1 text-sm text-[#6D6558]">{new Date(order.createdAt).toLocaleString("id-ID")}</p></div><div className="rounded-full bg-[#123524] px-4 py-2 text-sm font-bold text-white">{orderStatusLabels[order.status] || order.status}</div></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div><p className="text-sm text-[#8B6B3F]">Customer</p><p className="font-semibold">{order.customer}</p></div><div><p className="text-sm text-[#8B6B3F]">Total</p><p className="font-semibold">{money(order.total)}</p></div><div><p className="text-sm text-[#8B6B3F]">Item</p><p className="font-semibold">{order.items.length} paket</p></div></div></article>)}</div> : <div className="mt-6 rounded-3xl border border-dashed border-[#C9A45B]/40 bg-[#FFFBF4] p-8 text-center text-[#8B6B3F]">Belum ada pesanan. Silakan buat order dari halaman checkout.</div>}</section></div></main>;
}
