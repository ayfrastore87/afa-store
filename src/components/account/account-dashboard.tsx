"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
    Ban,
    ChevronLeft,
    ChevronRight,
    Download,
    Handshake,
    Heart,
    Home,
    KeyRound,
    Loader2,
    LogOut,
    Mail,
    MapPin,
    PackageSearch,
    Pencil,
    Phone,
    Plus,
    Trash2,
    User as UserIcon,
    X,
} from "lucide-react";
import jsPDF from "jspdf";
import { parseJsonResponse } from "@/lib/api-fetch";
import { getPaymentStatusPresentation } from "@/lib/payment-status";
import { useCart } from "@/context/cart-context";

type User = { id: string; name: string; email: string; phone: string | null; image: string | null; role: string; createdAt?: string };
type Item = { id: string; name: string; quantity: number; price?: number; subtotal: number; image?: string | null };
type Order = { id: string; invoice: string; createdAt: string; subtotal: number; shipping: number; discount?: number; total: number; voucher?: string | null; status: string; paymentStatus?: string; courier?: string | null; trackingNumber?: string | null; paidAt?: string | null; processedAt?: string | null; packedAt?: string | null; shippedAt?: string | null; completedAt?: string | null; cancelledAt?: string | null; items: Item[] };
type Filter = "Semua" | "Belum Bayar" | "Diproses" | "Selesai" | "Dibatalkan";
type Address = { id: string; recipientName: string; phone: string; province: string; city: string; district: string; village: string; postalCode: string; detail: string; note: string | null; isDefault: boolean; createdAt?: string };
type WishItem = { id: string; productId?: string | null; productRef?: string; name: string; price: number; image: string; slug?: string | null; isActive?: boolean };

const filters: Filter[] = ["Semua", "Belum Bayar", "Diproses", "Selesai", "Dibatalkan"];
const labels: Record<string, string> = { pending: "Belum Bayar", PENDING: "Belum Bayar", processing: "Diproses", PROCESSING: "Diproses", packed: "Dikemas", PACKED: "Dikemas", shipped: "Dikirim", SHIPPED: "Dikirim", completed: "Selesai", COMPLETED: "Selesai", cancelled: "Dibatalkan", CANCELLED: "Dibatalkan" };
const tones: Record<string, string> = { "Belum Bayar": "bg-[#fff2d6] text-[#8b5e00]", Diproses: "bg-[#e8f3ee] text-[#174c3a]", Dikemas: "bg-[#f5ebd8] text-[#76551d]", Dikirim: "bg-[#e8f0f3] text-[#245165]", Selesai: "bg-[#e8f3e3] text-[#29621a]", Dibatalkan: "bg-[#f7e9e6] text-[#8c2e25]" };
const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const date = (v?: string | null) => (v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const orderStatus = (o: Order) => labels[o.status] || o.status;
const unitPrice = (i: Item) => i.price || Math.round(i.subtotal / (i.quantity || 1));
const canCancel = (o: Order) => o.status === "PENDING" || o.status === "pending";
const productImage = (i?: Item) => i?.image || "/AFA LOGO.svg";

const inputClass = "min-h-11 w-full rounded-xl border border-[#ded9cc] bg-white px-3 text-sm text-[#17241d] outline-none transition focus:border-[#b18a3d] focus:ring-2 focus:ring-[#b18a3d]/20";

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[#5f6863]">{label}</span>
            {children}
        </label>
    );
}

