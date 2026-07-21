"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, PackageCheck, PackageSearch, Truck, Wallet, XCircle } from "lucide-react";
import jsPDF from "jspdf";

type User = { id: string; name: string; email: string; phone: string | null; image: string | null; role: string; createdAt?: string };
type Address = { id: string; recipientName: string; phone: string; province: string; city: string; district: string; village: string; postalCode: string; detail: string; note?: string | null; isDefault: boolean };
type Wishlist = { id: string; productRef: string; name: string; price: number; image?: string | null };
type OrderItem = { id: string; name: string; quantity: number; price?: number; subtotal: number };
type Order = { id: string; invoice: string; createdAt: string; updatedAt?: string; subtotal: number; shipping: number; discount?: number; total: number; voucher?: string | null; status: string; courier?: string | null; trackingNumber?: string | null; paidAt?: string | null; processedAt?: string | null; packedAt?: string | null; shippedAt?: string | null; completedAt?: string | null; cancelledAt?: string | null; items: OrderItem[] };
type Checkout = { id: string; createdAt: string; total: number; channel: string; message: string };
type Voucher = { id: string; code: string; title: string; description?: string | null; value: number; discountType: string; minSpend: number; endsAt?: string | null };

const tabs = ["Ringkasan", "Profil Saya", "Alamat Saya", "Pesanan Saya", "Wishlist", "Voucher Saya", "Riwayat Checkout", "Ubah Password"];
const orderTabs = ["Semua", "Belum Bayar", "Diproses", "Dikemas", "Dikirim", "Selesai", "Dibatalkan"];
const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const statusText: Record<string, string> = { pending: "Belum Bayar", PENDING: "Belum Bayar", processing: "Diproses", PROCESSING: "Diproses", packed: "Dikemas", PACKED: "Dikemas", shipped: "Dikirim", SHIPPED: "Dikirim", completed: "Selesai", COMPLETED: "Selesai", cancelled: "Dibatalkan", CANCELLED: "Dibatalkan" };
const statusTone: Record<string, string> = { pending: "bg-[#FFF2D6] text-[#8B5E00]", PENDING: "bg-[#FFF2D6] text-[#8B5E00]", processing: "bg-[#E6F3ED] text-[#184C3A]", PROCESSING: "bg-[#E6F3ED] text-[#184C3A]", packed: "bg-[#F7EAD0] text-[#7A571F]", PACKED: "bg-[#F7EAD0] text-[#7A571F]", shipped: "bg-[#E8F0FF] text-[#23407A]", SHIPPED: "bg-[#E8F0FF] text-[#23407A]", completed: "bg-[#E7F7DE] text-[#25630E]", COMPLETED: "bg-[#E7F7DE] text-[#25630E]", cancelled: "bg-[#FFE9E6] text-[#9B1C12]", CANCELLED: "bg-[#FFE9E6] text-[#9B1C12]" };

