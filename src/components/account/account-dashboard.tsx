"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type User = { id: string; name: string; email: string; phone: string | null; image: string | null; role: string; createdAt?: string };
type Address = { id: string; recipientName: string; phone: string; province: string; city: string; district: string; village: string; postalCode: string; detail: string; note?: string; isDefault: boolean };
type Wishlist = { id: string; productRef: string; name: string; price: number; image?: string };
type Order = { id: string; invoice: string; createdAt: string; total: number; status: string; items: { id: string; name: string; quantity: number; subtotal: number }[] };
type Checkout = { id: string; createdAt: string; total: number; channel: string; message: string };
type Voucher = { id: string; code: string; title: string; description?: string; value: number; discountType: string; minSpend: number };

const tabs = ["Profil Saya", "Alamat Saya", "Pesanan Saya", "Wishlist", "Voucher Saya", "Riwayat Checkout", "Ubah Password"];
const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const statusText: Record<string, string> = { pending: "Menunggu Pembayaran", processing: "Diproses", shipped: "Dikirim", completed: "Selesai", cancelled: "Dibatalkan" };

export function AccountDashboard({ initialUser }: { initialUser: User }) {
    const [user, setUser] = useState(initialUser);
    const [active, setActive] = useState(tabs[0]);
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [histories, setHistories] = useState<Checkout[]>([]);
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [msg, setMsg] = useState("");

    const refresh = async () => {
        const [a, w, o, h, v] = await Promise.all([fetch("/api/account/addresses"), fetch("/api/account/wishlist"), fetch("/api/account/orders"), fetch("/api/account/checkout-history"), fetch("/api/account/vouchers")]);
        if (a.ok) setAddresses((await a.json()).addresses || []);
        if (w.ok) setWishlist((await w.json()).wishlist || []);
        if (o.ok) setOrders((await o.json()).orders || []);
        if (h.ok) setHistories((await h.json()).histories || []);
        if (v.ok) setVouchers((await v.json()).vouchers || []);
    };
    useEffect(() => { refresh(); }, []);

    const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; };
    const submit = async (path: string, body: Record<string, FormDataEntryValue | boolean | number>, method = "PATCH") => {
        setMsg("");
        const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) return setMsg(data.message || "Gagal menyimpan data.");
        if (data.user) setUser(data.user);
        setMsg(data.message || "Data berhasil disimpan.");
        refresh();
    };

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e1,#ffffff_48%,#eef6ef)] px-4 py-6 text-[#102116] md:py-10"><div className="mx-auto max-w-7xl"><Link href="/" className="font-bold text-[#184C3A]">← AFA STORE</Link><section className="mt-5 grid gap-5 md:grid-cols-[320px_1fr]"><aside className="rounded-4xl border border-white/70 bg-white/65 p-5 shadow-xl backdrop-blur"><div className="flex items-center gap-4"><div className="relative h-20 w-20 overflow-hidden rounded-full bg-[#184C3A]">{user.image ? <Image src={user.image} alt={user.name} fill className="object-cover" /> : <span className="grid h-full place-items-center text-2xl font-bold text-[#D4AF37]">{user.name.slice(0, 2).toUpperCase()}</span>}</div><div><h1 className="text-2xl font-bold text-[#184C3A]">{user.name}</h1><p className="text-sm">{user.email}</p><p className="text-sm">{user.phone || "WhatsApp belum diisi"}</p><p className="mt-1 text-xs text-[#D4AF37]">Bergabung {user.createdAt ? new Date(user.createdAt).toLocaleDateString("id-ID") : "-"}</p></div></div><nav className="mt-6 grid gap-2">{tabs.map((tab) => <button key={tab} onClick={() => setActive(tab)} className={`rounded-2xl px-4 py-3 text-left font-bold ${active === tab ? "bg-[#184C3A] text-white" : "bg-white/70 text-[#184C3A]"}`}>{tab}</button>)}<button onClick={logout} className="rounded-2xl bg-[#D4AF37] px-4 py-3 text-left font-bold text-[#184C3A]">Logout</button></nav></aside><section className="rounded-4xl border border-white/70 bg-white/70 p-5 shadow-xl backdrop-blur md:p-8"><h2 className="text-3xl font-bold text-[#184C3A]">{active}</h2>{msg && <p className="mt-4 rounded-2xl bg-[#184C3A]/10 p-3 font-bold text-[#184C3A]">{msg}</p>}{active === "Profil Saya" && <Profile user={user} onSave={(body) => submit("/api/account/profile", body)} />}{active === "Alamat Saya" && <Addresses addresses={addresses} onSave={(body) => submit("/api/account/addresses", body, "POST")} onDefault={(id) => submit("/api/account/addresses", { id, isDefault: true })} />}{active === "Pesanan Saya" && <Orders orders={orders} />}{active === "Wishlist" && <WishlistList items={wishlist} onRemove={(item) => submit("/api/account/wishlist", { productRef: item.productRef, name: item.name, price: item.price, image: item.image || "" }, "POST")} />}{active === "Voucher Saya" && <Vouchers vouchers={vouchers} />}{active === "Riwayat Checkout" && <Checkouts histories={histories} />}{active === "Ubah Password" && <Password onSave={(body) => submit("/api/account/password", body)} />}</section></section></div></main>;
}

