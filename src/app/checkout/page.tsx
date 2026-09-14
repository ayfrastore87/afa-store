"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Truck } from "lucide-react";
import type { CheckoutItem } from "@/lib/checkout";
import { formatRupiah } from "@/lib/products";
import { getUserFacingMessage } from "@/lib/user-facing-error";

type Session = { items: CheckoutItem[]; subtotal: number; shipping: number; total: number };
type Address = { id: string; recipientName: string; phone: string; province: string; city: string; district: string; village: string; postalCode: string; detail: string; note?: string | null; isDefault: boolean };
type Area = { id: string; name: string; type: string };
type Rate = { courierCode: string; courierName: string; serviceCode: string; serviceName: string; price: number; duration: string | null; quoteRef: string | null };
type Form = { recipientName: string; phone: string; email: string; address: string; note: string; province: string; city: string; district: string; postalCode: string; paymentMethod: "QRIS" | "TRANSFER_BANK" | "COD" };
const empty: Form = { recipientName: "", phone: "", email: "", address: "", note: "", province: "", city: "", district: "", postalCode: "", paymentMethod: "QRIS" };
const methods: Form["paymentMethod"][] = ["QRIS", "TRANSFER_BANK", "COD"];

type RateState = "idle" | "loading" | "ready" | "empty" | "unavailable" | "error";