export function AccountDashboard({ initialUser }: { initialUser: User }) {
    const [user, setUser] = useState(initialUser);
    const [active, setActive] = useState(tabs[0]);
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [histories, setHistories] = useState<Checkout[]>([]);
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);

    const refresh = async () => {
        const [a, w, o, h, v] = await Promise.all([fetch("/api/account/addresses"), fetch("/api/account/wishlist"), fetch("/api/account/orders"), fetch("/api/account/checkout-history"), fetch("/api/account/vouchers")]);
        if (a.ok) setAddresses((await a.json()).addresses || []);
        if (w.ok) setWishlist((await w.json()).wishlist || []);
        if (o.ok) setOrders((await o.json()).orders || []);
        if (h.ok) setHistories((await h.json()).histories || []);
        if (v.ok) setVouchers((await v.json()).vouchers || []);
    };

    useEffect(() => { refresh(); }, []);

    const stats = useMemo(() => [
        ["Total pesanan", orders.length.toString()],
        ["Belanja tercatat", money(orders.reduce((sum, order) => sum + order.total, 0))],
        ["Alamat tersimpan", addresses.length.toString()],
        ["Wishlist", wishlist.length.toString()],
    ], [addresses.length, orders, wishlist.length]);

    const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; };
    const submit = async (path: string, body: Record<string, FormDataEntryValue | boolean | number | null>, method = "PATCH") => {
        setMsg("");
        setBusy(true);
        const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        setBusy(false);
        if (!res.ok) return setMsg(data.message || "Gagal menyimpan data.");
        if (data.user) setUser(data.user);
        setMsg(data.message || "Data berhasil disimpan.");
        refresh();
    };

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff1b8,transparent_30%),linear-gradient(135deg,#f8fbf2,#ffffff_45%,#eaf4ee)] px-4 py-6 text-[#102116] md:py-10"><div className="mx-auto max-w-7xl"><Link href="/" className="font-bold text-[#184C3A]">← AFA STORE</Link><section className="mt-5 grid gap-5 md:grid-cols-[320px_1fr]"><aside className="rounded-4xl border border-white/70 bg-white/70 p-5 shadow-xl backdrop-blur"><div className="flex items-center gap-4"><Avatar user={user} /><div><h1 className="text-2xl font-bold text-[#184C3A]">{user.name}</h1><p className="text-sm">{user.email}</p><p className="text-sm">{user.phone || "WhatsApp belum diisi"}</p><p className="mt-1 text-xs text-[#B28B18]">Bergabung {user.createdAt ? new Date(user.createdAt).toLocaleDateString("id-ID") : "-"}</p></div></div><nav className="mt-6 grid gap-2">{tabs.map((tab) => <button key={tab} onClick={() => setActive(tab)} className={`rounded-2xl px-4 py-3 text-left font-bold transition ${active === tab ? "bg-[#184C3A] text-white shadow-lg" : "bg-white/75 text-[#184C3A] hover:bg-[#D4AF37]/20"}`}>{tab}</button>)}<button onClick={logout} className="rounded-2xl bg-[#D4AF37] px-4 py-3 text-left font-bold text-[#184C3A]">Logout</button></nav></aside><section className="rounded-4xl border border-white/70 bg-white/75 p-5 shadow-xl backdrop-blur md:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-3xl font-bold text-[#184C3A]">{active}</h2>{busy && <span className="rounded-full bg-[#184C3A]/10 px-3 py-1 text-sm font-bold text-[#184C3A]">Menyimpan...</span>}</div>{msg && <p className="mt-4 rounded-2xl bg-[#184C3A]/10 p-3 font-bold text-[#184C3A]">{msg}</p>}{active === "Ringkasan" && <Summary stats={stats} orders={orders} vouchers={vouchers} addresses={addresses} />}{active === "Profil Saya" && <Profile user={user} onSave={(body) => submit("/api/account/profile", body)} />}{active === "Alamat Saya" && <Addresses addresses={addresses} onSave={(body) => submit("/api/account/addresses", body, "POST")} onUpdate={(body) => submit("/api/account/addresses", body)} onDelete={(id) => submit("/api/account/addresses", { id }, "DELETE")} />}{active === "Pesanan Saya" && <Orders orders={orders} onUpdate={(order, status) => submit(`/api/account/orders/${order.id}`, { status })} />}{active === "Wishlist" && <WishlistList items={wishlist} onRemove={(item) => submit("/api/account/wishlist", { productRef: item.productRef, name: item.name, price: item.price, image: item.image || "" }, "POST")} />}{active === "Voucher Saya" && <Vouchers vouchers={vouchers} />}{active === "Riwayat Checkout" && <Checkouts histories={histories} />}{active === "Ubah Password" && <Password onSave={(body) => submit("/api/account/password", body)} />}</section></section></div></main>;
}

function Avatar({ user }: { user: User }) { return <div className="relative h-20 w-20 overflow-hidden rounded-full bg-[#184C3A] shadow-inner">{user.image ? <Image src={user.image} alt={user.name} fill className="object-cover" /> : <span className="grid h-full place-items-center text-2xl font-bold text-[#D4AF37]">{user.name.slice(0, 2).toUpperCase()}</span>}</div>; }

