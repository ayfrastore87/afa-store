"use client";
import { useEffect, useState } from "react";
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export default function KasirReport() { const [period,setPeriod]=useState("today"); const [data,setData]=useState<{total:number;count:number;payments:{paymentMethod:string;_count:{_all:number};_sum:{total:number|null}}[];sources:{source:string;_count:{_all:number};_sum:{total:number|null}}[];preOrder?:PreOrderReport|null}|null>(null); useEffect(()=>{ fetch(`/api/kasir/report?period=${period}`).then(r=>r.json()).then(setData); },[period]); return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#C9A45B]">POS PERFORMANCE</p><h1 className="text-3xl font-black">Laporan Kasir</h1></div><div className="flex gap-2">{[["today","Hari Ini"],["7d","7 Hari"],["30d","30 Hari"]].map(([id,label])=><button key={id} onClick={()=>setPeriod(id)} className={`min-h-11 rounded-xl px-4 text-sm font-bold ${period===id?"bg-[#184D47] text-[#F8F5EE]":"border border-[#123524]/15"}`}>{label}</button>)}</div></div><div className="grid gap-4 sm:grid-cols-2"><article className="rounded-2xl bg-[#184D47] p-5 text-[#F8F5EE]"><p className="text-sm opacity-70">Penjualan</p><strong className="mt-2 block text-2xl">{money.format(data?.total??0)}</strong></article><article className="rounded-2xl border border-[#123524]/10 p-5"><p className="text-sm opacity-70">Jumlah Transaksi</p><strong className="mt-2 block text-2xl">{data?.count??0}</strong></article></div><div className="grid gap-4 lg:grid-cols-2"><ReportGroup title="Pembayaran" rows={data?.payments??[]} label="paymentMethod"/><ReportGroup title="Sumber Transaksi" rows={data?.sources??[]} label="source"/></div><PreOrderReportSection data={data?.preOrder} /></section>; }
type PreOrderReport = {
    paymentCount: number;
    cashReceived: number;
    byKind: Record<"DP" | "INSTALLMENT" | "SETTLEMENT", { count: number; total: number }>;
    byMethod: { method: string; count: number; total: number }[];
    outstandingCount: number;
    outstandingReceivables: number;
    handedOverCount: number;
    handedOverValue: number;
};

/**
 * Pre-order section. Rendered SEPARATELY from "Penjualan" above: PO money is a
 * different ledger (DP / cicilan / pelunasan) and is never summed into kasir
 * sales, so the existing figures keep their meaning.
 */
export function PreOrderReportSection({ data }: { data: PreOrderReport | null | undefined }) {
    if (!data) return null;
    const kinds: [keyof PreOrderReport["byKind"], string][] = [["DP", "DP"], ["INSTALLMENT", "Cicilan"], ["SETTLEMENT", "Pelunasan"]];
    return (
        <section className="space-y-4 rounded-2xl border border-[#C9A45B]/40 bg-[#FFFDF7] p-5" data-testid="pre-order-report">
            <div>
                <p className="text-xs font-black uppercase tracking-[.2em] text-[#C9A45B]">PRE-ORDER</p>
                <h2 className="text-xl font-black">Laporan Pre-Order</h2>
                <p className="text-xs text-[#123524]/60">Dihitung dari pembayaran PO terverifikasi. Terpisah dari penjualan kasir di atas.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded-xl bg-[#184D47] p-4 text-[#F8F5EE]"><p className="text-xs opacity-70">Kas Masuk PO</p><strong className="mt-1 block text-xl">{money.format(data.cashReceived)}</strong><span className="text-xs opacity-70">{data.paymentCount} pembayaran</span></article>
                <article className="rounded-xl border border-[#123524]/10 p-4"><p className="text-xs opacity-70">Piutang PO (belum lunas)</p><strong className="mt-1 block text-xl">{money.format(data.outstandingReceivables)}</strong><span className="text-xs opacity-70">{data.outstandingCount} PO aktif</span></article>
                <article className="rounded-xl border border-[#123524]/10 p-4"><p className="text-xs opacity-70">PO Diserahkan</p><strong className="mt-1 block text-xl">{data.handedOverCount}</strong><span className="text-xs opacity-70">nilai {money.format(data.handedOverValue)}</span></article>
                <article className="rounded-xl border border-[#123524]/10 p-4"><p className="text-xs opacity-70">Per Jenis</p><div className="mt-1 space-y-1 text-sm">{kinds.map(([key, label]) => <div key={key} className="flex justify-between gap-2"><span className="font-semibold">{label}</span><span className="font-black">{data.byKind[key].count} · {money.format(data.byKind[key].total)}</span></div>)}</div></article>
            </div>
            <ReportGroup title="Metode Pembayaran PO" rows={data.byMethod.map((row) => ({ method: row.method, _count: { _all: row.count }, _sum: { total: row.total } }))} label="method" />
        </section>
    );
}

function ReportGroup({title,rows,label}:{title:string;rows:Array<{_count:{_all:number};_sum:{total:number|null};[key:string]:unknown}>;label:string}) { return <article className="rounded-2xl border border-[#123524]/10 p-5"><h2 className="font-black">{title}</h2><div className="mt-4 space-y-3">{rows.map((r,i)=><div key={i} className="flex justify-between gap-3 text-sm"><span className="font-semibold">{String(r[label])}</span><span className="font-black">{r._count._all} · {money.format(r._sum.total??0)}</span></div>)}</div></article>; }