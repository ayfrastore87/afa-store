"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Loader2, MapPin, PackageCheck, QrCode, Truck } from "lucide-react";
import { CheckoutItem } from "@/lib/checkout";
import { formatRupiah } from "@/lib/data";

type CheckoutSession = {
    items: CheckoutItem[];
    subtotal: number;
    shipping: number;
    total: number;
};

type AddressForm = {
    recipientName: string;
    phone: string;
    address: string;
    province: string;
    city: string;
    district: string;
    postalCode: string;
    paymentMethod: "QRIS" | "TRANSFER_BANK" | "COD";
};

const emptyAddress: AddressForm = { recipientName: "", phone: "", address: "", province: "", city: "", district: "", postalCode: "", paymentMethod: "QRIS" };
const paymentOptions = [
    { value: "QRIS", label: "QRIS", icon: QrCode, note: "Scan cepat dengan e-wallet atau mobile banking" },
    { value: "TRANSFER_BANK", label: "Transfer Bank", icon: Banknote, note: "Bayar melalui rekening bank pilihan Anda" },
    { value: "COD", label: "COD", icon: Truck, note: "Bayar saat pesanan diterima" },
] as const;

export default function CheckoutPage() {
    const [session, setSession] = useState<CheckoutSession | null>(null);
    const [form, setForm] = useState<AddressForm>(emptyAddress);
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadCheckout = async () => {
            const response = await fetch("/api/checkout/session");
            const data = await response.json();
            if (response.status === 401) {
                window.location.href = data.redirectTo || "/login";
                return;
            }
            setSession(data);
            setLoading(false);
        };
        loadCheckout().catch(() => {
            setError("Checkout tidak dapat dimuat.");
            setLoading(false);
        });
    }, []);

    const itemCount = useMemo(() => session?.items.reduce((total, item) => total + item.qty, 0) ?? 0, [session]);

    const updateForm = (name: keyof AddressForm, value: string) => setForm((current) => ({ ...current, [name]: value }));

    const createOrder = async (event: React.FormEvent) => {
        event.preventDefault();
        setPaying(true);
        setError("");

        const response = await fetch("/api/checkout/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const data = await response.json();
        setPaying(false);

        if (response.status === 401) {
            window.location.href = data.redirectTo || "/login";
            return;
        }
        if (!response.ok) {
            setError(data.message || "Order gagal dibuat.");
            return;
        }
        window.location.href = data.redirectTo;
    };

    if (loading) return <main className="grid min-h-screen place-items-center bg-[#F8F4EC] text-[#2E2A26]"><Loader2 className="animate-spin text-[#C8A45D]" /></main>;
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(200,164,93,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(18,53,36,0.12),transparent_30%),linear-gradient(135deg,#F8F4EE,#FFFDF8_55%,#EFE6D5)] px-4 py-6 text-[#2E2A26] md:px-6 md:py-8"><div className="mx-auto max-w-6xl"><Link href="/" className="font-semibold text-[#8B6B3F] hover:text-[#C8A45D]">← Kembali belanja</Link><div className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]"><section className="rounded-[28px] bg-white/90 p-5 shadow-[0_24px_70px_rgba(46,42,38,0.10)] backdrop-blur md:p-8"><p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[#C8A45D]"><PackageCheck size={18} /> Ringkasan Pesanan</p><h1 className="mt-3 font-display text-4xl font-bold text-[#123524] md:text-5xl">Detail Pesanan</h1>{session?.items.length ? <div className="mt-6 grid gap-4">{session.items.map((item) => <div key={item.id} className="flex gap-4 rounded-3xl border border-[#C8A45D]/15 bg-[#FFFBF4] p-4"><div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-white"><Image src={item.image} alt={item.name} fill sizes="96px" className="object-contain p-2" /></div><div className="flex-1"><h2 className="font-display text-xl font-bold text-[#123524]">{item.name}</h2><p className="text-sm text-[#8B6B3F]">Quantity: {item.qty}</p><p className="font-bold text-[#C8A45D]">{formatRupiah(item.price * item.qty)}</p></div></div>)}</div> : <p className="mt-6 rounded-3xl bg-[#FFFBF4] p-6 text-center text-[#8B6B3F]">Tidak ada produk checkout.</p>}<div className="mt-6 rounded-[24px] bg-[#123524] p-5 text-white shadow-[0_20px_50px_rgba(18,53,36,0.18)]"><div className="flex justify-between"><span>{itemCount} item</span><span>{formatRupiah(session?.subtotal ?? 0)}</span></div><div className="mt-2 flex justify-between text-white/75"><span>Ongkir</span><span>{formatRupiah(session?.shipping ?? 0)}</span></div><div className="mt-4 flex justify-between border-t border-white/15 pt-4 text-xl font-bold text-[#E4C982]"><span>Total</span><span>{formatRupiah(session?.total ?? 0)}</span></div></div></section><form onSubmit={createOrder} className="rounded-[28px] bg-white/90 p-5 shadow-[0_24px_70px_rgba(46,42,38,0.10)] backdrop-blur md:p-8"><p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[#C8A45D]"><MapPin size={18} /> Alamat & Pembayaran</p><div className="mt-6 grid gap-4">{([['recipientName', 'Nama penerima'], ['phone', 'Nomor HP'], ['address', 'Alamat lengkap'], ['province', 'Provinsi'], ['city', 'Kabupaten'], ['district', 'Kecamatan'], ['postalCode', 'Kode pos']] as const).map(([name, label]) => <label key={name} className="block text-sm font-bold text-[#2E2A26]">{label}<input required value={form[name]} onChange={(event) => updateForm(name, event.target.value)} className="mt-2 w-full rounded-2xl border border-[#C8A45D]/20 bg-[#FFFDF8] px-4 py-3 outline-none transition focus:border-[#C8A45D] focus:ring-4 focus:ring-[#C8A45D]/15" /></label>)}</div><div className="mt-6 rounded-[24px] border border-[#C8A45D]/15 bg-[#F8F5EE] p-4"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#123524]">Metode Pembayaran</p><div className="mt-4 grid gap-3">{paymentOptions.map((option) => { const Icon = option.icon; const selected = form.paymentMethod === option.value; return <button key={option.value} type="button" onClick={() => updateForm("paymentMethod", option.value)} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${selected ? "border-[#C9A45B] bg-white shadow-lg" : "border-[#123524]/10 bg-white/70 hover:border-[#C9A45B]/40"}`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${selected ? "bg-[#C9A45B] text-white" : "bg-[#123524]/8 text-[#123524]"}`}><Icon size={18} /></span><span><b className="block text-[#123524]">{option.label}</b><span className="mt-1 block text-sm text-[#6D6558]">{option.note}</span></span></button>; })}</div></div>{error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}<button disabled={paying || !session?.items.length} className="mt-6 flex h-[58px] w-full items-center justify-center gap-2 rounded-full bg-[#C9A45B] px-6 font-bold text-white shadow-[0_18px_40px_rgba(201,164,91,0.30)] transition hover:bg-[#a9853f] disabled:opacity-50"><CreditCard size={20} />{paying ? "Membuat order..." : "Pesan Sekarang"}</button></form></div></div></main>;
}