function Summary({ stats, orders, vouchers, addresses }: { stats: string[][]; orders: Order[]; vouchers: Voucher[]; addresses: Address[] }) {
    const defaultAddress = addresses.find((a) => a.isDefault);
    return <div className="mt-6 grid gap-5"><div className="grid gap-3 md:grid-cols-4">{stats.map(([label, value]) => <article key={label} className="rounded-3xl bg-white p-4 shadow"><p className="text-sm text-[#5d6b61]">{label}</p><b className="text-2xl text-[#184C3A]">{value}</b></article>)}</div><div className="grid gap-4 md:grid-cols-2"><article className="rounded-3xl bg-[#184C3A] p-5 text-white shadow"><p className="text-sm text-white/70">Pesanan terbaru</p><h3 className="mt-2 text-xl font-bold">{orders[0]?.invoice || "Belum ada pesanan"}</h3><p>{orders[0] ? `${statusText[orders[0].status] || orders[0].status} - ${money(orders[0].total)}` : "Mulai belanja dan checkout untuk melihat pesanan di sini."}</p></article><article className="rounded-3xl bg-[#f7ead0] p-5 shadow"><p className="text-sm text-[#7a651c]">Alamat utama</p><h3 className="mt-2 text-xl font-bold text-[#184C3A]">{defaultAddress?.recipientName || "Belum dipilih"}</h3><p>{defaultAddress ? `${defaultAddress.detail}, ${defaultAddress.city}` : "Tambahkan alamat agar checkout lebih cepat."}</p></article></div><Vouchers vouchers={vouchers.slice(0, 2)} /></div>;
}

function Profile({ user, onSave }: { user: User; onSave: (body: Record<string, FormDataEntryValue>) => void }) { return <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, FormDataEntryValue>); }}>{[["image", "Foto URL"], ["name", "Nama"], ["email", "Email"], ["phone", "WhatsApp"]].map(([n, l]) => <label key={n} className="font-bold">{l}<input name={n} defaultValue={(user as unknown as Record<string, string | null>)[n] || ""} className="mt-2 w-full rounded-2xl border px-4 py-3" /></label>)}<button className="rounded-2xl bg-[#184C3A] px-6 py-3 font-bold text-white md:col-span-2">Simpan Profil</button></form>; }

