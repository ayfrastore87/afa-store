import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { orderStatusLabels } from "@/lib/orders";

const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

export default async function OrderDetailPage({ params }: { params: Promise<{ invoice: string }> }) {
    const { invoice } = await params;
    const order = await prisma.order.findUnique({ where: { invoice }, include: { items: true, user: true } });
    if (!order) notFound();

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(201,164,91,0.18),transparent_28%),linear-gradient(135deg,#F8F5EE,#FFFDF8_55%,#EFE6D5)] px-4 py-6 text-[#2E2A26] md:px-6 md:py-8"><div className="mx-auto max-w-6xl"><Link href="/orders" className="font-semibold text-[#8B6B3F] hover:text-[#C9A45B]">← Kembali ke Order</Link><div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><section className="rounded-[28px] bg-white/90 p-5 shadow-[0_24px_70px_rgba(46,42,38,0.10)] backdrop-blur md:p-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#C8A45D]">Detail Order</p><h1 className="mt-3 font-display text-4xl font-bold text-[#123524] md:text-5xl">{order.invoice}</h1><p className="mt-2 text-[#6D6558]">Status: <b>{orderStatusLabels[order.status] || order.status}</b></p><div className="mt-6 grid gap-4">{order.items.map((item) => <div key={item.id} className="flex gap-4 rounded-3xl border border-[#C9A45B]/15 bg-[#FFFBF4] p-4"><div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white"><Image src="/AFA LOGO.svg" alt={item.name} fill className="object-contain p-2" /></div><div className="flex-1"><h2 className="font-display text-xl font-bold text-[#123524]">{item.name}</h2><p className="text-sm text-[#8B6B3F]">Qty: {item.quantity}</p><p className="font-bold text-[#C8A45D]">{money(item.subtotal)}</p></div></div>)}</div></section><aside className="rounded-[28px] bg-[#123524] p-5 text-white shadow-[0_24px_60px_rgba(18,53,36,0.22)] md:p-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#EAD8AB]">Ringkasan</p><div className="mt-5 grid gap-3 text-sm"><Line label="Customer" value={order.customer} /><Line label="Telepon" value={order.phone} /><Line label="Alamat" value={order.address} /><Line label="Subtotal" value={money(order.subtotal)} /><Line label="Ongkir" value={money(order.shipping)} /><Line label="Diskon" value={money(order.discount)} /><div className="border-t border-white/15 pt-3"><Line label="Total" value={money(order.total)} strong /></div></div></aside></div></div></main>;
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return <p className={`flex justify-between gap-3 ${strong ? "text-lg font-black text-[#EAD8AB]" : ""}`}><span>{label}</span><span className="text-right">{value}</span></p>;
}
