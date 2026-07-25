"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Bell, X, ExternalLink, QrCode, AlertTriangle, FileText, ShieldCheck, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import Swal from "sweetalert2";
import { BarChart3, Boxes, Camera, CheckCircle2, Edit3, Home, Loader2, LogOut, PackagePlus, PlusCircle, Settings, ShoppingBag, Trash2, Users, UserCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminBreadcrumb, AdminDashboardLink, AdminHeaderWebsiteButton, AdminWebsiteButton, AdminWebsiteFooterButton } from "@/components/admin/AdminNav";
import { ReportsPanel, SettingsPanel, StockPanel } from "@/components/admin/AdminAdvancedPanels";

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

type OrderItemWithProduct = OrderItem & { productId?: string | null; product_id?: string | null };

type Order = {
    id: string;
    customer: string;
    phone: string;
    status: string;
    paymentMethod: string;
    total: number;
    createdAt: string;
    items?: OrderItemWithProduct[];
};

type StockHistoryPayload = {
    product_id: string;
    product_name: string;
    type: "IN" | "OUT" | "SALE" | "RETURN";
    quantity: number;
    previous_stock: number;
    new_stock: number;
    note: string;
    admin: string;
    order_id?: string;
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
    {
        id: "home",
        label: "Dashboard",
        icon: Home,
        href: "/admin",
    },
    {
        id: "products",
        label: "Produk",
        icon: Boxes,
        href: "/admin/products",
    },
    {
        id: "add",
        label: "Tambah",
        icon: PackagePlus,
        href: "/admin/products/new",
    },
    {
        id: "stock",
        label: "Stok Barang",
        icon: BarChart3,
        href: "/admin/stock",
    },
    {
        id: "orders",
        label: "Pesanan",
        icon: ShoppingBag,
        href: "/admin/orders",
    },
    {
        id: "customers",
        label: "Pelanggan",
        icon: Users,
        href: "/admin/account",
    },
    {
        id: "reports",
        label: "Laporan",
        icon: BarChart3,
        href: "/admin/reports",
    },
    {
        id: "settings",
        label: "Pengaturan",
        icon: Settings,
        href: "/admin/settings",
    },
    {
        id: "account",
        label: "Akun",
        icon: UserCircle,
        href: "/admin/account",
    },
] as const;

const tabByPath: Record<string, (typeof tabs)[number]["id"]> = {
    "/admin": "home",
    "/admin/products": "products",
    "/admin/produk": "products",
    "/admin/stock": "stock",
    "/admin/stok": "stock",
    "/admin/products/new": "add",
    "/admin/tambah": "add",
    "/admin/orders": "orders",
    "/admin/pesanan": "orders",
    "/admin/reports": "reports",
    "/admin/laporan": "reports",
    "/admin/settings": "settings",
    "/admin/pengaturan": "settings",
    "/admin/account": "account",
    "/admin/akun": "account",
};

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function toast(title: string, icon: "success" | "error" | "info" = "success") {
    void Swal.fire({ toast: true, position: "top-end", timer: 2200, showConfirmButton: false, icon, title });
}

async function saveStockHistory(payload: StockHistoryPayload) {
    const { error } = await supabase.from("stock_history").insert(payload);
    if (error) toast(`Riwayat stok gagal disimpan: ${error.message}`, "info");
}