function Addresses({ addresses, onSave, onUpdate, onDelete }: { addresses: Address[]; onSave: (body: Record<string, FormDataEntryValue | boolean>) => void; onUpdate: (body: Record<string, FormDataEntryValue | boolean>) => void; onDelete: (id: string) => void }) {
    const fields = [["recipientName", "Nama Penerima"], ["phone", "No HP"], ["province", "Provinsi"], ["city", "Kota"], ["district", "Kecamatan"], ["village", "Kelurahan"], ["postalCode", "Kode Pos"], ["detail", "Alamat Lengkap"], ["note", "Catatan"]];
    return <div className="mt-6 grid gap-5"><form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const body = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, FormDataEntryValue | boolean>; body.isDefault = Boolean(body.isDefault); onSave(body); e.currentTarget.reset(); }}>{fields.map(([n, l]) => <input key={n} name={n} placeholder={l} className="rounded-2xl border px-4 py-3" />)}<label className="flex items-center gap-2 font-bold"><input type="checkbox" name="isDefault" value="true" /> Set Default Address</label><button className="rounded-2xl bg-[#184C3A] px-6 py-3 font-bold text-white">Tambah Alamat</button></form><div className="grid gap-3">{addresses.map((a) => <article key={a.id} className="rounded-3xl bg-white p-4 shadow"><div className="flex flex-wrap items-center justify-between gap-2"><b>{a.recipientName}</b>{a.isDefault && <span className="rounded-full bg-[#D4AF37] px-2 py-1 text-xs font-bold">Default</span>}</div><p>{a.phone} - {a.city}, {a.province} {a.postalCode}</p><p>{a.detail}</p>{a.note && <p className="text-sm text-[#5d6b61]">Catatan: {a.note}</p>}<div className="mt-3 flex flex-wrap gap-2"><button onClick={() => onUpdate({ id: a.id, isDefault: true })} className="rounded-xl bg-[#184C3A]/10 px-4 py-2 text-sm font-bold text-[#184C3A]">Jadikan default</button><button onClick={() => onDelete(a.id)} className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-700">Hapus</button></div></article>)}</div></div>;
}

function Orders({ orders, onUpdate }: { orders: Order[]; onUpdate: (order: Order, status: string) => void }) {
    const [filter, setFilter] = useState(orderTabs[0]);
    const filtered = filter === "Semua" ? orders : orders.filter((order) => statusText[order.status] === filter);
    return <div className="mt-6"><div className="overflow-x-auto pb-2"><div className="flex min-w-max gap-2">{orderTabs.map((tab) => <button key={tab} onClick={() => setFilter(tab)} className={`rounded-full border px-4 py-2 text-sm font-bold transition ${filter === tab ? "border-[#184C3A] bg-[#184C3A] text-white shadow-lg" : "border-[#D4AF37]/30 bg-white text-[#184C3A] hover:bg-[#D4AF37]/15"}`}>{tab}<span className="ml-2 rounded-full bg-white/25 px-2">{tab === "Semua" ? orders.length : orders.filter((order) => statusText[order.status] === tab).length}</span></button>)}</div></div><div className="mt-5 grid gap-5">{filtered.length ? filtered.map((order) => <OrderCard key={order.id} order={order} onUpdate={onUpdate} />) : <div className="rounded-4xl border border-dashed border-[#D4AF37]/50 bg-white/70 p-8 text-center"><PackageSearch className="mx-auto text-[#D4AF37]" size={44} /><h3 className="mt-3 text-2xl font-bold text-[#184C3A]">Belum ada pesanan {filter !== "Semua" ? filter.toLowerCase() : ""}</h3><p className="text-[#5d6b61]">Data pesanan terhubung ke Prisma dan Supabase, lalu tampil otomatis di sini.</p></div>}</div></div>;
}

function OrderCard({ order, onUpdate }: { order: Order; onUpdate: (order: Order, status: string) => void }) {
    const status = statusText[order.status] || order.status;
    const tone = statusTone[order.status] || "bg-[#EFE6D5] text-[#2E2A26]";
    const StatusIcon = order.status === "PENDING" || order.status === "pending" ? Wallet : order.status === "PROCESSING" || order.status === "processing" ? PackageSearch : order.status === "PACKED" || order.status === "packed" ? PackageCheck : order.status === "SHIPPED" || order.status === "shipped" ? Truck : order.status === "COMPLETED" || order.status === "completed" ? CheckCircle2 : XCircle;
    const downloadInvoice = () => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.text("AFA STORE - INVOICE", 14, 18);
        doc.setFontSize(11); doc.text(`Invoice: ${order.invoice}`, 14, 30); doc.text(`Tanggal: ${new Date(order.createdAt).toLocaleString("id-ID")}`, 14, 38); doc.text(`Status: ${status}`, 14, 46);
        let y = 60; order.items.forEach((item) => { doc.text(`${item.name} x${item.quantity} - ${money(item.subtotal)}`, 14, y); y += 8; });
        y += 4; doc.text(`Subtotal: ${money(order.subtotal)}`, 14, y); doc.text(`Ongkir: ${money(order.shipping)}`, 14, y + 8); doc.text(`Diskon: ${money(order.discount || 0)}`, 14, y + 16); doc.setFontSize(14); doc.text(`Total: ${money(order.total)}`, 14, y + 28); doc.save(`${order.invoice}.pdf`);
    };
    const actions = order.status === "PENDING" || order.status === "pending"
        ? [{ label: "Bayar Sekarang", kind: "link" as const }, { label: "Batalkan Pesanan", kind: "status" as const, status: "CANCELLED" as const }, { label: "Download Invoice PDF", kind: "invoice" as const }, { label: "Beli Lagi", kind: "link" as const }]
        : order.status === "PROCESSING" || order.status === "processing" || order.status === "PACKED" || order.status === "packed"
            ? [{ label: "Batalkan Pesanan", kind: "status" as const, status: "CANCELLED" as const }, { label: "Download Invoice PDF", kind: "invoice" as const }, { label: "Beli Lagi", kind: "link" as const }]
            : order.status === "SHIPPED" || order.status === "shipped"
                ? [{ label: "Lacak Paket", kind: "link" as const }, { label: "Konfirmasi Pesanan Diterima", kind: "status" as const, status: "COMPLETED" as const }, { label: "Download Invoice PDF", kind: "invoice" as const }, { label: "Beli Lagi", kind: "link" as const }]
                : order.status === "COMPLETED" || order.status === "completed"
                    ? [{ label: "Beri Ulasan", kind: "link" as const }, { label: "Download Invoice PDF", kind: "invoice" as const }, { label: "Beli Lagi", kind: "link" as const }]
                    : [{ label: "Download Invoice PDF", kind: "invoice" as const }, { label: "Beli Lagi", kind: "link" as const }];

    return <article className="overflow-hidden rounded-[32px] border border-[#D4AF37]/25 bg-white shadow-[0_22px_60px_rgba(16,33,22,0.10)]"><div className="bg-[linear-gradient(135deg,#184C3A,#2E6A4A_55%,#D4AF37)] p-5 text-white"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#F7EAD0]">Invoice</p><h3 className="mt-1 text-2xl font-black">{order.invoice}</h3><p className="text-sm text-white/75">Dibuat {new Date(order.createdAt).toLocaleString("id-ID")}</p></div><span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${tone}`}><StatusIcon size={18} />{status}</span></div></div><div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]"><section><h4 className="font-bold text-[#184C3A]">Daftar Produk</h4><div className="mt-3 grid gap-3">{order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#FFFBF4] p-3"><div><b>{item.name}</b><p className="text-sm text-[#5d6b61]">{item.quantity} x {money(item.price || Math.round(item.subtotal / item.quantity))}</p></div><b className="text-[#B28B18]">{money(item.subtotal)}</b></div>)}</div><Timeline order={order} /><div className="mt-5 flex flex-wrap gap-2">{actions.map((action) => <button key={action.label} onClick={() => action.kind === "status" ? onUpdate(order, action.status) : action.kind === "invoice" ? downloadInvoice() : undefined} className={action.label === "Bayar Sekarang" || action.label === "Lacak Paket" || action.label === "Konfirmasi Pesanan Diterima" || action.label === "Beri Ulasan" ? "rounded-full bg-[#184C3A] px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-[#123B2D]" : "rounded-full border border-[#D4AF37]/40 bg-white px-4 py-2 text-sm font-bold text-[#184C3A] hover:bg-[#D4AF37]/10"}>{action.label}{action.kind === "invoice" && <Download className="ml-2 inline-block" size={14} />}</button>)}</div></section><aside className="rounded-3xl bg-[#102116] p-5 text-white"><p className="text-sm font-bold text-[#D4AF37]">Detail Pesanan</p><div className="mt-4 space-y-3 text-sm"><Line label="Subtotal" value={money(order.subtotal)} /><Line label="Ongkir" value={money(order.shipping)} /><Line label="Diskon" value={money(order.discount || 0)} />{order.voucher && <Line label="Voucher" value={order.voucher} />}<div className="border-t border-white/15 pt-3"><Line label="Total" value={money(order.total)} strong /></div></div><div className="mt-5 rounded-2xl bg-white/10 p-3 text-sm"><p className="font-bold text-[#F7EAD0]">Pelacakan</p><p>{order.courier || "Kurir belum dipilih"}</p><p>{order.trackingNumber || "Nomor resi belum tersedia"}</p></div></aside></div></article>;
}