function Profile({ user, onSave }: { user: User; onSave: (body: Record<string, FormDataEntryValue | boolean | number>) => void }) { return <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, FormDataEntryValue>); }}>{["image", "name", "email", "phone"].map((n) => <label key={n} className="font-bold capitalize">{n === "image" ? "Foto URL" : n}<input name={n} defaultValue={(user as unknown as Record<string, string | null>)[n] || ""} className="mt-2 w-full rounded-2xl border px-4 py-3" /></label>)}<button className="rounded-2xl bg-[#184C3A] px-6 py-3 font-bold text-white md:col-span-2">Simpan Profil</button></form>; }
function Addresses({ addresses, onSave, onDefault }: { addresses: Address[]; onSave: (body: Record<string, FormDataEntryValue | boolean | number>) => void; onDefault: (id: string) => void }) { const fields = [["recipientName", "Nama Penerima"], ["phone", "No HP"], ["province", "Provinsi"], ["city", "Kota"], ["district", "Kecamatan"], ["village", "Kelurahan"], ["postalCode", "Kode Pos"], ["detail", "Alamat Lengkap"], ["note", "Catatan"]]; return <div className="mt-6 grid gap-5"><form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, FormDataEntryValue>); e.currentTarget.reset(); }}>{fields.map(([n, l]) => <input key={n} name={n} placeholder={l} className="rounded-2xl border px-4 py-3" />)}<label className="flex items-center gap-2 font-bold"><input type="checkbox" name="isDefault" value="true" /> Set Default Address</label><button className="rounded-2xl bg-[#184C3A] px-6 py-3 font-bold text-white">Tambah Alamat</button></form><div className="grid gap-3">{addresses.map((a) => <article key={a.id} className="rounded-3xl bg-white p-4 shadow"><b>{a.recipientName}</b> {a.isDefault && <span className="rounded-full bg-[#D4AF37] px-2 py-1 text-xs font-bold">Default</span>}<p>{a.phone} - {a.city}, {a.province} {a.postalCode}</p><p>{a.detail}</p><button onClick={() => onDefault(a.id)} className="mt-2 text-sm font-bold text-[#184C3A]">Jadikan default</button></article>)}</div></div>; }
function Orders({ orders }: { orders: Order[] }) { return <div className="mt-6 grid gap-4">{orders.length ? orders.map((o) => <article key={o.id} className="rounded-3xl bg-white p-5 shadow"><div className="flex flex-wrap justify-between gap-3"><b>{o.invoice}</b><span className="rounded-full bg-[#184C3A] px-3 py-1 text-sm font-bold text-white">{statusText[o.status] || o.status}</span></div><p>{new Date(o.createdAt).toLocaleDateString("id-ID")} - {money(o.total)}</p>{o.items.map((i) => <p key={i.id} className="text-sm">{i.name} x{i.quantity} = {money(i.subtotal)}</p>)}</article>) : <p>Belum ada pesanan.</p>}</div>; }
function WishlistList({ items, onRemove }: { items: Wishlist[]; onRemove: (item: Wishlist) => void }) { return <div className="mt-6 grid gap-4 md:grid-cols-2">{items.length ? items.map((i) => <article key={i.id} className="rounded-3xl bg-white p-4 shadow"><b>{i.name}</b><p>{money(i.price)}</p><button onClick={() => onRemove(i)} className="mt-2 rounded-xl bg-[#D4AF37] px-4 py-2 font-bold text-[#184C3A]">Hapus Wishlist</button></article>) : <p>Wishlist masih kosong.</p>}</div>; }
function Vouchers({ vouchers }: { vouchers: Voucher[] }) { return <div className="mt-6 grid gap-4 md:grid-cols-2">{vouchers.length ? vouchers.map((v) => <article key={v.id} className="rounded-3xl bg-white p-5 shadow"><b className="text-[#184C3A]">{v.code}</b><h3 className="text-xl font-bold">{v.title}</h3><p>{v.description || "Voucher tersedia untuk akun Anda."}</p><p className="font-bold text-[#D4AF37]">{v.discountType === "percent" ? `${v.value}%` : money(v.value)} - Min. {money(v.minSpend)}</p></article>) : <p>Belum ada voucher aktif.</p>}</div>; }
function Checkouts({ histories }: { histories: Checkout[] }) { return <div className="mt-6 grid gap-4">{histories.length ? histories.map((h) => <article key={h.id} className="rounded-3xl bg-white p-5 shadow"><b>{new Date(h.createdAt).toLocaleString("id-ID")}</b><p>{h.channel.toUpperCase()} - {money(h.total)}</p><details><summary className="cursor-pointer font-bold text-[#184C3A]">Lihat pesan</summary><pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-[#f7ead0] p-3 text-sm">{h.message}</pre></details></article>) : <p>Belum ada riwayat checkout WhatsApp.</p>}</div>; }
function Password({ onSave }: { onSave: (body: Record<string, FormDataEntryValue>) => void }) { return <form className="mt-6 grid max-w-xl gap-4" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(new FormData(e.currentTarget))); e.currentTarget.reset(); }}>{[["currentPassword", "Password Lama"], ["password", "Password Baru"], ["confirmPassword", "Konfirmasi Password"]].map(([n, l]) => <input key={n} name={n} type="password" placeholder={l} className="rounded-2xl border px-4 py-3" />)}<button className="rounded-2xl bg-[#184C3A] px-6 py-3 font-bold text-white">Ubah Password</button></form>; }