export default function CheckoutPage() {
    const [session, setSession] = useState<Session | null>(null), [addresses, setAddresses] = useState<Address[]>([]), [form, setForm] = useState(empty), [loading, setLoading] = useState(true), [paying, setPaying] = useState(false), [error, setError] = useState(""), [processing, setProcessing] = useState(false);
    const [areaQuery, setAreaQuery] = useState(""), [areaOptions, setAreaOptions] = useState<Area[]>([]), [areaSearching, setAreaSearching] = useState(false);
    const [destinationArea, setDestinationArea] = useState<Area | null>(null);
    const [rates, setRates] = useState<Rate[]>([]), [rateState, setRateState] = useState<RateState>("idle"), [rateError, setRateError] = useState("");
    const [selected, setSelected] = useState<{ courierCode: string; serviceCode: string } | null>(null);
    const areaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rateRequestRef = useRef(0);
    const submittingRef = useRef(false), keyRef = useRef<string | null>(null), fingerprintRef = useRef("");

    useEffect(() => { fetch("/api/checkout/session").then(async (r) => { const d = await r.json().catch(() => ({})); if (r.status === 401) { window.location.href = d.redirectTo || "/login"; return; } if (!r.ok || !d.items?.length) throw new Error(); setSession(d); }).catch(() => setError("Checkout sudah tidak tersedia.")).finally(() => setLoading(false)); fetch("/api/account/addresses").then((r) => r.ok ? r.json() : { addresses: [] }).then((d: { addresses?: Address[] }) => { const list = d.addresses || []; setAddresses(list); const a = list.find((x) => x.isDefault) || list[0]; if (a) choose(a); }); }, []);

    const choose = (a: Address) => setForm((f) => ({ ...f, recipientName: a.recipientName, phone: a.phone, province: a.province, city: a.city, district: a.district, postalCode: a.postalCode, address: a.detail, note: a.note || "" }));
    const update = (name: keyof Form, value: string) => setForm((f) => ({ ...f, [name]: value }));

    useEffect(() => {
        if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current);
        if (!areaQuery.trim()) { setAreaOptions([]); return; }
        areaDebounceRef.current = setTimeout(async () => {
            setAreaSearching(true);
            try {
                const r = await fetch(`/api/shipping/areas?input=${encodeURIComponent(areaQuery.trim())}`);
                const d = await r.json().catch(() => ({}));
                if (!r.ok) { setAreaOptions([]); return; }
                setAreaOptions(d.areas || []);
            } catch { setAreaOptions([]); } finally { setAreaSearching(false); }
        }, 350);
        return () => { if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current); };
    }, [areaQuery]);

    useEffect(() => {
        if (!session?.items?.length || !destinationArea) { setRates([]); setRateState("idle"); return; }
        const requestId = ++rateRequestRef.current;
        setRateState("loading"); setRateError(""); setSelected(null);
        fetch("/api/shipping/rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinationAreaId: destinationArea.id, items: session.items.map(({ id, qty }) => ({ id, qty })) }) })
            .then(async (r) => { const d = await r.json().catch(() => ({})); if (requestId !== rateRequestRef.current) return; if (r.status === 503) { setRateState("unavailable"); setRateError(d.message || "Layanan pengiriman sedang tidak tersedia."); return; } if (!r.ok) { setRateState("error"); setRateError(d.message || "Gagal memuat ongkir."); return; } const list = d.rates || []; if (!list.length) { setRateState("empty"); return; } setRates(list); setRateState("ready"); })
            .catch(() => { if (requestId === rateRequestRef.current) { setRateState("error"); setRateError("Gagal memuat ongkir. Silakan coba lagi."); } });
    }, [destinationArea, session?.items]);

    const selectRate = (rate: Rate) => setSelected({ courierCode: rate.courierCode, serviceCode: rate.serviceCode });
    const selectedRate = selected ? rates.find((r) => r.courierCode === selected.courierCode && r.serviceCode === selected.serviceCode) ?? null : null;
    const shipping = selectedRate?.price ?? 0;
    const total = (session?.subtotal ?? 0) + shipping;
    const groupedRates = groupByCourier(rates);

    const submit = async (event: React.FormEvent) => { event.preventDefault(); if (submittingRef.current || !session) return; if (!destinationArea || !selectedRate) { setError("Pilih kurir pengiriman terlebih dahulu."); return; } submittingRef.current = true; setPaying(true); setError(""); const payload = { ...form, district: [form.district].filter(Boolean).join(", "), destinationAreaId: destinationArea.id, courierCode: selectedRate.courierCode, courierName: selectedRate.courierName, serviceCode: selectedRate.serviceCode, serviceName: selectedRate.serviceName, quoteRef: selectedRate.quoteRef }; const fp = JSON.stringify({ payload, items: session.items.map(({ id, qty }) => ({ id, qty })) }); if (fp !== fingerprintRef.current) { fingerprintRef.current = fp; keyRef.current = crypto.randomUUID(); } try { const r = await fetch("/api/checkout/order", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current! }, body: JSON.stringify(payload) }); const d = await r.json().catch(() => ({})); if (r.status === 409 && d.status === "PROCESSING") { setProcessing(true); return; } if (!r.ok || !d.redirectTo) throw new Error(d.message || d.error || "Order belum berhasil dibuat."); window.location.href = d.redirectTo; } catch (e) { setError(getUserFacingMessage(e, "Order belum berhasil dibuat. Silakan coba lagi.")); } finally { submittingRef.current = false; setPaying(false); } };
    if (loading) return <main aria-busy="true" className="min-h-screen bg-[#F8F5EE] p-6"><div className="skeleton mx-auto h-96 max-w-5xl rounded-[28px]" /></main>;
    if (!session) return <main className="grid min-h-screen place-items-center bg-[#F8F5EE] p-6 text-center"><div><h1 className="font-display text-4xl font-bold text-[#123524]">{error || "Checkout sudah tidak tersedia."}</h1><Link href="/cart" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-[#123524] px-6 font-bold text-white">Kembali ke Keranjang</Link></div></main>;
    return <main className="min-h-screen bg-[#F8F5EE] px-4 py-8 pb-28 text-[#2E2A26] md:px-8 lg:pb-8"><div className="mx-auto max-w-6xl"><Link href="/cart" className="font-semibold text-[#8B6B3F]">← Kembali ke Keranjang</Link><h1 className="mt-6 font-display text-4xl font-bold text-[#123524] md:text-6xl">Selesaikan Pesanan</h1><form onSubmit={submit} className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]"><div className="space-y-6"><Panel title="Kontak"><Field label="Nama penerima" name="recipientName" value={form.recipientName} update={update} /><Field label="Nomor telepon" name="phone" value={form.phone} update={update} /><Field label="Email (opsional)" name="email" value={form.email} update={update} required={false} /></Panel><Panel title="Alamat Pengiriman">{addresses.length > 0 && <div className="mb-4 grid gap-2">{addresses.map((a) => <button type="button" key={a.id} onClick={() => choose(a)} className="rounded-xl border border-[#C9A45B]/30 p-3 text-left"><b>{a.isDefault ? "Alamat Utama · " : ""}{a.recipientName}</b><span className="block text-sm text-[#6D6558]">{a.phone} · {a.detail}, {a.district}, {a.city}, {a.province} {a.postalCode}</span></button>)}</div>}<div className="grid gap-3 sm:grid-cols-2">{(["province", "city", "district", "postalCode", "address", "note"] as const).map((name) => <Field key={name} label={name === "address" ? "Detail alamat" : name === "note" ? "Catatan (opsional)" : name} name={name} value={form[name]} update={update} required={name !== "note"} />)}</div></Panel><Panel title="Pengiriman"><div className="space-y-4"><div className="space-y-2"><span className="text-sm font-bold text-[#123524]">Kecamatan / kelurahan tujuan</span><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6D6558]" /><input value={areaQuery} onChange={(e) => setAreaQuery(e.target.value)} placeholder="Ketik kecamatan atau kelurahan tujuan..." className="min-h-12 w-full rounded-xl border border-[#C9A45B]/30 bg-white pl-9 pr-3" aria-label="Cari kecamatan atau kelurahan tujuan" /></div>{areaSearching && <p className="text-sm text-[#6D6558]">Mencari area...</p>}{!areaSearching && areaOptions.length > 0 && <ul className="max-h-48 overflow-auto rounded-xl border border-[#C9A45B]/30" role="listbox">{areaOptions.map((a) => <li key={a.id}><button type="button" onClick={() => { setDestinationArea(a); setAreaQuery(a.name); setAreaOptions([]); }} className="w-full px-3 py-2 text-left text-sm hover:bg-[#F0E7D8]">{a.name}</button></li>)}</ul>}{destinationArea && <p className="text-sm font-bold text-[#184D47]">Tujuan: {destinationArea.name}</p>}</div><ShippingRates state={rateState} error={rateError} grouped={groupedRates} selected={selected} onSelect={selectRate} /></div></Panel><Panel title="Pembayaran"><fieldset><legend className="sr-only">Metode pembayaran</legend>{methods.map((m) => <label key={m} className="flex min-h-12 items-center gap-3 rounded-xl border border-[#C9A45B]/30 p-3"><input type="radio" name="paymentMethod" checked={form.paymentMethod === m} onChange={() => update("paymentMethod", m)} />{m === "TRANSFER_BANK" ? "Transfer Bank" : m}</label>)}</fieldset></Panel></div><aside className="luxury-card h-fit rounded-[28px] p-6 lg:sticky lg:top-6"><h2 className="font-display text-2xl font-bold text-[#123524]">Ringkasan Order</h2>{session.items.map((i) => <div key={i.id} className="flex gap-3 border-b py-3"><Image src={i.image} alt={i.name} width={56} height={56} className="rounded-xl object-contain" /><span className="min-w-0 flex-1 break-words">{i.name}<small className="block">{i.qty} × {formatRupiah(i.price)}</small></span></div>)}<p className="mt-4 flex justify-between">Subtotal <b>{formatRupiah(session.subtotal)}</b></p><p className="flex justify-between">Pengiriman <b>{selectedRate ? formatRupiah(shipping) : "-"}</b></p><p className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">Total <b>{formatRupiah(total)}</b></p>{processing && <p role="status" className="mt-3 rounded-xl bg-[#FFF2D6] p-3 text-sm font-bold">Checkout sedang diproses. Silakan tunggu sebentar sebelum mencoba lagi.</p>}{error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={paying || !selectedRate} aria-busy={paying} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#123524] font-bold text-white disabled:opacity-60">{paying && <Loader2 size={18} className="animate-spin" />}Buat Pesanan</button></aside></form></div></main>;
}