export default function AdminPage() {
    const pathname = usePathname();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("home");
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [adminEmail, setAdminEmail] = useState("");
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<ProductForm>(emptyForm);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        const [productRes, orderRes] = await Promise.all([
            supabase.from("products").select("*").order("createdAt", { ascending: false }),
            supabase.from("orders").select("*, items:order_items(name, quantity, productId)").order("createdAt", { ascending: false }),
        ]);

        if (productRes.error) toast(productRes.error.message, "error");
        if (orderRes.error) toast(orderRes.error.message, "error");
        setProducts((productRes.data ?? []) as Product[]);
        setOrders((orderRes.data ?? []) as Order[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        setActiveTab(tabByPath[pathname] ?? "home");
    }, [pathname]);

    useEffect(() => {
        supabase.auth.getUser().then(async ({ data }) => {
            const user = data.user;

            if (!user) {
                router.push("/admin/login");
                return;
            }

            const { data: admin } = await supabase
                .from("users")
                .select("role")
                .eq("auth_id", user.id)
                .single();

            if (admin?.role !== "admin") {
                await supabase.auth.signOut();
                router.push("/admin/login");
                return;
            }

            setAdminEmail(user.email ?? "Admin AFA STORE");
            setCheckingAuth(false);
            void loadData();
        });
    }, [loadData, router]);

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
            lowStock: products.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 10).length,
            pending: orders.filter((order) => ["Menunggu", "Pending", "pending", "Belum Bayar"].includes(order.status)).length,
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
        else await saveStockHistory({ product_id: product.id, product_name: product.name, type: delta > 0 ? "IN" : "OUT", quantity: Math.abs(delta), previous_stock: Number(product.stock || 0), new_stock: nextStock, note: delta > 0 ? "Tambah stok admin" : "Kurangi stok admin", admin: adminEmail || "Admin AFA STORE" });
    }

    async function updateOrderStatus(order: Order, status: string) {
        const normalizedStatus = status.toLowerCase();
        const previousStatus = order.status.toLowerCase();
        if ((normalizedStatus === "selesai" || normalizedStatus === "completed") && !["selesai", "completed"].includes(previousStatus)) {
            const ok = await applyOrderStockMovement(order, "SALE");
            if (!ok) return;
        }
        if (["dibatalkan", "batal", "cancelled", "canceled"].includes(normalizedStatus) && !["dibatalkan", "batal", "cancelled", "canceled"].includes(previousStatus)) {
            const ok = await applyOrderStockMovement(order, "RETURN");
            if (!ok) return;
        }
        const orderPatch: Record<string, string> = { status };
        if (normalizedStatus === "selesai" || normalizedStatus === "completed") orderPatch.completedAt = new Date().toISOString();
        if (["dibatalkan", "batal", "cancelled", "canceled"].includes(normalizedStatus)) orderPatch.cancelledAt = new Date().toISOString();
        const { error } = await supabase.from("orders").update(orderPatch).eq("id", order.id);
        if (error) return toast(error.message, "error");
        toast("Status pesanan diperbarui");
    }

    async function applyOrderStockMovement(order: Order, type: "SALE" | "RETURN") {
        const items = order.items ?? [];
        for (const item of items) {
            const productId = item.productId || item.product_id;
            if (!productId) continue;
            const current = products.find((product) => product.id === productId) ?? (await supabase.from("products").select("*").eq("id", productId).single()).data as Product | null;
            if (!current) continue;
            const quantity = Number(item.quantity || 0);
            const previousStock = Number(current.stock || 0);
            const nextStock = type === "SALE" ? Math.max(0, previousStock - quantity) : previousStock + quantity;
            const { error } = await supabase.from("products").update({ stock: nextStock }).eq("id", productId);
            if (error) { toast(error.message, "error"); return false; }
            await saveStockHistory({ product_id: productId, product_name: current.name || item.name, type, quantity, previous_stock: previousStock, new_stock: nextStock, note: type === "SALE" ? `Pesanan selesai #${order.id}` : `Pesanan dibatalkan #${order.id}`, admin: adminEmail || "Admin AFA STORE", order_id: order.id });
        }
        void loadData();
        return true;
    }

    async function logout() {
        await supabase.auth.signOut();
        router.push("/admin/login");
    }

    if (checkingAuth) {
        return <main className="grid min-h-screen place-items-center bg-[#184D47] text-white"><Loader2 className="mb-4 animate-spin text-[#C8A14A]" size={42} /><p>Memeriksa akses admin...</p></main>;
    }

    return (
        <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#fff8df_0,#f7efd9_34%,#edf4ef_68%,#e4dcc7_100%)] pb-28 text-[#184D47]">
            <MobileHeader adminEmail={adminEmail} onMenu={() => setDrawerOpen(true)} />
            <div className="mx-auto flex w-full max-w-7xl gap-6 px-3 py-4 sm:px-4 lg:p-8">
                <AdminSidebar activeTab={activeTab} onClose={() => setDrawerOpen(false)} />
                <MobileDrawer open={drawerOpen} activeTab={activeTab} onClose={() => setDrawerOpen(false)} />

                <section className="min-w-0 flex-1">
                    <AdminBreadcrumb />
                    <header className="hidden overflow-hidden rounded-[2rem] bg-[#184D47] p-5 text-white shadow-xl md:p-8 lg:block">
                        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                            <div><p className="text-xs font-bold uppercase tracking-[0.35em] text-[#C8A14A]">Premium Control Room</p><h2 className="mt-3 text-3xl font-black md:text-5xl">Dashboard Admin</h2><p className="mt-2 max-w-2xl text-white/75">Kelola produk, stok, upload gambar, dan pesanan Supabase secara realtime tanpa refresh.</p></div>
                            <div className="flex gap-3"><AdminHeaderWebsiteButton /><button onClick={logout} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 font-semibold hover:bg-white/10"><LogOut size={18} /> Logout</button></div>
                        </motion.div>
                    </header>

                    {loading ? <Skeleton /> : (
                        <div className="mt-6 space-y-6">
                            {activeTab === "home" && <HomePanel summary={summary} adminEmail={adminEmail} />}
                            {activeTab === "products" && <ProductsPanel products={products} onEdit={editProduct} onDelete={deleteProduct} onStock={updateStock} />}
                            {activeTab === "stock" && <StockPanel />}
                            {activeTab === "add" && <ProductFormPanel form={form} saving={saving} onChange={updateForm} onSubmit={saveProduct} onUpload={uploadImage} onCancel={() => setForm(emptyForm)} />}
                            {activeTab === "orders" && <OrdersPanel orders={orders} onStatus={updateOrderStatus} />}
                            {activeTab === "reports" && <ReportsPanel />}
                            {activeTab === "settings" && <SettingsPanel />}
                            {activeTab === "account" && <AccountPanel adminEmail={adminEmail} onLogout={logout} />}
                        </div>
                    )}
                </section>
            </div>

            <MobileBottomNav activeTab={activeTab} />
        </main>
    );
}

