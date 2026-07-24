"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import Swal from "sweetalert2";
import { Boxes, Camera, CheckCircle2, Edit3, Home, Loader2, LogOut, PackagePlus, Plus, ShoppingBag, Trash2, UserCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Product = {
    id: string;
    name: string;
    slug: string;
    price: number;
    stock: number;
    rating: number | null;
    flavor: string | null;
    size: string | null;
    badge: string | null;
    categoryId?: string | null;
    category?: string | null;
    image: string | null;
    isActive: boolean;
    createdAt?: string;
};

type OrderItem = { name: string; quantity: number };

type Order = {
    id: string;
    customer: string;
    phone: string;
    status: string;
    paymentMethod: string;
    total: number;
    createdAt: string;
    items?: OrderItem[];
};

type ProductForm = {
    id?: string;
    name: string;
    slug: string;
    price: string;
    stock: string;
    rating: string;
    flavor: string;
    size: string;
    badge: string;
    category: string;
    image: string;
    isActive: boolean;
};

const emptyForm: ProductForm = {
    name: "",
    slug: "",
    price: "",
    stock: "0",
    rating: "0",
    flavor: "",
    size: "",
    badge: "",
    category: "",
    image: "",
    isActive: true,
};

const tabs = [
    { id: "home", label: "Home", icon: Home },
    { id: "products", label: "Produk", icon: Boxes },
    { id: "add", label: "Tambah", icon: PackagePlus },
    { id: "orders", label: "Pesanan", icon: ShoppingBag },
    { id: "account", label: "Akun", icon: UserCircle },
] as const;

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function toast(title: string, icon: "success" | "error" | "info" = "success") {
    void Swal.fire({ toast: true, position: "top-end", timer: 2200, showConfirmButton: false, icon, title });
}

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("home");
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [adminEmail, setAdminEmail] = useState("");
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<ProductForm>(emptyForm);

    const loadData = useCallback(async () => {
        setLoading(true);
        const [productRes, orderRes] = await Promise.all([
            supabase.from("products").select("*").order("createdAt", { ascending: false }),
            supabase.from("orders").select("*, items:order_items(name, quantity)").order("createdAt", { ascending: false }),
        ]);

        if (productRes.error) toast(productRes.error.message, "error");
        if (orderRes.error) toast(orderRes.error.message, "error");
        setProducts((productRes.data ?? []) as Product[]);
        setOrders((orderRes.data ?? []) as Order[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        supabase.auth.getUser().then(async ({ data }) => {
            const user = data.user;

            if (!user) {
                window.location.href = "/admin/login";
                return;
            }

            const { data: admin } = await supabase
                .from("users")
                .select("role")
                .eq("auth_id", user.id)
                .single();

            if (admin?.role !== "admin") {
                await supabase.auth.signOut();
                window.location.href = "/admin/login";
                return;
            }

            setAdminEmail(user.email ?? "Admin AFA STORE");
            setCheckingAuth(false);
            void loadData();
        });
    }, [loadData]);

    useEffect(() => {
        if (checkingAuth) return;
        const channel = supabase
            .channel("afa-admin-dashboard")
            .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => void loadData())
            .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void loadData())
            .subscribe();
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [checkingAuth, loadData]);

    const summary = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return {
            products: products.length,
            stock: products.reduce((sum, product) => sum + Number(product.stock || 0), 0),
            orders: orders.length,
            revenueToday: orders.filter((order) => order.createdAt?.slice(0, 10) === today).reduce((sum, order) => sum + Number(order.total || 0), 0),
        };
    }, [orders, products]);

    function updateForm(field: keyof ProductForm, value: string | boolean) {
        setForm((current) => ({ ...current, [field]: value, ...(field === "name" ? { slug: slugify(String(value)) } : {}) }));
    }

    async function uploadImage(file: File) {
        const ext = file.name.split(".").pop();
        const path = `${Date.now()}-${slugify(file.name)}.${ext}`;
        const { error } = await supabase.storage.from("products").upload(path, file, { upsert: true });
        if (error) return toast(error.message, "error");
        const { data } = supabase.storage.from("products").getPublicUrl(path);
        updateForm("image", data.publicUrl);
        toast("Foto produk berhasil diupload");
    }

    async function saveProduct(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        const payload = {
            name: form.name,
            slug: form.slug || slugify(form.name),
            price: Number(form.price || 0),
            stock: Number(form.stock || 0),
            rating: Number(form.rating || 0),
            flavor: form.flavor || null,
            size: form.size || null,
            badge: form.badge || null,
            category: form.category || null,
            image: form.image || null,
            isActive: form.isActive,
        };
        const result = form.id ? await supabase.from("products").update(payload).eq("id", form.id) : await supabase.from("products").insert(payload);
        setSaving(false);
        if (result.error) return toast(result.error.message, "error");
        setForm(emptyForm);
        setActiveTab("products");
        toast(form.id ? "Produk berhasil diperbarui" : "Produk berhasil ditambahkan");
        void loadData();
    }

    function editProduct(product: Product) {
        setForm({
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: String(product.price),
            stock: String(product.stock),
            rating: String(product.rating ?? 0),
            flavor: product.flavor ?? "",
            size: product.size ?? "",
            badge: product.badge ?? "",
            category: product.category ?? product.categoryId ?? "",
            image: product.image ?? "",
            isActive: product.isActive,
        });
        setActiveTab("add");
    }

    async function deleteProduct(product: Product) {
        const confirm = await Swal.fire({ title: "Hapus produk?", text: product.name, icon: "warning", showCancelButton: true, confirmButtonColor: "#184D47", cancelButtonText: "Batal", confirmButtonText: "Hapus" });
        if (!confirm.isConfirmed) return;
        const { error } = await supabase.from("products").delete().eq("id", product.id);
        if (error) return toast(error.message, "error");
        toast("Produk dihapus");
        void loadData();
    }

    async function updateStock(product: Product, delta: number) {
        const nextStock = Math.max(0, Number(product.stock || 0) + delta);
        setProducts((items) => items.map((item) => (item.id === product.id ? { ...item, stock: nextStock } : item)));
        const { error } = await supabase.from("products").update({ stock: nextStock }).eq("id", product.id);
        if (error) toast(error.message, "error");
    }

    async function updateOrderStatus(order: Order, status: string) {
        const { error } = await supabase.from("orders").update({ status }).eq("id", order.id);
        if (error) return toast(error.message, "error");
        toast("Status pesanan diperbarui");
    }

    async function logout() {
        await supabase.auth.signOut();
        window.location.href = "/admin/login";
    }

    if (checkingAuth) {
        return <main className="grid min-h-screen place-items-center bg-[#184D47] text-white"><Loader2 className="mb-4 animate-spin text-[#C8A14A]" size={42} /><p>Memeriksa akses admin...</p></main>;
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff8df_0,#f7efd9_36%,#e7dcc1_100%)] pb-28 text-[#184D47]">
            <div className="mx-auto flex max-w-7xl gap-6 p-4 lg:p-8">
                <aside className="sticky top-6 hidden h-[calc(100vh-48px)] w-72 rounded-[2rem] bg-[#184D47] p-5 text-white shadow-2xl lg:block">
                    <div className="rounded-3xl border border-[#C8A14A]/35 p-5"><p className="text-sm uppercase tracking-[0.35em] text-[#C8A14A]">AFA STORE</p><h1 className="mt-3 text-3xl font-black">Admin Dashboard</h1></div>
                    <nav className="mt-6 space-y-2">{tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-semibold transition ${activeTab === tab.id ? "bg-[#C8A14A] text-[#184D47]" : "hover:bg-white/10"}`}><tab.icon size={20} />{tab.label}</button>)}</nav>
                </aside>

                <section className="min-w-0 flex-1">
                    <header className="overflow-hidden rounded-[2rem] bg-[#184D47] p-5 text-white shadow-xl md:p-8">
                        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                            <div><p className="text-xs font-bold uppercase tracking-[0.35em] text-[#C8A14A]">Premium Control Room</p><h2 className="mt-3 text-3xl font-black md:text-5xl">Dashboard Admin</h2><p className="mt-2 max-w-2xl text-white/75">Kelola produk, stok, upload gambar, dan pesanan Supabase secara realtime tanpa refresh.</p></div>
                            <button onClick={logout} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 font-semibold hover:bg-white/10"><LogOut size={18} /> Logout</button>
                        </motion.div>
                    </header>

                    {loading ? <Skeleton /> : (
                        <div className="mt-6 space-y-6">
                            {(activeTab === "home" || activeTab === "account") && <HomePanel summary={summary} adminEmail={adminEmail} />}
                            {activeTab === "products" && <ProductsPanel products={products} onEdit={editProduct} onDelete={deleteProduct} onStock={updateStock} />}
                            {activeTab === "add" && <ProductFormPanel form={form} saving={saving} onChange={updateForm} onSubmit={saveProduct} onUpload={uploadImage} onCancel={() => setForm(emptyForm)} />}
                            {activeTab === "orders" && <OrdersPanel orders={orders} onStatus={updateOrderStatus} />}
                        </div>
                    )}
                </section>
            </div>

            <button onClick={() => { setForm(emptyForm); setActiveTab("add"); }} className="fixed bottom-24 right-5 z-40 grid h-16 w-16 place-items-center rounded-full bg-[#C8A14A] text-[#184D47] shadow-2xl shadow-[#184D47]/30 lg:hidden" aria-label="Tambah Produk"><Plus size={30} /></button>
            <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[1.7rem] border border-white/60 bg-white/90 p-2 shadow-2xl backdrop-blur lg:hidden">
                {tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-2xl px-2 py-3 text-[11px] font-bold ${activeTab === tab.id ? "bg-[#184D47] text-[#C8A14A]" : "text-[#184D47]"}`}><tab.icon className="mx-auto mb-1" size={19} />{tab.label}</button>)}
            </nav>
        </main>
    );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className={`rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-[#184D47]/10 backdrop-blur ${className}`}>{children}</motion.div>;
}

