import Link from "next/link";
import { notFound } from "next/navigation";
import { getPreOrderByPublicToken, serializePublicPreOrder } from "@/lib/pre-order";
import { preOrderKindLabel, preOrderPaymentStatusLabel, preOrderStatusLabel } from "@/lib/pre-order-core";
import { whatsappUrl } from "@/lib/client-auth";

export const dynamic = "force-dynamic";

const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");
const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID", { dateStyle: "long" }) : "-");
const METHOD: Record<string, string> = { TUNAI: "Tunai", QRIS: "QRIS", TRANSFER_BANK: "Transfer Bank" };
const STEPS = ["Pengajuan Diterima", "Dikonfirmasi", "Siap Diambil", "Selesai"];
const card = "rounded-3xl bg-white p-5 shadow-sm";

export default async function PublicPreOrderPage({ params, searchParams }: { params: Promise<{ publicToken: string }>; searchParams: Promise<{ baru?: string }> }) {
    const { publicToken } = await params;
    const { baru } = await searchParams;
    const record = await getPreOrderByPublicToken(publicToken).catch(() => null);
    if (!record) notFound();
    const po = serializePublicPreOrder(record);
    const cancelled = po.status === "CANCELLED";
    const active = cancelled ? -1 : po.status === "HANDED_OVER" ? 3 : po.status === "READY_FOR_PICKUP" ? 2 : po.status === "CONFIRMED" ? 1 : 0;
    const wa = whatsappUrl(`Halo AFA STORE, saya ingin konfirmasi pre-order ${po.poNumber} atas nama ${po.customer}.`);

    return (
        <main className="min-h-screen bg-[#F8F5EE] px-4 py-8 text-[#2e2a26]">
            <div className="mx-auto max-w-2xl space-y-5">
                <header><p className="text-sm font-black tracking-[.2em] text-[#C9A45B]">AFA STORE</p><p className="text-sm text-[#6d6558]">Dari Kami Untuk Keluarga</p></header>
                {baru === "1" && !cancelled ? (
                    <section className="rounded-3xl bg-[#123524] p-5 text-white"><p className="text-lg font-black">✓ Pre-order berhasil diajukan</p><p className="mt-1 text-sm text-[#ead8ab]">Simpan tautan halaman ini untuk memantau status. Tim kami akan mengonfirmasi via WhatsApp.</p></section>
                ) : null}
                <section className={card}>
                    <p className="text-xs font-black tracking-[.2em] text-[#C9A45B]">PRE-ORDER</p>
                    <h1 className="mt-2 text-2xl font-black text-[#123524]">{po.poNumber}</h1>
                    <p className="mt-1 text-sm text-[#6d6558]">{po.customer} · diajukan {when(po.createdAt)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#123524] px-3 py-1 text-xs font-bold text-white">{preOrderStatusLabel(po.status)}</span>
                        <span className="rounded-full bg-[#F2EEE5] px-3 py-1 text-xs font-bold text-[#123524]">{preOrderPaymentStatusLabel(po.paymentStatus)}</span>
                    </div>
                    {po.pickupDate ? <p className="mt-3 text-sm">Tanggal pengambilan: <b>{dateOnly(po.pickupDate)}</b></p> : null}
                    {po.note ? <p className="mt-1 text-sm text-[#6d6558]">Catatan: {po.note}</p> : null}
                </section>
                {!cancelled ? (
                    <section className={card}><h2 className="font-black text-[#123524]">STATUS</h2>
                        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">{STEPS.map((label, i) => <div key={label} className={`rounded-xl p-3 font-bold ${i <= active ? "bg-[#123524] text-white" : "bg-[#F2EEE5] text-[#6d6558]"}`}>{i <= active ? "✓ " : "○ "}{label}</div>)}</div>
                        {po.status === "DRAFT" ? <p className="mt-3 text-sm text-[#6d6558]">Menunggu konfirmasi admin. DP / pelunasan dapat dilakukan di toko setelah dikonfirmasi.</p> : null}
                    </section>
                ) : <section className="rounded-3xl bg-red-50 p-5 text-sm font-bold text-red-700">Pre-order ini dibatalkan{po.cancelledAt ? ` pada ${when(po.cancelledAt)}` : ""}.</section>}
                <ItemsAndPayments po={po} />
                <div className="flex flex-wrap gap-3">
                    {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-[#25D366] px-5 py-3 text-sm font-black text-white">Hubungi via WhatsApp</a> : null}
                    <Link href="/pre-order" className="rounded-2xl border border-[#123524]/20 px-5 py-3 text-sm font-bold text-[#123524]">Buat Pre-Order Baru</Link>
                </div>
            </div>
        </main>
    );
}


function ItemsAndPayments({ po }: { po: ReturnType<typeof serializePublicPreOrder> }) {
    return (
        <>
            <section className={card}><h2 className="font-black text-[#123524]">ITEM</h2>
                <div className="mt-4 space-y-3">{po.items.map((item, i) => <div key={i} className="flex justify-between gap-3 border-b border-black/5 pb-3"><div><p className="font-bold">{item.name}</p><p className="text-sm text-[#6d6558]">{item.quantity} × {money(item.price)}{item.notes ? ` · ${item.notes}` : ""}</p></div><b>{money(item.subtotal)}</b></div>)}</div>
                <div className="mt-4 space-y-2 text-sm">
                    <Row label="Subtotal" value={money(po.subtotal)} />
                    {po.discount > 0 ? <Row label="Diskon" value={`- ${money(po.discount)}`} /> : null}
                    <Row label="TOTAL" value={money(po.total)} strong />
                    <Row label="Sudah dibayar" value={money(po.paid)} />
                    <Row label="Sisa" value={money(po.remaining)} />
                </div>
            </section>
            {po.payments.length > 0 ? (
                <section className={card}><h2 className="font-black text-[#123524]">PEMBAYARAN</h2>
                    <ul className="mt-3 divide-y divide-black/5 text-sm">{po.payments.map((row) => <li key={row.sequence} className="flex justify-between py-2"><span>#{row.sequence} {preOrderKindLabel(row.kind)} · {METHOD[row.method] ?? row.method}<br /><span className="text-xs text-[#6d6558]">{when(row.verifiedAt)}</span></span><b>{money(row.amount)}</b></li>)}</ul>
                </section>
            ) : null}
        </>
    );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return <p className={`flex justify-between ${strong ? "border-t pt-3 text-lg font-black text-[#123524]" : ""}`}><span>{label}</span><span>{value}</span></p>;
}
