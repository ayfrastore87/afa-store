import { notFound } from "next/navigation";
import { QrisPayment } from "@/components/payment/QrisPayment";
import { SITE_URL } from "@/lib/site-url";

const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const labels = ["Pesanan Dibuat", "Menunggu Pembayaran", "Pembayaran Diterima", "Sedang Diproses", "Siap / Dikirim", "Selesai"];

export default async function PublicOrderPage({ params }: { params: Promise<{ publicToken: string }> }) {
    const { publicToken } = await params;
    const response = await fetch(`${SITE_URL}/api/orders/public/${encodeURIComponent(publicToken)}`, { cache: "no-store" });
    if (!response.ok) notFound();
    const order = await response.json();
    const paid = ["PAID", "SETTLEMENT"].includes(String(order.paymentStatus).toUpperCase());
    const cancelled = ["CANCELLED", "CANCELED"].includes(String(order.status).toUpperCase());
    const active = cancelled ? -1 : paid ? (order.status === "COMPLETED" ? 5 : 3) : 1;
    return <main className="min-h-screen bg-[#f8f5ee] px-4 py-8 text-[#2e2a26]"><div className="mx-auto max-w-2xl space-y-5">
        <header><p className="text-sm font-black tracking-[.2em] text-[#c9a45b]">AFA STORE</p><p className="text-sm text-[#6d6558]">Dari Kami Untuk Keluarga</p></header>
        <section className="rounded-3xl bg-white p-5 shadow-sm"><p className="text-xs font-black tracking-[.2em] text-[#c9a45b]">PESANAN</p><h1 className="mt-2 text-2xl font-black text-[#123524]">#{order.invoice}</h1><span className="mt-3 inline-block rounded-full bg-[#123524] px-3 py-1 text-xs font-bold text-white">{cancelled ? "Dibatalkan" : order.statusLabel}</span></section>
        <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black text-[#123524]">ITEM PESANAN</h2><div className="mt-4 space-y-4">{order.items.map((item: any, i: number) => <div key={i} className="flex justify-between gap-3 border-b border-black/5 pb-3"><div><p className="font-bold">{item.name}</p><p className="text-sm text-[#6d6558]">{item.quantity} × {money(item.unitPrice)}{item.description ? ` · ${item.description}` : ""}</p></div><b>{money(item.subtotal)}</b></div>)}</div></section>
        <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black text-[#123524]">RINGKASAN</h2><div className="mt-4 space-y-2 text-sm"><Line label="Subtotal" value={money(order.subtotal)} /><Line label="Diskon" value={money(order.discount)} /><Line label="Ongkir" value={money(order.shippingCost)} /><Line label="TOTAL" value={money(order.grandTotal)} strong /></div></section>
        {!cancelled && <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black text-[#123524]">STATUS PESANAN</h2><div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">{labels.map((label, i) => <div key={label} className={`rounded-xl p-3 font-bold ${i <= active ? "bg-[#123524] text-white" : "bg-[#f2eee5] text-[#6d6558]"}`}>{label}</div>)}</div></section>}
        {paid ? <section className="rounded-3xl bg-[#123524] p-5 text-center text-white"><p className="text-lg font-black">✓ PEMBAYARAN DITERIMA</p><p className="mt-2 text-[#ead8ab]">{money(order.grandTotal)}</p></section> : !cancelled ? <section className="rounded-3xl bg-white p-5 shadow-sm"><QrisPayment total={order.grandTotal} /></section> : null}
        {order.shipping && <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black text-[#123524]">PENGIRIMAN</h2><p className="mt-2 text-sm">{order.shipping.courier ?? "-"} · {order.shipping.service ?? "-"}<br />Resi: {order.shipping.trackingNumber ?? "Belum tersedia"}</p></section>}
    </div></main>;
}
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <p className={`flex justify-between ${strong ? "border-t pt-3 text-lg font-black text-[#123524]" : ""}`}><span>{label}</span><span>{value}</span></p>; }