function Skeleton() {
    return <div className="mt-6 grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-[1.75rem] bg-white/70" />)}</div>;
}

function HomePanel({ summary, adminEmail }: { summary: { products: number; stock: number; orders: number; revenueToday: number }; adminEmail: string }) {
    const items = [{ label: "Total Produk", value: summary.products }, { label: "Total Stok", value: summary.stock }, { label: "Total Pesanan", value: summary.orders }, { label: "Pendapatan Hari Ini", value: rupiah.format(summary.revenueToday) }];
    return <><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <Card key={item.label}><p className="text-sm font-semibold text-[#184D47]/60">{item.label}</p><p className="mt-3 text-3xl font-black text-[#184D47]">{item.value}</p><CheckCircle2 className="mt-4 text-[#C8A14A]" /></Card>)}</section><Card><p className="font-bold">Akun Admin</p><p className="mt-2 text-[#184D47]/70">Login sebagai {adminEmail}</p></Card></>;
}

function ProductsPanel({ products, onEdit, onDelete, onStock }: { products: Product[]; onEdit: (product: Product) => void; onDelete: (product: Product) => void; onStock: (product: Product, delta: number) => void }) {
    return <Card><div className="mb-5 flex items-center justify-between"><h3 className="text-2xl font-black">Produk</h3><span className="rounded-full bg-[#C8A14A]/20 px-4 py-2 text-sm font-bold">{products.length} item</span></div><div className="space-y-4">{products.map((product) => <div key={product.id} className="grid gap-4 rounded-3xl border border-[#184D47]/10 bg-white p-4 md:grid-cols-[72px_1fr_120px_90px_110px_120px]"><Image src={product.image || "/window.svg"} alt={product.name} width={80} height={80} className="h-20 w-20 rounded-2xl object-cover" unoptimized /><div><h4 className="font-black">{product.name}</h4><p className="text-sm text-[#184D47]/60">{product.slug}</p><p className="mt-1 text-sm font-bold text-[#C8A14A]">{product.flavor} {product.size}</p></div><p className="font-black">{rupiah.format(product.price)}</p><p className="font-bold">Stok {product.stock}</p><span className={`h-fit rounded-full px-3 py-1 text-center text-xs font-bold ${product.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{product.isActive ? "Aktif" : "Tidak Aktif"}</span><div className="flex gap-2"><button onClick={() => onEdit(product)} className="grid h-11 w-11 place-items-center rounded-2xl bg-[#184D47] text-white"><Edit3 size={17} /></button><button onClick={() => void onDelete(product)} className="grid h-11 w-11 place-items-center rounded-2xl bg-red-600 text-white"><Trash2 size={17} /></button></div><div className="md:col-span-6 rounded-2xl bg-[#f8f0dd] p-4"><p className="mb-3 font-black">{product.name}</p><div className="flex flex-wrap items-center gap-3"><button onClick={() => void onStock(product, -1)} className="h-11 w-11 rounded-xl bg-white font-black">-</button><span className="min-w-16 text-center text-2xl font-black">{product.stock}</span><button onClick={() => void onStock(product, 1)} className="h-11 w-11 rounded-xl bg-white font-black">+</button>{[-1, 1, -10, 10].map((delta) => <button key={delta} onClick={() => void onStock(product, delta)} className="rounded-xl bg-[#184D47] px-4 py-3 text-sm font-bold text-white">{delta > 0 ? `Tambah ${delta}` : `Kurangi ${Math.abs(delta)}`}</button>)}</div></div></div>)}</div></Card>;
}

function ProductFormPanel({ form, saving, onChange, onSubmit, onUpload, onCancel }: { form: ProductForm; saving: boolean; onChange: (field: keyof ProductForm, value: string | boolean) => void; onSubmit: (event: FormEvent) => void; onUpload: (file: File) => void; onCancel: () => void }) {
    const fields: [keyof ProductForm, string, string][] = [["name", "Nama", "text"], ["slug", "Slug otomatis", "text"], ["price", "Harga", "number"], ["stock", "Stok", "number"], ["rating", "Rating", "number"], ["flavor", "Flavor", "text"], ["size", "Size", "text"], ["badge", "Badge", "text"], ["category", "Category", "text"]];
    return <Card><h3 className="mb-5 text-2xl font-black">{form.id ? "Edit Produk" : "Tambah Produk"}</h3><form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">{fields.map(([key, label, type]) => <label key={key} className="space-y-2"><span className="text-sm font-bold">{label}</span><input value={String(form[key])} onChange={(event) => onChange(key, event.target.value)} type={type} className="h-13 w-full rounded-2xl border border-[#184D47]/15 bg-white px-4 outline-none focus:border-[#C8A14A]" required={["name", "slug", "price"].includes(key)} /></label>)}<label className="space-y-2 md:col-span-2"><span className="text-sm font-bold">Upload Foto</span><div className="flex flex-col gap-3 rounded-3xl border border-dashed border-[#184D47]/25 bg-[#f8f0dd] p-4 sm:flex-row sm:items-center"><Camera className="text-[#C8A14A]" /><input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void onUpload(event.target.files[0])} /><input value={form.image} onChange={(event) => onChange("image", event.target.value)} placeholder="URL image otomatis" className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3" /></div></label><label className="flex items-center gap-3 rounded-2xl bg-white p-4 font-bold"><input type="checkbox" checked={form.isActive} onChange={(event) => onChange("isActive", event.target.checked)} /> Aktif / Tidak</label><div className="flex gap-3 md:col-span-2"><button disabled={saving} className="h-13 flex-1 rounded-2xl bg-[#184D47] px-5 font-black text-white disabled:opacity-60">{saving ? "Menyimpan..." : "Simpan ke Supabase"}</button><button type="button" onClick={onCancel} className="h-13 rounded-2xl border border-[#184D47]/20 px-5 font-bold">Reset</button></div></form></Card>;
}

function OrdersPanel({ orders, onStatus }: { orders: Order[]; onStatus: (order: Order, status: string) => void }) {
    const statuses = ["Menunggu", "Diproses", "Dikirim", "Selesai"];
    return <Card><h3 className="mb-5 text-2xl font-black">Pesanan</h3><div className="space-y-4">{orders.map((order) => <div key={order.id} className="rounded-3xl border border-[#184D47]/10 bg-white p-4"><div className="grid gap-3 md:grid-cols-6"><div><p className="text-xs font-bold text-[#184D47]/50">Nama Pembeli</p><p className="font-black">{order.customer}</p></div><div><p className="text-xs font-bold text-[#184D47]/50">Nomor WA</p><p className="font-bold">{order.phone}</p></div><div className="md:col-span-2"><p className="text-xs font-bold text-[#184D47]/50">Produk</p><p className="font-bold">{order.items?.map((item) => `${item.name} x${item.quantity}`).join(", ") || "-"}</p></div><div><p className="text-xs font-bold text-[#184D47]/50">Metode Pembayaran</p><p className="font-bold">{order.paymentMethod}</p></div><select value={order.status} onChange={(event) => void onStatus(order, event.target.value)} className="h-12 rounded-2xl border border-[#184D47]/15 px-3 font-bold">{statuses.map((status) => <option key={status}>{status}</option>)}</select></div></div>)}</div></Card>;
}