function MobileHeader({ adminEmail, onMenu }: { adminEmail: string; onMenu: () => void }) {
    return <header className="sticky top-0 z-40 border-b border-white/50 bg-white/80 px-3 py-3 shadow-lg shadow-[#184D47]/5 backdrop-blur-xl lg:hidden"><div className="flex items-center gap-3"><button onClick={onMenu} className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0F4C45] text-white active:scale-95"><Menu size={22} /></button><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-[#0F4C45]"><Image src="/AFA LOGO.svg" alt="AFA STORE" width={34} height={34} /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]">AFA STORE</p><h1 className="truncate text-base font-black leading-tight sm:text-lg">Dashboard Admin</h1></div><button className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#0F4C45] shadow-md"><Bell size={20} /><span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500" /></button><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#0F4C45] to-[#D4AF37] text-sm font-black text-white">{(adminEmail || "A").slice(0, 1).toUpperCase()}</div></div></header>;
}

function SidebarContent({ activeTab, onClose }: { activeTab: string; onClose?: () => void }) {
    return <><div className="rounded-3xl border border-[#D4AF37]/35 p-5"><p className="text-sm uppercase tracking-[0.35em] text-[#D4AF37]">AFA STORE</p><h1 className="mt-3 text-3xl font-black">Admin Panel</h1></div><nav className="mt-6 flex-1 space-y-2 overflow-y-auto pr-1"><AdminDashboardLink onClick={onClose} />{tabs.filter((tab) => tab.id !== "home").map((tab) => <Link onClick={onClose} key={tab.id} href={tab.href} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-semibold transition duration-200 active:scale-[0.98] ${activeTab === tab.id ? "bg-[#D4AF37] text-[#184D47] shadow-lg shadow-[#D4AF37]/20" : "hover:bg-white/10"}`}><tab.icon size={20} />{tab.label}</Link>)}<AdminWebsiteButton /></nav><div className="mt-5"><AdminWebsiteFooterButton /></div></>;
}

function AdminSidebar({ activeTab, onClose }: { activeTab: string; onClose: () => void }) {
    return <aside className="sticky top-6 hidden h-[calc(100vh-48px)] w-72 shrink-0 rounded-[2rem] bg-[#184D47] p-5 text-white shadow-2xl lg:flex lg:flex-col"><SidebarContent activeTab={activeTab} onClose={onClose} /></aside>;
}

function MobileDrawer({ open, activeTab, onClose }: { open: boolean; activeTab: string; onClose: () => void }) {
    return <>{open && <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm lg:hidden" aria-label="Tutup menu" />}<motion.aside drag="x" dragConstraints={{ left: 0, right: 0 }} onDragEnd={(_, info) => info.offset.x < -80 && onClose()} initial={false} animate={{ x: open ? 0 : "-110%" }} transition={{ type: "spring", stiffness: 320, damping: 32 }} className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-80 flex-col rounded-r-[2rem] bg-[#184D47] p-5 text-white shadow-2xl lg:hidden"><button onClick={onClose} className="mb-4 ml-auto grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><X /></button><SidebarContent activeTab={activeTab} onClose={onClose} /></motion.aside></>;
}

function MobileBottomNav({ activeTab }: { activeTab: string }) {
    const mobileTabs = tabs.filter((tab) => ["home", "products", "add", "orders", "account"].includes(tab.id));
    return <nav className="fixed inset-x-2 bottom-2 z-40 grid grid-cols-5 rounded-[1.7rem] border border-white/70 bg-white/90 p-2 shadow-2xl backdrop-blur-xl lg:hidden">{mobileTabs.map((tab) => <Link key={tab.id} href={tab.href} className={`relative min-h-14 rounded-2xl px-1 py-2 text-center text-[10px] font-black transition duration-200 active:scale-95 ${activeTab === tab.id ? "text-[#D4AF37]" : "text-[#184D47]/70"}`}>{activeTab === tab.id && <motion.span layoutId="bottom-nav-active" className="absolute inset-0 rounded-2xl bg-[#184D47]" />}<span className="relative z-10"><tab.icon className="mx-auto mb-1" size={19} /><span>{tab.label}</span></span></Link>)}</nav>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className={`rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-[#184D47]/10 backdrop-blur ${className}`}>{children}</motion.div>;
}

function Skeleton() {
    return <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="relative h-32 overflow-hidden rounded-[1.75rem] bg-white/70 shadow"><span className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/80 to-transparent" /></div>)}</div>;
}

function CountUp({ value, money = false }: { value: number; money?: boolean }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => { const start = performance.now(); const timer = window.setInterval(() => { const progress = Math.min((performance.now() - start) / 850, 1); setDisplay(Math.round(value * progress)); if (progress >= 1) window.clearInterval(timer); }, 16); return () => window.clearInterval(timer); }, [value]);
    return <>{money ? rupiah.format(display) : display}</>;
}

function HomePanel({ summary, adminEmail }: { summary: { products: number; stock: number; orders: number; revenueToday: number; lowStock: number; pending: number }; adminEmail: string }) {
    const items = [{ label: "Total Produk", value: summary.products, icon: Boxes }, { label: "Total Stok", value: summary.stock, icon: BarChart3 }, { label: "Pesanan", value: summary.orders, icon: ShoppingBag }, { label: "Pendapatan", value: summary.revenueToday, money: true, icon: CheckCircle2 }, { label: "Produk Hampir Habis", value: summary.lowStock, icon: AlertTriangle }, { label: "Pending Order", value: summary.pending, icon: Bell }];
    const actions = [{ label: "Tambah Produk", href: "/admin/products/new", icon: PlusCircle }, { label: "Kelola Stok", href: "/admin/stock", icon: BarChart3 }, { label: "Pesanan Baru", href: "/admin/orders", icon: ShoppingBag }, { label: "Laporan", href: "/admin/reports", icon: FileText }, { label: "Website", href: "/", icon: ExternalLink }, { label: "QRIS", href: "/admin/settings", icon: QrCode }];
    return <div className="space-y-5"><section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">{items.map((item, index) => <motion.div key={item.label} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: index * 0.04 }} className="min-w-0 rounded-[24px] bg-gradient-to-br from-white/95 via-white/80 to-[#D4AF37]/20 p-4 shadow-xl shadow-[#184D47]/10 ring-1 ring-white/70"><div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[#0F4C45] text-[#D4AF37]"><item.icon size={20} /></div><p className="text-xs font-black uppercase tracking-wide text-[#184D47]/55">{item.label}</p><p className="mt-2 break-words text-2xl font-black leading-tight text-[#184D47] sm:text-3xl"><CountUp value={item.value} money={item.money} /></p></motion.div>)}</section><Card><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-[#D4AF37]">Quick Action</p><h3 className="text-2xl font-black">Aksi Cepat</h3></div><span className="rounded-full bg-[#0F4C45]/10 px-3 py-2 text-xs font-black">Realtime</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{actions.map((action) => <Link key={action.label} href={action.href} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-3xl bg-[#f8f0dd] p-3 text-center font-black shadow-sm transition duration-200 hover:-translate-y-1 hover:bg-[#D4AF37] active:scale-95"><action.icon size={22} />{action.label}</Link>)}</div></Card><Card><p className="font-bold">Akun Admin</p><p className="mt-2 break-all text-[#184D47]/70">Login sebagai {adminEmail}</p></Card></div>;
}

function ProductsPanel({ products, onEdit, onDelete, onStock }: { products: Product[]; onEdit: (product: Product) => void; onDelete: (product: Product) => void; onStock: (product: Product, delta: number) => void }) {
    if (!products.length) return <Card><EmptyState title="Belum ada produk" text="Tambahkan produk pertama agar tampil di katalog AFA STORE." action="Tambah Produk" href="/admin/products/new" /></Card>;
    return <Card><div className="mb-5 flex items-center justify-between"><h3 className="text-2xl font-black">Produk</h3><span className="rounded-full bg-[#C8A14A]/20 px-4 py-2 text-sm font-bold">{products.length} item</span></div><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-[#184D47]/50"><tr>{["Produk", "Harga", "Stok", "Status", "Aksi"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{products.map((product) => <tr key={product.id} className="border-t border-[#184D47]/10"><td className="flex items-center gap-3 p-3"><Image src={product.image || "/window.svg"} alt={product.name} width={56} height={56} className="h-14 w-14 rounded-2xl object-cover" unoptimized /><div><p className="font-black">{product.name}</p><p className="text-xs text-[#184D47]/55">{product.slug}</p></div></td><td className="p-3 font-black">{rupiah.format(product.price)}</td><td className="p-3 font-bold">{product.stock}</td><td className="p-3"><StatusBadge active={product.isActive} /></td><td className="p-3"><ActionButtons product={product} onEdit={onEdit} onDelete={onDelete} /></td></tr>)}</tbody></table></div><div className="grid gap-3 lg:hidden">{products.map((product) => <motion.article key={product.id} whileTap={{ scale: 0.98 }} className="rounded-[24px] border border-[#184D47]/10 bg-white p-3 shadow-lg shadow-[#184D47]/5"><div className="flex gap-3"><Image src={product.image || "/window.svg"} alt={product.name} width={84} height={84} className="h-24 w-24 shrink-0 rounded-[20px] object-cover" unoptimized /><div className="min-w-0 flex-1"><h4 className="line-clamp-2 font-black leading-tight">{product.name}</h4><p className="mt-1 text-lg font-black text-[#0F4C45]">{rupiah.format(product.price)}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#f8f0dd] px-3 py-1 text-xs font-black">Stok {product.stock}</span><StatusBadge active={product.isActive} /></div></div></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => onEdit(product)} className="min-h-12 rounded-2xl bg-[#0F4C45] font-black text-white active:scale-95"><Edit3 className="mr-2 inline" size={16} />Edit</button><button onClick={() => void onDelete(product)} className="min-h-12 rounded-2xl bg-red-600 font-black text-white active:scale-95"><Trash2 className="mr-2 inline" size={16} />Hapus</button></div><div className="mt-3 flex items-center justify-between rounded-2xl bg-[#f8f0dd] p-2"><button onClick={() => void onStock(product, -1)} className="h-12 w-12 rounded-2xl bg-white font-black">-</button><span className="text-xl font-black">{product.stock}</span><button onClick={() => void onStock(product, 1)} className="h-12 w-12 rounded-2xl bg-white font-black">+</button></div></motion.article>)}</div></Card>;
}

function StatusBadge({ active }: { active: boolean }) {
    return <span className={`h-fit rounded-full px-3 py-1 text-center text-xs font-bold ${active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{active ? "Aktif" : "Tidak Aktif"}</span>;
}

function ActionButtons({ product, onEdit, onDelete }: { product: Product; onEdit: (product: Product) => void; onDelete: (product: Product) => void }) {
    return <div className="flex gap-2"><button onClick={() => onEdit(product)} className="grid h-12 w-12 place-items-center rounded-2xl bg-[#184D47] text-white transition active:scale-95"><Edit3 size={17} /></button><button onClick={() => void onDelete(product)} className="grid h-12 w-12 place-items-center rounded-2xl bg-red-600 text-white transition active:scale-95"><Trash2 size={17} /></button></div>;
}

function ProductFormPanel({ form, saving, onChange, onSubmit, onUpload, onCancel }: { form: ProductForm; saving: boolean; onChange: (field: keyof ProductForm, value: string | boolean) => void; onSubmit: (event: FormEvent) => void; onUpload: (file: File) => void; onCancel: () => void }) {
    const fields: [keyof ProductForm, string, string][] = [["name", "Nama", "text"], ["slug", "Slug otomatis", "text"], ["price", "Harga", "number"], ["stock", "Stok", "number"], ["rating", "Rating", "number"], ["flavor", "Flavor", "text"], ["size", "Size", "text"], ["badge", "Badge", "text"], ["category", "Category", "text"]];
    return <Card><h3 className="mb-5 text-2xl font-black">{form.id ? "Edit Produk" : "Tambah Produk"}</h3><form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">{fields.map(([key, label, type]) => <label key={key} className="space-y-2"><span className="text-sm font-bold">{label}</span><input value={String(form[key])} onChange={(event) => onChange(key, event.target.value)} type={type} placeholder={`Masukkan ${label.toLowerCase()}`} className="min-h-12 w-full rounded-2xl border border-[#184D47]/15 bg-white px-4 outline-none transition focus:border-[#C8A14A] focus:ring-4 focus:ring-[#D4AF37]/15" required={["name", "slug", "price"].includes(key)} />{["name", "price"].includes(key) && !form[key] && <p className="text-xs font-bold text-red-500">Wajib diisi.</p>}</label>)}<label className="space-y-2 md:col-span-2"><span className="text-sm font-bold">Upload Foto</span><div className="flex flex-col gap-3 rounded-3xl border border-dashed border-[#184D47]/25 bg-[#f8f0dd] p-4 sm:flex-row sm:items-center"><Camera className="text-[#C8A14A]" /><input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void onUpload(event.target.files[0])} className="min-h-12 text-sm" /><input value={form.image} onChange={(event) => onChange("image", event.target.value)} placeholder="URL image otomatis" className="min-h-12 min-w-0 flex-1 rounded-2xl bg-white px-4" /></div></label><label className="flex min-h-12 items-center gap-3 rounded-2xl bg-white p-4 font-bold"><input type="checkbox" checked={form.isActive} onChange={(event) => onChange("isActive", event.target.checked)} /> Aktif / Tidak</label><div className="grid gap-3 md:col-span-2 sm:grid-cols-[1fr_auto]"><button disabled={saving} className="min-h-12 rounded-2xl bg-[#184D47] px-5 font-black text-white transition active:scale-95 disabled:opacity-60">{saving ? "Menyimpan..." : "Simpan ke Supabase"}</button><button type="button" onClick={onCancel} className="min-h-12 rounded-2xl border border-[#184D47]/20 px-5 font-bold transition active:scale-95">Reset</button></div></form></Card>;
}

function OrdersPanel({ orders, onStatus }: { orders: Order[]; onStatus: (order: Order, status: string) => void }) {
    const statuses = ["Menunggu", "Diproses", "Dikirim", "Selesai"];
    if (!orders.length) return <Card><EmptyState title="Belum ada pesanan" text="Pesanan pelanggan akan muncul realtime di sini." action="Buka Website" href="/" /></Card>;
    return <Card><h3 className="mb-5 text-2xl font-black">Pesanan</h3><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-[#184D47]/50"><tr>{["Invoice", "Nama", "Produk", "Status", "Total", "Detail"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[#184D47]/10"><td className="p-3 font-black">#{order.id.slice(0, 8)}</td><td className="p-3 font-bold">{order.customer}</td><td className="p-3">{order.items?.map((item) => `${item.name} x${item.quantity}`).join(", ") || "-"}</td><td className="p-3"><select value={order.status} onChange={(event) => void onStatus(order, event.target.value)} className="min-h-12 rounded-2xl border border-[#184D47]/15 px-3 font-bold">{statuses.map((status) => <option key={status}>{status}</option>)}</select></td><td className="p-3 font-black">{rupiah.format(order.total)}</td><td className="p-3"><button onClick={() => toast(`Detail ${order.id}`, "info")} className="min-h-12 rounded-2xl bg-[#0F4C45] px-4 font-black text-white">Detail</button></td></tr>)}</tbody></table></div><div className="grid gap-3 lg:hidden">{orders.map((order) => <motion.article key={order.id} whileTap={{ scale: 0.98 }} className="rounded-[24px] bg-white p-4 shadow-lg shadow-[#184D47]/5"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase text-[#184D47]/50">Invoice</p><h4 className="truncate text-lg font-black">#{order.id.slice(0, 10)}</h4></div><span className="rounded-full bg-[#f8f0dd] px-3 py-1 text-xs font-black">{order.status}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><Info label="Nama" value={order.customer} /><Info label="Qty" value={String(order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0)} /><Info label="Produk" value={order.items?.map((item) => item.name).join(", ") || "-"} wide /><Info label="Total" value={rupiah.format(order.total)} /></div><select value={order.status} onChange={(event) => void onStatus(order, event.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-[#184D47]/15 px-3 font-bold">{statuses.map((status) => <option key={status}>{status}</option>)}</select><button onClick={() => toast(`Detail ${order.id}`, "info")} className="mt-3 min-h-12 w-full rounded-2xl bg-[#0F4C45] font-black text-white">Detail</button></motion.article>)}</div></Card>;
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
    return <div className={wide ? "col-span-2" : ""}><p className="text-xs font-bold text-[#184D47]/50">{label}</p><p className="break-words font-black">{value}</p></div>;
}

function EmptyState({ title, text, action, href }: { title: string; text: string; action: string; href: string }) {
    return <div className="grid place-items-center py-10 text-center"><div className="mb-4 grid h-24 w-24 place-items-center rounded-[2rem] bg-gradient-to-br from-[#0F4C45] to-[#D4AF37] text-white shadow-xl"><Boxes size={40} /></div><h3 className="text-2xl font-black">{title}</h3><p className="mt-2 max-w-sm text-[#184D47]/65">{text}</p><Link href={href} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#0F4C45] px-5 font-black text-white transition active:scale-95">{action}</Link></div>;
}

function AccountPanel({ adminEmail, onLogout }: { adminEmail: string; onLogout: () => void }) {
    const actions = [{ label: "Edit Profil", icon: Edit3 }, { label: "Ganti Password", icon: KeyRound }, { label: "Role Admin", icon: ShieldCheck }];
    return <div className="space-y-5"><Card className="overflow-hidden bg-[#0F4C45] text-white"><div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-[2rem] bg-gradient-to-br from-[#D4AF37] to-white text-4xl font-black text-[#0F4C45]">{(adminEmail || "A").slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="text-sm font-black uppercase tracking-[0.25em] text-[#D4AF37]">Akun Admin</p><h3 className="mt-2 text-3xl font-black">Admin AFA STORE</h3><p className="mt-1 break-all text-white/75">{adminEmail}</p><span className="mt-3 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-black">Role: admin</span></div></div></Card><div className="grid gap-3 sm:grid-cols-3">{actions.map((action) => <button key={action.label} onClick={() => toast(`${action.label} siap digunakan`, "info")} className="min-h-16 rounded-[24px] bg-white/85 p-4 text-left font-black shadow-lg transition hover:-translate-y-1 active:scale-95"><action.icon className="mb-2 text-[#D4AF37]" />{action.label}</button>)}</div><button onClick={() => void onLogout()} className="min-h-12 w-full rounded-2xl bg-red-600 font-black text-white transition active:scale-95"><LogOut className="mr-2 inline" size={18} />Logout</button></div>;
}