function Alert({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
    const cls = tone === "success" ? "bg-[#e8f3e3] text-[#29621a]" : "bg-[#f7e9e6] text-[#8c2e25]";
    return <p className={`rounded-xl p-3 text-xs font-semibold ${cls}`}>{children}</p>;
}

type Section = "pesanan" | "akun";
type AccountView = "menu" | "profil" | "alamat" | "wishlist" | "password";

const ACCOUNT_MENU: { key: Exclude<AccountView, "menu">; label: string; icon: typeof UserIcon; desc: string }[] = [
    { key: "profil", label: "Profil Saya", icon: UserIcon, desc: "Kelola nama dan nomor telepon Anda." },
    { key: "alamat", label: "Alamat Saya", icon: MapPin, desc: "Atur alamat pengiriman dan alamat utama." },
    { key: "wishlist", label: "Wishlist", icon: Heart, desc: "Produk favorit yang ingin Anda beli." },
    { key: "password", label: "Ubah Password", icon: KeyRound, desc: "Perbarui kata sandi akun Anda." },
];

const ACCOUNT_TITLES: Record<Exclude<AccountView, "menu">, string> = {
    profil: "Profil Saya",
    alamat: "Alamat Saya",
    wishlist: "Wishlist",
    password: "Ubah Password",
};

export function AccountDashboard({ initialUser }: { initialUser: User }) {
    const [user, setUser] = useState<User>(initialUser);
    const [section, setSection] = useState<Section>("pesanan");
    const [accountView, setAccountView] = useState<AccountView>("menu");
    const [message, setMessage] = useState("");
    const [partnerActive, setPartnerActive] = useState(false);

    useEffect(() => {
        let active = true;
        fetch("/api/account/partner", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (active && d && (d as { partner?: { status?: string } | null }).partner?.status === "ACTIVE") setPartnerActive(true);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    const logout = async () => {
        const r = await fetch("/api/auth/logout", { method: "POST" });
        if (r.ok) location.href = "/";
        else setMessage("Logout gagal. Silakan coba lagi.");
    };

    const navigate = (s: Section) => {
        setSection(s);
        if (s === "akun") setAccountView("menu");
    };

    return (
        <main className="min-h-screen bg-[#f7f4ec] pb-24 text-[#17241d]">
            <header className="sticky top-0 z-30 border-b border-[#173f31]/10 bg-white/95">
                <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
                    <Link href="/" className="font-display text-xl font-bold text-[#123d2d]">AFA <span className="text-[#b18a3d]">STORE</span></Link>
                    <div className="flex items-center gap-2">
                        <span className="hidden text-right sm:block">
                            <b className="block max-w-40 truncate text-xs">{user.name}</b>
                            <small className="text-[10px] text-[#7a817c]">Akun Saya</small>
                        </span>
                        <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#123d2d] text-xs font-bold text-[#e3c77b]">
                            {user.image ? <Image src={user.image} alt={user.name} width={36} height={36} className="h-full w-full object-cover" unoptimized /> : user.name.slice(0, 2).toUpperCase()}
                        </span>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-4xl px-3.5 py-5">
                {message && <div className="mt-3"><Alert tone="error">{message}</Alert></div>}

                {section === "pesanan" ? (
                    <OrdersSection />
                ) : accountView === "menu" ? (
                    <AccountMenu
                        user={user}
                        partnerActive={partnerActive}
                        onSelect={(v) => setAccountView(v)}
                        onLogout={() => void logout()}
                    />
                ) : (
                    <>
                        <AccountSubheader title={ACCOUNT_TITLES[accountView]} onBack={() => setAccountView("menu")} />
                        {accountView === "profil" && <ProfileSection user={user} onSaved={(name, phone) => setUser((u) => ({ ...u, name, phone }))} />}
                        {accountView === "alamat" && <AddressSection />}
                        {accountView === "wishlist" && <WishlistSection />}
                        {accountView === "password" && <PasswordSection />}
                    </>
                )}
            </div>

            <Bottom section={section} onNavigate={navigate} />
        </main>
    );
}

function AccountMenu({ user, partnerActive, onSelect, onLogout }: { user: User; partnerActive: boolean; onSelect: (v: Exclude<AccountView, "menu">) => void; onLogout: () => void }) {
    return (
        <div>
            <div className="flex items-center gap-3 rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-sm">
                <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-[#123d2d] text-sm font-bold text-[#e3c77b]">{user.image ? <Image src={user.image} alt={user.name} width={48} height={48} className="h-full w-full object-cover" unoptimized /> : user.name.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0">
                    <b className="block truncate text-sm text-[#123d2d]">{user.name}</b>
                    <small className="block truncate text-[11px] text-[#7a817c]">{user.email}</small>
                </div>
            </div>

            <nav className="mt-4 grid gap-2.5">
                {ACCOUNT_MENU.map((m) => (
                    <button key={m.key} onClick={() => onSelect(m.key)} className="flex items-center gap-3 rounded-2xl border border-[#e5e0d5] bg-white p-4 text-left shadow-sm transition hover:border-[#b18a3d]">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0ece2] text-[#123d2d]"><m.icon size={20} /></span>
                        <span className="min-w-0 flex-1">
                            <b className="block text-sm text-[#123d2d]">{m.label}</b>
                            <small className="block text-[11px] text-[#7a817c]">{m.desc}</small>
                        </span>
                        <ChevronRight size={16} className="text-[#b18a3d]" />
                    </button>
                ))}
            </nav>

            <section className="mt-4 overflow-hidden rounded-2xl border border-[#e5e0d5] bg-white shadow-sm">
                {partnerActive && (
                    <Link href="/partner" className="flex items-center gap-3 border-b border-[#f0ece2] p-4 transition hover:bg-[#f7f4ec]">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f3e3] text-[#29621a]"><Handshake size={20} /></span>
                        <span className="min-w-0 flex-1">
                            <b className="block text-sm text-[#123d2d]">Dashboard Mitra</b>
                            <small className="text-[11px] text-[#7a817c]">Kelola toko, produk, dan penjualan mitra Anda.</small>
                        </span>
                        <ChevronRight size={16} className="text-[#b18a3d]" />
                    </Link>
                )}
                <button onClick={onLogout} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-[#f7f4ec]">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f7e9e6] text-[#8c2e25]"><LogOut size={20} /></span>
                    <b className="text-sm text-[#8c2e25]">Keluar</b>
                </button>
            </section>
        </div>
    );
}

function AccountSubheader({ title, onBack }: { title: string; onBack: () => void }) {
    return (
        <div className="mb-4 flex items-center gap-2">
            <button onClick={onBack} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ded9cc] bg-white text-[#123d2d] transition hover:bg-[#f7f4ec]" aria-label="Kembali ke menu Akun">
                <ChevronLeft size={18} />
            </button>
            <h1 className="font-display text-xl font-bold text-[#123d2d]">{title}</h1>
        </div>
    );
}

function ProfileSection({ user, onSaved }: { user: User; onSaved: (name: string, phone: string) => void }) {
    const [name, setName] = useState(user.name || "");
    const [phone, setPhone] = useState(user.phone || "");
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [ok, setOk] = useState("");
    const [err, setErr] = useState("");

    const save = async () => {
        setOk("");
        setErr("");
        if (name.trim().length < 2) {
            setErr("Nama minimal 2 karakter.");
            return;
        }
        setBusy(true);
        try {
            const r = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: user.email, phone: phone.trim() }) });
            const data = await r.json().catch(() => ({})) as { message?: string };
            if (r.ok) {
                onSaved(name.trim(), phone.trim());
                setOk("Profil berhasil diperbarui.");
                setEditing(false);
            } else setErr(data.message || "Gagal memperbarui profil.");
        } catch {
            setErr("Gagal memperbarui profil. Silakan coba lagi.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="overflow-hidden rounded-2xl border border-[#e5e0d5] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#f0ece2] p-4">
                <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-[#123d2d] text-sm font-bold text-[#e3c77b]">{user.image ? <Image src={user.image} alt={user.name} width={48} height={48} className="h-full w-full object-cover" unoptimized /> : user.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                        <b className="block text-sm text-[#123d2d]">{user.name}</b>
                        <small className="text-[11px] text-[#7a817c]">Pelanggan AFA STORE</small>
                    </div>
                </div>
                <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#ded9cc] bg-white px-3 py-2 text-xs font-bold text-[#123d2d] transition hover:bg-[#f7f4ec]"><Pencil size={14} /> Edit Profil</button>
            </div>

            <div className="p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-xl bg-[#faf8f2] p-3"><UserIcon size={16} className="text-[#b18a3d]" /><div className="min-w-0"><small className="block text-[10px] text-[#7a817c]">Nama</small><b className="block truncate text-xs">{user.name}</b></div></div>
                    <div className="flex items-center gap-3 rounded-xl bg-[#faf8f2] p-3"><Mail size={16} className="text-[#b18a3d]" /><div className="min-w-0"><small className="block text-[10px] text-[#7a817c]">Email</small><b className="block truncate text-xs">{user.email}</b></div></div>
                    <div className="flex items-center gap-3 rounded-xl bg-[#faf8f2] p-3 sm:col-span-2"><Phone size={16} className="text-[#b18a3d]" /><div className="min-w-0"><small className="block text-[10px] text-[#7a817c]">Nomor Telepon</small><b className="block truncate text-xs">{user.phone || "Belum diisi"}</b></div></div>
                </div>

                {editing && (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-[#e5e0d5] bg-[#faf8f2] p-4">
                        {ok && <Alert tone="success">{ok}</Alert>}
                        {err && <Alert tone="error">{err}</Alert>}
                        <Field label="Nama"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
                        <Field label="Nomor Telepon"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} placeholder="08xxxxxxxxxx" /></Field>
                        <div className="flex gap-2">
                            <button onClick={() => { setEditing(false); setOk(""); setErr(""); setName(user.name); setPhone(user.phone || ""); }} className="min-h-10 flex-1 rounded-xl border border-[#ded9cc] bg-white px-4 text-sm font-bold text-[#5f6863]">Batal</button>
                            <button onClick={() => void save()} disabled={busy} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#123d2d] px-4 text-sm font-bold text-white disabled:opacity-60">{busy && <Loader2 size={15} className="animate-spin" />}Simpan</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const EMPTY_ADDRESS = { recipientName: "", phone: "", province: "", city: "", district: "", village: "", postalCode: "", detail: "", note: "", isDefault: false };

function AddressSection() {
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...EMPTY_ADDRESS });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const load = async () => {
        try {
            const r = await fetch("/api/account/addresses", { cache: "no-store" });
            if (r.ok) setAddresses(((await r.json()) as { addresses?: Address[] }).addresses || []);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const set = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

    const openCreate = () => {
        setForm({ ...EMPTY_ADDRESS });
        setEditingId(null);
        setErr("");
        setOpen(true);
    };

    const openEdit = (a: Address) => {
        setForm({ recipientName: a.recipientName, phone: a.phone, province: a.province, city: a.city, district: a.district, village: a.village, postalCode: a.postalCode, detail: a.detail, note: a.note || "", isDefault: a.isDefault });
        setEditingId(a.id);
        setErr("");
        setOpen(true);
    };

    const submit = async () => {
        setErr("");
        setBusy(true);
        try {
            const payload = { ...form, isDefault: form.isDefault || (editingId === null && addresses.length === 0) };
            const r = await fetch("/api/account/addresses", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload) });
            const data = await r.json().catch(() => ({})) as { message?: string };
            if (r.ok) {
                setOpen(false);
                await load();
            } else setErr(data.message || "Gagal menyimpan alamat.");
        } catch {
            setErr("Gagal menyimpan alamat. Silakan coba lagi.");
        } finally {
            setBusy(false);
        }
    };

    const setDefault = async (id: string) => {
        setErr("");
        try {
            const r = await fetch("/api/account/addresses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isDefault: true }) });
            if (r.ok) await load();
            else setErr("Gagal mengubah alamat utama.");
        } catch {
            setErr("Gagal mengubah alamat utama.");
        }
    };

    const remove = async (id: string) => {
        setErr("");
        try {
            const r = await fetch("/api/account/addresses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
            if (r.ok) await load();
            else setErr("Gagal menghapus alamat.");
        } catch {
            setErr("Gagal menghapus alamat.");
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between">
                <b className="text-sm text-[#123d2d]">Daftar Alamat</b>
                <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-[#123d2d] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#0f2e23]"><Plus size={15} /> Tambah Alamat</button>
            </div>
            {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
            <div className="mt-3 grid gap-2.5">
                {loading ? [1, 2].map((x) => <div key={x} className="h-24 animate-pulse rounded-2xl bg-white" />) : addresses.length ? addresses.map((a) => (
                    <article key={a.id} className="rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f0ece2] text-[#b18a3d]"><MapPin size={17} /></span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <b className="text-sm text-[#123d2d]">{a.recipientName}</b>
                                    <span className="text-xs text-[#7a817c]">{a.phone}</span>
                                    {a.isDefault && <span className="rounded-full bg-[#e8f3e3] px-2 py-0.5 text-[10px] font-bold text-[#29621a]">Utama</span>}
                                </div>
                                <p className="mt-1 text-xs text-[#5f6863]">{a.detail}, {a.village}, {a.district}, {a.city}, {a.province} {a.postalCode}</p>
                                {a.note && <p className="mt-1 text-[11px] text-[#7a817c]">Catatan: {a.note}</p>}
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-[#f0ece2] pt-3">
                            {!a.isDefault && <button onClick={() => void setDefault(a.id)} className="rounded-lg border border-[#ded9cc] bg-white px-3 py-1.5 text-[11px] font-bold text-[#123d2d] hover:bg-[#f7f4ec]">Jadikan Utama</button>}
                            <button onClick={() => openEdit(a)} className="rounded-lg border border-[#ded9cc] bg-white px-3 py-1.5 text-[11px] font-bold text-[#123d2d] hover:bg-[#f7f4ec]"><Pencil size={12} className="mr-1 inline" />Edit</button>
                            <button onClick={() => void remove(a.id)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100"><Trash2 size={12} className="mr-1 inline" />Hapus</button>
                        </div>
                    </article>
                )) : <div className="rounded-2xl border border-dashed border-[#ded9cc] bg-white py-10 text-center"><MapPin className="mx-auto text-[#b18a3d]" /><b className="mt-2 block text-sm">Belum ada alamat</b><small className="text-[11px] text-[#7a817c]">Tambahkan alamat pengiriman pertama Anda.</small></div>}
            </div>

            {open && <AddressSheet title={editingId ? "Edit Alamat" : "Tambah Alamat"} form={form} set={set} busy={busy} err={err} onClose={() => setOpen(false)} onSubmit={() => void submit()} />}
        </div>
    );
}

function AddressSheet({ title, form, set, busy, err, onClose, onSubmit }: { title: string; form: typeof EMPTY_ADDRESS; set: (k: string, v: string | boolean) => void; busy: boolean; err: string; onClose: () => void; onSubmit: () => void }) {
    const rows: [string, keyof typeof EMPTY_ADDRESS][] = [
        ["Nama Penerima", "recipientName"],
        ["No. Telepon", "phone"],
        ["Provinsi", "province"],
        ["Kota/Kabupaten", "city"],
        ["Kecamatan", "district"],
        ["Desa/Kelurahan", "village"],
        ["Kode Pos", "postalCode"],
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#17241d]/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold text-[#123d2d]">{title}</h2>
                    <button onClick={onClose} aria-label="Tutup" className="grid h-9 w-9 place-items-center rounded-full bg-[#f0ece2] text-[#5f6863]"><X size={17} /></button>
                </div>
                {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
                <div className="mt-4 grid gap-3">
                    {rows.map(([label, key]) => (
                        <Field key={key} label={label}>
                            <input value={String(form[key])} onChange={(e) => set(key, e.target.value)} className={inputClass} inputMode={key === "phone" || key === "postalCode" ? "tel" : "text"} />
                        </Field>
                    ))}
                    <Field label="Alamat Lengkap">
                        <textarea value={form.detail} onChange={(e) => set("detail", e.target.value)} rows={2} className={inputClass} />
                    </Field>
                    <Field label="Catatan (opsional)">
                        <input value={form.note} onChange={(e) => set("note", e.target.value)} className={inputClass} />
                    </Field>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#5f6863]">
                        <input type="checkbox" checked={form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} className="h-4 w-4 rounded border-[#ded9cc] text-[#123d2d]" />
                        Jadikan alamat utama
                    </label>
                </div>
                <button onClick={onSubmit} disabled={busy} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#123d2d] px-4 text-sm font-bold text-white disabled:opacity-60">{busy && <Loader2 size={15} className="animate-spin" />}Simpan Alamat</button>
            </div>
        </div>
    );
}

function WishlistSection() {
    const { addToCart } = useCart();
    const [items, setItems] = useState<WishItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const load = async () => {
        try {
            const r = await fetch("/api/account/wishlist", { cache: "no-store" });
            if (r.ok) setItems(((await r.json()) as { wishlist?: WishItem[] }).wishlist || []);
        } catch {
            setError("Gagal memuat wishlist.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const removeItem = async (item: WishItem) => {
        setError("");
        try {
            const r = await fetch("/api/account/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: item.productId || item.productRef || item.id }) });
            if (r.ok) {
                setItems((prev) => prev.filter((i) => i.id !== item.id));
                setMessage("Dihapus dari wishlist.");
            } else setError("Gagal menghapus dari wishlist.");
        } catch {
            setError("Gagal menghapus dari wishlist.");
        }
    };

    const add = (item: WishItem) => {
        addToCart({ id: item.productId || item.id, name: item.name, price: item.price, image: item.image, slug: item.slug });
        setMessage("Ditambahkan ke keranjang.");
    };

    return (
        <div>
            <div className="flex items-center justify-between">
                <b className="text-sm text-[#123d2d]">Wishlist Saya</b>
                <span className="rounded-full bg-[#fff2d6] px-2.5 py-1 text-[10px] font-bold text-[#8b5e00]">{items.length} item</span>
            </div>
            {message && <div className="mt-3"><Alert tone="success">{message}</Alert></div>}
            {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
            <div className="mt-3 grid gap-2.5">
                {loading ? [1, 2, 3].map((x) => <div key={x} className="h-20 animate-pulse rounded-2xl bg-white" />) : items.length ? items.map((item) => (
                    <article key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#e5e0d5] bg-white p-3 shadow-sm">
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#faf8f2]">
                            <Image src={item.image || "/AFA LOGO.svg"} alt={item.name} fill className="object-contain p-1" unoptimized />
                        </div>
                        <div className="min-w-0 flex-1">
                            <b className="block truncate text-sm text-[#123d2d]">{item.name}</b>
                            <small className="block text-xs text-[#8b5e00]">{money(item.price)}</small>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                            <button onClick={() => add(item)} className="rounded-lg bg-[#b18a3d] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#99742e]">+ Keranjang</button>
                            <button onClick={() => void removeItem(item)} aria-label="Hapus wishlist" className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"><Trash2 size={15} /></button>
                        </div>
                    </article>
                )) : <div className="rounded-2xl border border-dashed border-[#ded9cc] bg-white py-10 text-center"><Heart className="mx-auto text-[#b18a3d]" /><b className="mt-2 block text-sm">Wishlist kosong</b><small className="text-[11px] text-[#7a817c]">Tandai produk favorit Anda dengan ikon hati.</small></div>}
            </div>
        </div>
    );
}

function PasswordSection() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [ok, setOk] = useState("");
    const [err, setErr] = useState("");

    const submit = async () => {
        setOk("");
        setErr("");
        if (!password || !confirmPassword || !currentPassword) {
            setErr("Semua kolom wajib diisi.");
            return;
        }
        if (password !== confirmPassword) {
            setErr("Konfirmasi password tidak sama.");
            return;
        }
        if (password.length < 8) {
            setErr("Password minimal 8 karakter.");
            return;
        }
        setBusy(true);
        try {
            const r = await fetch("/api/account/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, password, confirmPassword }) });
            const data = await r.json().catch(() => ({})) as { message?: string };
            if (r.ok) {
                setOk("Password berhasil diubah.");
                setCurrentPassword("");
                setPassword("");
                setConfirmPassword("");
            } else setErr(data.message || "Gagal mengubah password.");
        } catch {
            setErr("Gagal mengubah password. Silakan coba lagi.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-sm">
            <b className="text-sm text-[#123d2d]">Ubah Password</b>
            {ok && <div className="mt-3"><Alert tone="success">{ok}</Alert></div>}
            {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
            <div className="mt-4 grid gap-3">
                <Field label="Password Lama"><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} /></Field>
                <Field label="Password Baru"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></Field>
                <Field label="Konfirmasi Password"><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} /></Field>
            </div>
            <button onClick={() => void submit()} disabled={busy} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#123d2d] px-4 text-sm font-bold text-white disabled:opacity-60">{busy && <Loader2 size={15} className="animate-spin" />}Perbarui Password</button>
        </div>
    );
}

function OrdersSection() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [filter, setFilter] = useState<Filter>("Semua");
    const [open, setOpen] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
    const [cancelling, setCancelling] = useState(false);

    const refresh = async () => {
        const r = await fetch("/api/account/orders");
        if (r.ok) setOrders((await parseJsonResponse<{ orders?: Order[] }>(r)).orders || []);
        setLoading(false);
    };

    useEffect(() => {
        void refresh();
    }, []);

    const counts = useMemo(() => Object.fromEntries(filters.map((f) => [f, orders.filter((o) => f === "Semua" || (f === "Diproses" ? ["Diproses", "Dikemas", "Dikirim"].includes(orderStatus(o)) : orderStatus(o) === f)).length])) as Record<Filter, number>, [orders]);
    const shown = orders.filter((o) => filter === "Semua" || (filter === "Diproses" ? ["Diproses", "Dikemas", "Dikirim"].includes(orderStatus(o)) : orderStatus(o) === filter));

    const confirmCancel = async () => {
        if (!cancelTarget) return;
        setCancelling(true);
        try {
            const r = await fetch(`/api/account/orders/${cancelTarget.id}/cancel`, { method: "POST" });
            const data = await r.json().catch(() => null);
            if (r.ok) {
                setMessage("Pesanan berhasil dibatalkan.");
                setFilter("Dibatalkan");
                setOpen(null);
                await refresh();
            } else setMessage((data && (data as { message?: string }).message) || "Gagal membatalkan pesanan. Silakan coba lagi.");
        } catch {
            setMessage("Gagal membatalkan pesanan. Silakan coba lagi.");
        } finally {
            setCancelling(false);
            setCancelTarget(null);
        }
    };

    return (
        <div>
            <h2 className="font-display text-xl font-bold text-[#123d2d]">Pesanan Saya</h2>
            <p className="mt-1 text-xs text-[#69736d]">Lihat status dan detail pesanan Anda.</p>
            <nav className="-mx-3.5 mt-4 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none]">
                <div className="flex w-max gap-2">
                    {filters.map((f) => (
                        <button key={f} onClick={() => setFilter(f)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${filter === f ? "border-[#123d2d] bg-[#123d2d] text-white" : "border-[#ded9cc] bg-white"}`}>{f} <span className="ml-1.5 rounded-full bg-black/5 px-1.5 py-0.5">{counts[f]}</span></button>
                    ))}
                </div>
            </nav>
            {message && <p className="mt-3 rounded-xl bg-[#fff2d6] p-2 text-xs">{message}</p>}
            <section className="mt-3 grid gap-2.5">
                {loading ? [1, 2, 3].map((x) => <div key={x} className="h-32 animate-pulse rounded-2xl bg-white" />) : shown.length ? shown.map((o) => <Card key={o.id} order={o} open={open === o.id} toggle={() => setOpen(open === o.id ? null : o.id)} onCancel={setCancelTarget} />) : <div className="rounded-2xl border border-dashed bg-white py-10 text-center"><PackageSearch className="mx-auto text-[#b18a3d]" /><b className="mt-2 block text-sm">Belum ada pesanan</b></div>}
            </section>
            {cancelTarget && <Confirm onConfirm={() => void confirmCancel()} onClose={() => setCancelTarget(null)} busy={cancelling} />}
        </div>
    );
}

function Confirm({ onConfirm, onClose, busy }: { onConfirm: () => void; onClose: () => void; busy: boolean }) {
    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#17241d]/45 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-600"><Ban size={22} /></div>
                <h2 className="mt-3 font-display text-lg font-bold text-[#123d2d]">Batalkan Pesanan?</h2>
                <p className="mt-1 text-sm text-[#69736d]">Apakah Anda yakin ingin membatalkan pesanan ini?</p>
                <div className="mt-5 flex gap-2">
                    <button onClick={onClose} disabled={busy} className="min-h-10 flex-1 rounded-xl border border-[#ded9cc] bg-white px-4 text-sm font-bold disabled:opacity-50">Kembali</button>
                    <button onClick={onConfirm} disabled={busy} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">{busy && <Loader2 size={15} className="animate-spin" />}{busy ? "Membatalkan…" : "Ya, Batalkan"}</button>
                </div>
            </div>
        </div>
    );
}

function Card({ order: o, open, toggle, onCancel }: { order: Order; open: boolean; toggle: () => void; onCancel: (o: Order) => void }) {
    const i = o.items[0];
    const s = orderStatus(o);
    return (
        <article className="overflow-hidden rounded-2xl border border-[#e5e0d5] bg-white shadow-sm">
            <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[78px_minmax(0,1fr)_150px]">
                <div className="relative h-[68px] overflow-hidden rounded-xl bg-[#faf8f2] sm:h-[78px]"><Image src={productImage(i)} alt={i?.name || "Produk"} fill className="object-contain p-2" unoptimized /></div>
                <div className="min-w-0">
                    <b className="break-all text-[11px] text-[#123d2d]">{o.invoice}</b>
                    <p className="text-[10px] text-[#858a86]">{date(o.createdAt)}</p>
                    <h2 className="mt-1 line-clamp-2 text-xs font-semibold">{i?.name || "Produk AFA STORE"}{o.items.length > 1 ? ` +${o.items.length - 1} produk` : ""}</h2>
                    {i && <p className="text-[10px] text-[#747b76]">{i.quantity} x {money(unitPrice(i))}</p>}
                </div>
                <div className="col-span-2 flex items-center justify-between border-t pt-2 sm:col-span-1 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                    <div className="sm:text-right">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tones[s] || "bg-gray-100"}`}>{s}</span>
                        <small className="mt-1 block text-[9px] text-gray-500">Total Harga</small>
                        <b className="block text-xs text-[#123d2d]">{money(o.total)}</b>
                    </div>
                    <button onClick={toggle} className="flex min-h-9 items-center text-[11px] font-bold text-[#99742e]">{open ? "Tutup" : "Lihat Detail"}<ChevronRight size={14} /></button>
                </div>
            </div>
            {open && <Detail order={o} onCancel={onCancel} />}
        </article>
    );
}

function Detail({ order: o, onCancel }: { order: Order; onCancel: (o: Order) => void }) {
    const pay = getPaymentStatusPresentation(o.paymentStatus);
    const s = orderStatus(o);
    const cancellable = canCancel(o);
    const pdf = () => {
        const d = new jsPDF();
        d.setFontSize(18);
        d.text("AFA STORE - INVOICE", 14, 18);
        d.setFontSize(11);
        d.text(`Invoice: ${o.invoice}`, 14, 30);
        let y = 44;
        o.items.forEach((i) => {
            d.text(`${i.name} x${i.quantity} - ${money(i.subtotal)}`, 14, y);
            y += 8;
        });
        d.text(`Subtotal: ${money(o.subtotal)}`, 14, y + 4);
        d.text(`Ongkir: ${money(o.shipping)}`, 14, y + 12);
        d.text(`Diskon: ${money(o.discount || 0)}`, 14, y + 20);
        d.text(`Total: ${money(o.total)}`, 14, y + 30);
        d.save(`${o.invoice}.pdf`);
    };
    return (
        <div className="border-t bg-[#fcfaf5] p-3 text-xs">
            <div className="grid gap-3 md:grid-cols-2">
                <div>
                    <b>Produk</b>
                    {o.items.map((i) => (
                        <div key={i.id} className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white p-2">
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#faf8f2]"><Image src={productImage(i)} alt={i.name} fill className="object-contain p-1" unoptimized /></span>
                                <span className="min-w-0 flex-1">{i.name}<small className="block text-gray-500">{i.quantity} x {money(unitPrice(i))}</small></span>
                            </span>
                            <b className="shrink-0">{money(i.subtotal)}</b>
                        </div>
                    ))}
                    <Timeline order={o} />
                    <div className="mt-2 rounded-xl bg-white p-3">
                        <b>Tracking</b>
                        <p>Kurir: {o.courier || "Belum dipilih"}</p>
                        <p>No. resi: {o.trackingNumber || "Belum tersedia"}</p>
                        {o.shippedAt && <p>Status: {s}</p>}
                    </div>
                </div>
                <aside className="rounded-xl bg-[#123d2d] p-4 text-white">
                    <b>Ringkasan</b>
                    <Line l="Invoice" v={o.invoice} />
                    <Line l="Subtotal" v={money(o.subtotal)} />
                    <Line l="Ongkir" v={money(o.shipping)} />
                    <Line l="Diskon" v={`- ${money(o.discount || 0)}`} />
                    <Line l="Total" v={money(o.total)} />
                    <Line l="Status" v={s} />
                    <Line l="Pembayaran" v={pay.label} />
                </aside>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {pay.canPay && <Link href={`/payment/${o.invoice}`} className="rounded-lg bg-[#b18a3d] px-3 py-2.5 font-bold text-white">Bayar Sekarang</Link>}
                <button onClick={pdf} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2.5 font-bold"><Download size={14} /> Invoice PDF</button>
                <button onClick={() => onCancel(o)} disabled={!cancellable} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 font-bold text-red-600 disabled:cursor-not-allowed disabled:border-[#e5e0d5] disabled:bg-[#f4f1ea] disabled:text-[#b3b7b4]"><Ban size={14} /> Batalkan Pesanan</button>
            </div>
        </div>
    );
}

function Timeline({ order: o }: { order: Order }) {
    const x = o.cancelledAt ? [["Belum Bayar", o.createdAt], ["Dibatalkan", o.cancelledAt]] : [["Belum Bayar", o.paidAt || o.createdAt], ["Diproses", o.processedAt], ["Dikemas", o.packedAt], ["Dikirim", o.shippedAt], ["Selesai", o.completedAt]];
    return (
        <div className="mt-2 overflow-x-auto rounded-xl bg-white p-3">
            <b>Status / Timeline</b>
            <div className="mt-2 flex min-w-max gap-4">
                {x.map(([l, d]) => (
                    <div key={l} className="w-20">
                        <span className={`block h-3 w-3 rounded-full ${d ? "bg-[#b18a3d]" : "bg-gray-200"}`} />
                        <b className="text-[9px]">{l}</b>
                        <small className="block text-[8px] text-gray-500">{d ? date(d) : "Menunggu"}</small>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Line({ l, v }: { l: string; v: string }) {
    return (
        <p className="mt-2 flex justify-between gap-2 text-[10px] text-white/75">
            <span>{l}</span>
            <span className="break-all text-right">{v}</span>
        </p>
    );
}

function Bottom({ section, onNavigate }: { section: Section; onNavigate: (s: Section) => void }) {
    const btnCls = (active: boolean) => `relative flex flex-col items-center justify-center text-[10px] font-semibold ${active ? "text-[#123d2d]" : "text-gray-400"}`;
    const marker = (active: boolean) => active && <span className="absolute top-0 h-0.5 w-8 bg-[#b18a3d]" />;

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95">
            <div className="mx-auto grid h-16 max-w-md grid-cols-3">
                <Link href="/" className={btnCls(false)}>
                    <Home size={19} />
                    Beranda
                </Link>
                <button onClick={() => onNavigate("pesanan")} className={btnCls(section === "pesanan")}>
                    {marker(section === "pesanan")}
                    <PackageSearch size={19} />
                    Pesanan
                </button>
                <button onClick={() => onNavigate("akun")} className={btnCls(section === "akun")}>
                    {marker(section === "akun")}
                    <UserIcon size={19} />
                    Akun
                </button>
            </div>
        </nav>
    );
}