function Timeline({ order }: { order: Order }) {
    const cancelled = Boolean(order.cancelledAt) || statusText[order.status] === "Dibatalkan";
    const steps = cancelled ? [["Pesanan Dibuat", order.createdAt], ["Dibatalkan", order.cancelledAt || order.updatedAt || order.createdAt]] : [["Belum Bayar", order.paidAt || order.createdAt], ["Diproses", order.processedAt], ["Dikemas", order.packedAt], ["Dikirim", order.shippedAt], ["Selesai", order.completedAt]];
    return <div className="mt-5 rounded-3xl border border-[#D4AF37]/20 bg-[#F8F4EC] p-4"><h4 className="font-bold text-[#184C3A]">Timeline Status</h4><div className="mt-4 grid gap-3 md:grid-cols-5">{steps.map(([label, date], index) => <div key={label} className="rounded-2xl bg-white p-3 shadow-sm"><span className={`mb-2 grid h-8 w-8 place-items-center rounded-full ${date ? "bg-[#184C3A] text-white" : "bg-[#EFE6D5] text-[#8B6B3F]"}`}>{date ? <CheckCircle2 size={16} /> : index + 1}</span><b className="text-sm">{label}</b><p className="mt-1 text-xs text-[#5d6b61]">{date ? new Date(date as string).toLocaleString("id-ID") : "Menunggu update"}</p></div>)}</div></div>;
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <p className={`flex justify-between gap-3 ${strong ? "text-lg font-black text-[#F7EAD0]" : ""}`}><span>{label}</span><span>{value}</span></p>; }
function WishlistList({ items, onRemove }: { items: Wishlist[]; onRemove: (item: Wishlist) => void }) { return <div className="mt-6 grid gap-4 md:grid-cols-2">{items.length ? items.map((i) => <article key={i.id} className="rounded-3xl bg-white p-4 shadow"><b>{i.name}</b><p>{money(i.price)}</p><button onClick={() => onRemove(i)} className="mt-2 rounded-xl bg-[#D4AF37] px-4 py-2 font-bold text-[#184C3A]">Hapus Wishlist</button></article>) : <p>Wishlist masih kosong.</p>}</div>; }
function Vouchers({ vouchers }: { vouchers: Voucher[] }) { return <div className="mt-6 grid gap-4 md:grid-cols-2">{vouchers.length ? vouchers.map((v) => <article key={v.id} className="rounded-3xl bg-white p-5 shadow"><b className="text-[#184C3A]">{v.code}</b><h3 className="text-xl font-bold">{v.title}</h3><p>{v.description || "Voucher tersedia untuk akun Anda."}</p><p className="font-bold text-[#B28B18]">{v.discountType === "percent" ? `${v.value}%` : money(v.value)} - Min. {money(v.minSpend)}</p>{v.endsAt && <p className="text-sm text-[#5d6b61]">Berlaku sampai {new Date(v.endsAt).toLocaleDateString("id-ID")}</p>}</article>) : <p>Belum ada voucher aktif.</p>}</div>; }
function Checkouts({ histories }: { histories: Checkout[] }) { return <div className="mt-6 grid gap-4">{histories.length ? histories.map((h) => <article key={h.id} className="rounded-3xl bg-white p-5 shadow"><b>{new Date(h.createdAt).toLocaleString("id-ID")}</b><p>{h.channel.toUpperCase()} - {money(h.total)}</p><details><summary className="cursor-pointer font-bold text-[#184C3A]">Lihat pesan</summary><pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-[#f7ead0] p-3 text-sm">{h.message}</pre></details></article>) : <p>Belum ada riwayat checkout WhatsApp.</p>}</div>; }
function Password({ onSave }: { onSave: (body: Record<string, FormDataEntryValue>) => void }) { return <form className="mt-6 grid max-w-xl gap-4" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(new FormData(e.currentTarget))); e.currentTarget.reset(); }}>{[["currentPassword", "Password Lama"], ["password", "Password Baru"], ["confirmPassword", "Konfirmasi Password"]].map(([n, l]) => <input key={n} name={n} type="password" placeholder={l} className="rounded-2xl border px-4 py-3" />)}<button className="rounded-2xl bg-[#184C3A] px-6 py-3 font-bold text-white">Ubah Password</button></form>; }