function groupByCourier(rates: Rate[]) {
    const map = new Map<string, Rate[]>();
    for (const rate of rates) { const list = map.get(rate.courierCode) || []; list.push(rate); map.set(rate.courierCode, list); }
    return Array.from(map.entries()).map(([code, list]) => ({ code, name: list[0].courierName, rates: list }));
}

function ShippingRates({ state, error, grouped, selected, onSelect }: { state: RateState; error: string; grouped: { code: string; name: string; rates: Rate[] }[]; selected: { courierCode: string; serviceCode: string } | null; onSelect: (rate: Rate) => void }) {
    if (state === "idle") return <p className="text-sm text-[#6D6558]">Pilih tujuan pengiriman untuk melihat ongkir.</p>;
    if (state === "loading") return <div className="flex items-center gap-2 text-sm font-bold text-[#123524]"><Loader2 size={16} className="animate-spin" />Memuat ongkir...</div>;
    if (state === "unavailable") return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error || "Layanan pengiriman sedang tidak tersedia. Silakan coba lagi nanti."}</p>;
    if (state === "error") return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error || "Gagal memuat ongkir. Silakan coba lagi."}</p>;
    if (state === "empty") return <p className="rounded-xl bg-[#FFF2D6] p-3 text-sm font-bold">Belum ada kurir untuk tujuan ini. Silakan coba alamat lain.</p>;
    return <fieldset><legend className="sr-only">Pilih kurir dan layanan</legend><div className="space-y-3">{grouped.map((group) => <div key={group.code}><p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#123524]"><Truck size={16} />{group.name}</p><div className="grid gap-2">{group.rates.map((rate) => <label key={rate.serviceCode} className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${selected?.courierCode === rate.courierCode && selected?.serviceCode === rate.serviceCode ? "border-[#184D47] bg-[#EAF1ED]" : "border-[#C9A45B]/30"}`}><span className="flex items-center gap-3"><input type="radio" name="shipping-rate" checked={selected?.courierCode === rate.courierCode && selected?.serviceCode === rate.serviceCode} onChange={() => onSelect(rate)} /><span className="text-sm font-bold">{rate.serviceName}</span>{rate.duration && <span className="text-xs text-[#6D6558]">± {rate.duration} hari</span>}</span><b className="whitespace-nowrap">{formatRupiah(rate.price)}</b></label>)}</div></div>)}</div></fieldset>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="luxury-card rounded-[28px] p-5 md:p-7"><h2 className="mb-4 font-display text-2xl font-bold text-[#123524]">{title}</h2>{children}</section>; }
function Field({ label, name, value, update, required = true }: { label: string; name: keyof Form; value: string; update: (name: keyof Form, value: string) => void; required?: boolean }) { return <label className="grid gap-1 text-sm font-semibold text-[#123524]"><span>{label}</span><input required={required} value={value} onChange={(e) => update(name, e.target.value)} className="min-h-12 rounded-xl border border-[#C9A45B]/30 bg-white px-3 font-normal" /></label>; }
