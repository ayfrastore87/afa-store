"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Bell, X, ExternalLink, QrCode, AlertTriangle, FileText, ShieldCheck, KeyRound, MessageSquareHeart, ArrowRight, CalendarDays, Coins } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import Swal from "sweetalert2";
import { BarChart3, Boxes, Edit3, Handshake, Home, Loader2, LogOut, PackagePlus, PlusCircle, Receipt, Settings, ShoppingBag, Trash2, Users, UserCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getUserFacingMessage, safeApiMessage } from "@/lib/user-facing-error";
import { uploadProductImage } from "@/lib/product-image-upload-client";
import { AdminBreadcrumb, AdminDashboardLink, AdminHeaderWebsiteButton } from "@/components/admin/AdminNav";
import { ReportsPanel, SettingsPanel, StockPanel, TestimonialsPanel } from "@/components/admin/AdminAdvancedPanels";

type Product = {
    id: string;
    name: string;
    slug: string;
    price: number;
    stock: number;
    rating: number | null;
    description: string | null;
    flavor: string | null;
    size: string | null;
    weight: number | null;
    badge: string | null;
    categoryId: string | null;
    category?: string | null;
    image: string | null;
    isActive: boolean;
    createdAt?: string;
};

type OrderItem = { name: string; quantity: number };

type OrderItemWithProduct = OrderItem & { productId?: string | null; product_id?: string | null };

type Order = {
    id: string;
    invoice?: string;
    customer: string;
    phone: string;
    address?: string;
    status: string;
    paymentMethod: string;
    paymentStatus?: string;
    total: number;
    createdAt: string;
    courier?: string | null;
    courierCode?: string | null;
    trackingNumber?: string | null;
    shippedAt?: string | null;
    biteshipOrderId?: string | null;
    biteshipStatus?: string | null;
    biteshipTrackingId?: string | null;
    biteshipLabelUrl?: string | null;
    biteshipCreatedAt?: string | null;
    items?: OrderItemWithProduct[];
};

type _StockHistoryPayload = {
    product_id: string;
    product_name: string;
    transaction_type: "IN" | "OUT" | "SALE" | "RETURN" | "ADJUSTMENT";
    quantity: number;
    stock_before: number;
    stock_after: number;
    note: string;
    created_by: string;
    order_id?: string;
};

type ProductForm = {
    id?: string;
    name: string;
    slug: string;
    price: string;
    stock: string;
    rating: string;
    description: string;
    flavor: string;
    size: string;
    weight: string;
    badge: string;
    categoryId: string;
    image: string;
    isActive: boolean;
};

const emptyForm: ProductForm = {
    name: "",
    slug: "",
    price: "",
    stock: "0",
    rating: "0",
    description: "",
    flavor: "",
    size: "",
    weight: "1000",
    badge: "",
    categoryId: "",
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
        id: "kasir",
        label: "Kasir",
        icon: Receipt,
        href: "/admin/kasir",
    },
    {
        id: "kasir-accounts",
        label: "Akun Kasir",
        icon: UserCircle,
        href: "/admin/akun-kasir",
    },
    {
        id: "testimonials",
        label: "Testimoni",
        icon: MessageSquareHeart,
        href: "/admin/testimonials",
    },
    {
        id: "mitra",
        label: "Mitra",
        icon: Handshake,
        href: "/admin/mitra",
    },
    {
        id: "customers",
        label: "Pelanggan",
        icon: Users,
        href: "/admin/pelanggan",
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
    "/admin/kasir": "kasir",
    "/admin/kasir/riwayat": "kasir",
    "/admin/testimonials": "testimonials",
    "/admin/testimoni": "testimonials",
    "/admin/mitra": "mitra",
    "/admin/reports": "reports",
    "/admin/laporan": "reports",
    "/admin/settings": "settings",
    "/admin/pengaturan": "settings",
    "/admin/account": "account",
    "/admin/akun": "account",
    "/admin/pelanggan": "customers",
};

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const STATUS_LABELS: Record<string, string> = {
    PENDING: "Menunggu",
    PROCESSING: "Diproses",
    PACKED: "Dikemas",
    SHIPPED: "Dikirim",
    COMPLETED: "Selesai",
    CANCELLED: "Dibatalkan",
    CANCELED: "Dibatalkan",
};

function orderStatusLabel(status: string) {
    return STATUS_LABELS[String(status).toUpperCase()] ?? String(status);
}

const DEFAULT_COURIERS = ["JNE", "J&T", "SiCepat"];

function parseCouriers(raw: unknown): string[] {
    const parseValue = (value: unknown): string => {
        if (typeof value === "string") return value;
        if (value && typeof value === "object" && "value" in value) return String((value as { value: unknown }).value ?? "");
        return "";
    };
    const source = parseValue(raw);
    const list = source
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return list.length ? Array.from(new Set(list)) : DEFAULT_COURIERS;
}

function slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function toast(title: string, icon: "success" | "error" | "info" = "success") {
    void Swal.fire({ toast: true, position: "top-end", timer: 2200, showConfirmButton: false, icon, title });
}

// Helper function to convert public URL to storage path (not currently used)
function _storagePathFromPublicUrl(url: string | null | undefined, bucket: string) {
    if (!url) return null;
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.indexOf(marker);
    return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : null;
}

export default function AdminPage() {
    const pathname = usePathname();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("home");
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [adminEmail, setAdminEmail] = useState("");
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<ProductForm>(emptyForm);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [detailOrder, setDetailOrder] = useState<Order | null>(null);
    const [couriers, setCouriers] = useState<string[]>(DEFAULT_COURIERS);
    // New state for tracking pending stock adjustments per product
    const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(new Set());

    const loadData = useCallback(async () => {
        setLoading(true);
        const [productRes, orderRes, categoryRes, courierRes] = await Promise.all([
            supabase.from("products").select("*").order("createdAt", { ascending: false }),
            supabase.from("orders").select("*, items:order_items(name, quantity, productId)").order("createdAt", { ascending: false }),
            fetch("/api/categories").then((response) => response.json() as Promise<{ data?: { id: string; name: string }[] }>),
            supabase.from("settings").select("value").eq("key", "couriers").maybeSingle(),
        ]);

        if (productRes.error) {
            console.error("loadData products", productRes.error);
            toast(getUserFacingMessage(productRes.error, "Produk gagal dimuat. Silakan coba lagi."), "error");
        }
        if (orderRes.error) {
            console.error("loadData orders", orderRes.error);
            toast(getUserFacingMessage(orderRes.error, "Pesanan gagal dimuat. Silakan coba lagi."), "error");
        }
        setProducts((productRes.data ?? []) as Product[]);
        setOrders((orderRes.data ?? []) as Order[]);
        setCategories(categoryRes.data ?? []);
        if (!courierRes.error) setCouriers(parseCouriers(courierRes.data?.value));
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
        try {
            const { url } = await uploadProductImage(file);
            updateForm("image", url);
            toast("Foto produk berhasil diupload");
        } catch (error) {
            toast(getUserFacingMessage(error, "Gambar gagal diunggah. Silakan coba lagi."), "error");
        }
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
            description: form.description || null,
            flavor: form.flavor || null,
            size: form.size || null,
            weight: Number(form.weight || 1000),
            badge: form.badge || null,
            categoryId: form.categoryId || null,
            image: form.image || null,
            isActive: form.isActive,
        };
        const response = await fetch(form.id ? `/api/products/${form.id}` : "/api/products", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        let resultError: string | null = null;
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            console.error("saveProduct", data);
            resultError = safeApiMessage(data) || "Produk gagal disimpan. Silakan coba lagi.";
        }
        setSaving(false);
        if (resultError) return toast(resultError, "error");
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
            description: product.description ?? "",
            flavor: product.flavor ?? "",
            size: product.size ?? "",
            weight: String(product.weight ?? 1000),
            badge: product.badge ?? "",
            categoryId: product.categoryId ?? "",
            image: product.image ?? "",
            isActive: product.isActive,
        });
        setActiveTab("add");
    }

    async function deleteProduct(product: Product) {
        const confirm = await Swal.fire({ title: "Hapus produk?", text: product.name, icon: "warning", showCancelButton: true, confirmButtonColor: "#184D47", cancelButtonText: "Batal", confirmButtonText: "Hapus" });
        if (!confirm.isConfirmed) return;
        const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
        if (!response.ok) return toast("Produk gagal dinonaktifkan", "error");
        toast("Produk dinonaktifkan");
        void loadData();
    }

    async function updateStock(product: Product, delta: number) {
        // Prevent multiple simultaneous requests for same product
        if (pendingProductIds.has(product.id)) return;

        // Add to pending set - disable buttons for this product
        setPendingProductIds((prev) => new Set(prev).add(product.id));

        try {
            // Call server endpoint instead of direct DB write
            const response = await fetch(`/api/admin/products/${product.id}/stock`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ delta }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                // Handle specific stock_zero case
                if ("reason" in errorData && errorData.reason === "stock_zero") {
                    toast(errorData.message || "Stok sudah nol, tidak dapat dikurangi.", "info");
                    return;
                }

                toast(errorData.message || "Gagal memperbarui stok.", "error");
                return;
            }

            const result = await response.json();
            
            if (result.success) {
                // Update local state with SERVER RESPONSE value
                setProducts((items) =>
                    items.map((item) =>
                        item.id === product.id ? { ...item, stock: result.newStock } : item
                    )
                );
                toast("Stok berhasil diperbarui.");
            } else {
                toast(result.message || "Gagal memperbarui stok.", "error");
            }
        } catch (error) {
            console.error("updateStock error:", error);
            toast("Terjadi kesalahan pada koneksi server.", "error");
        } finally {
            // Remove from pending regardless of success/error
            setPendingProductIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(product.id);
                return newSet;
            });
        }
    }

    async function updateOrderStatus(order: Order, status: string) {
        const normalizedStatus = status.toLowerCase();
        // Stock is decremented atomically at checkout. Completion must not decrement it again.
        // Cancellation restoration remains disabled until a separate policy is approved.
        const orderPatch: Record<string, string> = { status };
        if (normalizedStatus === "selesai" || normalizedStatus === "completed") orderPatch.completedAt = new Date().toISOString();
        if (["dibatalkan", "batal", "cancelled", "canceled"].includes(normalizedStatus)) orderPatch.cancelledAt = new Date().toISOString();
        const { error } = await supabase.from("orders").update(orderPatch).eq("id", order.id);
        if (error) {
            console.error("updateOrderStatus", error);
            return toast(getUserFacingMessage(error, "Status pesanan gagal diperbarui. Silakan coba lagi."), "error");
        }
        toast("Status pesanan diperbarui");
    }

    async function saveShipping(order: Order, courier: string, trackingNumber: string) {
        const response = await fetch(`/api/admin/orders/${order.id}/shipping`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courier, trackingNumber }),
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string; order?: Partial<Order> };

        if (!response.ok) {
            toast(safeApiMessage(data) || "Pengiriman gagal disimpan.", "error");
            return false;
        }

        const updatedOrder = { ...order, ...data.order };
        setOrders((items) => items.map((item) => (item.id === order.id ? updatedOrder : item)));
        setDetailOrder(updatedOrder);
        toast("Pengiriman berhasil disimpan");
        return true;
    }

    async function createBiteshipShipping(order: Order) {
        const response = await fetch(`/api/admin/orders/${order.id}/biteship`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string; order?: Partial<Order> };

        if (!response.ok) {
            toast(safeApiMessage(data) || "Pengiriman Biteship gagal dibuat.", "error");
            return false;
        }

        const updatedOrder = { ...order, ...data.order };
        setOrders((items) => items.map((item) => (item.id === order.id ? updatedOrder : item)));
        setDetailOrder(updatedOrder);
        toast("Pengiriman Biteship berhasil dibuat");
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
        <main className="admin-shell min-h-screen overflow-x-hidden pb-28 text-[#184D47] lg:pb-[max(32px,env(safe-area-inset-bottom))]">
            <MobileHeader adminEmail={adminEmail} onMenu={() => setDrawerOpen(true)} />
            <div className="admin-frame mx-auto flex w-full max-w-[1560px] gap-[18px] px-3 py-4 sm:px-4 lg:px-5 lg:py-4 xl:gap-[22px] xl:px-6">
                <AdminSidebar activeTab={activeTab} onClose={() => setDrawerOpen(false)} />
                <MobileDrawer open={drawerOpen} activeTab={activeTab} onClose={() => setDrawerOpen(false)} />

                <section className="min-w-0 flex-1">
                    <AdminBreadcrumb />
                    <header className="admin-hero relative hidden overflow-hidden rounded-[24px] text-white lg:block lg:min-h-[128px] xl:min-h-[136px]">
                        <span aria-hidden="true" className="admin-hero-orb admin-hero-orb-a" />
                        <span aria-hidden="true" className="admin-hero-orb admin-hero-orb-b" />
                        <span aria-hidden="true" className="admin-hero-line" />
                        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="admin-hero-grid relative z-10 grid items-center gap-x-5 gap-y-3 px-6 py-5 xl:px-7">
                            <div className="admin-hero-text min-w-0">
                                <p className="admin-kicker text-[11px] font-bold uppercase tracking-[0.38em] text-[#E4C982]">Premium Control Room</p>
                                <h2 className="admin-hero-title mt-1.5 font-black leading-[1.05]">Dashboard Admin</h2>
                                <p className="mt-1.5 max-w-xl text-[14px] leading-snug text-white/75">Kelola produk, stok, pesanan, pelanggan dan operasional AFA STORE secara realtime tanpa refresh.</p>
                            </div>
                            <div className="admin-hero-actions flex shrink-0 gap-3 justify-self-end"><AdminHeaderWebsiteButton /><button onClick={logout} className="admin-logout-btn flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-5 font-semibold transition duration-300 hover:bg-white/15"><LogOut size={18} /> Logout</button></div>
                        </motion.div>
                    </header>

                    <div className="mt-3 flex gap-3 lg:hidden">
                        <AdminHeaderWebsiteButton />
                        <button onClick={logout} className="admin-logout-btn flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#184D47] px-4 font-semibold text-white transition active:scale-[0.98]"><LogOut size={18} /> Logout</button>
                    </div>

                    {loading ? <Skeleton /> : (
                        <div className="admin-content mt-4 flex flex-col gap-4 xl:mt-[18px] xl:gap-[18px]">
                            {activeTab === "home" && <HomePanel summary={summary} adminEmail={adminEmail} />}
                            {activeTab === "products" && <ProductsPanel products={products} onEdit={editProduct} onDelete={deleteProduct} onStock={updateStock} _isPendingProduct={pendingProductIds.has} />}
                            {activeTab === "stock" && <StockPanel />}
                            {activeTab === "add" && <ProductFormPanel form={form} categories={categories} saving={saving} onChange={updateForm} onSubmit={saveProduct} onUpload={uploadImage} onCancel={() => setForm(emptyForm)} />}
                            {activeTab === "orders" && <OrdersPanel orders={orders} onStatus={updateOrderStatus} onDetail={setDetailOrder} />}
                            {activeTab === "testimonials" && <TestimonialsPanel />}
                            {activeTab === "reports" && <ReportsPanel />}
                            {activeTab === "settings" && <SettingsPanel />}
                            {activeTab === "account" && <AccountPanel adminEmail={adminEmail} onLogout={logout} />}
                        </div>
                    )}
                </section>
            </div>

            <MobileBottomNav activeTab={activeTab} />
            {detailOrder && <OrderDetailModal order={detailOrder} couriers={couriers} onClose={() => setDetailOrder(null)} onSave={saveShipping} onCreateBiteship={createBiteshipShipping} />}
        </main>
    );
}

function MobileHeader({ adminEmail, onMenu }: { adminEmail: string; onMenu: () => void }) {
    return <header className="sticky top-0 z-40 border-b border-white/50 bg-white/80 px-3 py-3 shadow-lg shadow-[#184D47]/5 backdrop-blur-xl lg:hidden"><div className="flex items-center gap-3"><button onClick={onMenu} className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0F4C45] text-white active:scale-95"><Menu size={22} /></button><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-[#0F4C45]"><Image src="/AFA LOGO.svg" alt="AFA STORE" width={34} height={34} /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]">AFA STORE</p><h1 className="truncate text-base font-black leading-tight sm:text-lg">Dashboard Admin</h1></div><button className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#0F4C45] shadow-md"><Bell size={20} /><span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500" /></button><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#0F4C45] to-[#D4AF37] text-sm font-black text-white">{(adminEmail || "A").slice(0, 1).toUpperCase()}</div></div></header>;
}

function SidebarContent({ activeTab, onClose }: { activeTab: string; onClose?: () => void }) {
    return (
        <>
            <div className="admin-brand relative shrink-0 px-2 pb-3 pt-1 text-center">
                <div className="admin-brand-logo mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.07] ring-1 ring-[#D4AF37]/35"><Image src="/AFA LOGO.svg" alt="" width={38} height={38} className="h-8 w-8" /></div>
                <h1 className="admin-brand-title mt-2 text-[23px] font-black leading-none tracking-[0.06em] text-white">AFA STORE</h1>
                <p className="mt-1 text-[12px] font-medium tracking-[0.12em] text-white/70">Admin Panel</p>
                <span aria-hidden="true" className="admin-brand-rule mx-auto mt-3 block h-px w-4/5" />
            </div>
            <nav className="admin-sidebar-nav relative z-10 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pb-2 pr-1" aria-label="Menu admin">
                <AdminDashboardLink onClick={onClose} />
                {tabs.filter((tab) => tab.id !== "home").map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                        <Link onClick={onClose} key={tab.id} href={tab.href} aria-current={active ? "page" : undefined} className={`admin-nav-item flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left text-[15px] font-semibold transition duration-200 active:scale-[0.98] ${active ? "admin-nav-active text-white" : "text-white/85 hover:translate-x-0.5 hover:bg-white/[0.08] hover:text-white"}`}>
                            <tab.icon size={20} className="shrink-0" />
                            <span className="truncate">{tab.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}

function AdminSidebar({ activeTab, onClose }: { activeTab: string; onClose: () => void }) {
    return <aside className="admin-sidebar admin-sidebar-desktop sticky top-4 hidden max-h-[calc(100dvh-32px)] w-[240px] shrink-0 self-start rounded-[24px] p-3.5 text-white lg:flex lg:flex-col"><SidebarContent activeTab={activeTab} onClose={onClose} /><span aria-hidden="true" className="admin-sidebar-wave" /></aside>;
}

function MobileDrawer({ open, activeTab, onClose }: { open: boolean; activeTab: string; onClose: () => void }) {
    return <>{open && <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm lg:hidden" aria-label="Tutup menu" />}<motion.aside drag="x" dragConstraints={{ left: 0, right: 0 }} onDragEnd={(_, info) => info.offset.x < -80 && onClose()} initial={false} animate={{ x: open ? 0 : "-110%" }} transition={{ type: "spring", stiffness: 320, damping: 32 }} className="admin-sidebar fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-80 flex-col overflow-hidden rounded-r-[26px] p-4 text-white shadow-2xl lg:hidden"><button onClick={onClose} className="relative z-10 mb-2 ml-auto grid h-11 w-11 place-items-center rounded-2xl bg-white/10" aria-label="Tutup menu"><X /></button><SidebarContent activeTab={activeTab} onClose={onClose} /><span aria-hidden="true" className="admin-sidebar-wave" /></motion.aside></>;
}

function MobileBottomNav({ activeTab }: { activeTab: string }) {
    const mobileTabs = tabs.filter((tab) => ["home", "products", "add", "orders", "testimonials"].includes(tab.id));
    return <nav className="fixed inset-x-2 bottom-2 z-40 grid grid-cols-5 rounded-[1.7rem] border border-white/70 bg-white/90 p-2 shadow-2xl backdrop-blur-xl lg:hidden">{mobileTabs.map((tab) => <Link key={tab.id} href={tab.href} className={`relative min-h-14 rounded-2xl px-1 py-2 text-center text-[10px] font-black transition duration-200 active:scale-95 ${activeTab === tab.id ? "text-[#D4AF37]" : "text-[#184D47]/70"}`}>{activeTab === tab.id && <motion.span layoutId="bottom-nav-active" className="absolute inset-0 rounded-2xl bg-[#184D47]" />}<span className="relative z-10"><tab.icon className="mx-auto mb-1" size={19} /><span>{tab.label}</span></span></Link>)}</nav>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className={`admin-card rounded-[24px] border border-white/70 bg-white/85 p-5 shadow-xl shadow-[#184D47]/10 backdrop-blur ${className}`}>{children}</motion.div>;
}

function Skeleton() {
    return <div className="mt-[22px] grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="admin-card skeleton relative h-36 overflow-hidden rounded-[24px] bg-white/70 shadow" />)}</div>;
}

function CountUp({ value, money = false }: { value: number; money?: boolean }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => { const start = performance.now(); const timer = window.setInterval(() => { const progress = Math.min((performance.now() - start) / 850, 1); setDisplay(Math.round(value * progress)); if (progress >= 1) window.clearInterval(timer); }, 16); return () => window.clearInterval(timer); }, [value]);
    return <>{money ? rupiah.format(display) : display}</>;
}

type StatTone = "green" | "gold" | "forest" | "amber" | "coral" | "blue";
type StatItem = { label: string; hint: string; value: number; money?: boolean; icon: LucideIcon; tone: StatTone };
type QuickAction = { label: string; href: string; icon: LucideIcon; tone: StatTone };

function HomePanel({ summary, adminEmail }: { summary: { products: number; stock: number; orders: number; revenueToday: number; lowStock: number; pending: number }; adminEmail: string }) {
    // Visual-only copy; every value below is the existing `summary` calculation untouched.
    const items: StatItem[] = [
        { label: "Total Produk", hint: "Produk aktif di toko", value: summary.products, icon: Boxes, tone: "green" },
        { label: "Total Stok", hint: "Stok tersedia saat ini", value: summary.stock, icon: BarChart3, tone: "gold" },
        { label: "Pesanan", hint: "Total pesanan masuk", value: summary.orders, icon: ShoppingBag, tone: "forest" },
        { label: "Pendapatan", hint: "Total pendapatan", value: summary.revenueToday, money: true, icon: Coins, tone: "amber" },
        { label: "Produk Hampir Habis", hint: "Perlu segera restock", value: summary.lowStock, icon: AlertTriangle, tone: "coral" },
        { label: "Pending Order", hint: "Menunggu konfirmasi", value: summary.pending, icon: Bell, tone: "blue" },
    ];
    // hrefs are identical to the previous implementation.
    const actions: QuickAction[] = [
        { label: "Tambah Produk", href: "/admin/products/new", icon: PlusCircle, tone: "green" },
        { label: "Kelola Stok", href: "/admin/stock", icon: BarChart3, tone: "gold" },
        { label: "Pesanan Baru", href: "/admin/orders", icon: ShoppingBag, tone: "forest" },
        { label: "Laporan", href: "/admin/reports", icon: FileText, tone: "amber" },
        { label: "Website", href: "/", icon: ExternalLink, tone: "coral" },
        { label: "QRIS", href: "/admin/settings", icon: QrCode, tone: "blue" },
    ];
    const initial = (adminEmail || "A").slice(0, 1).toUpperCase();

    return (
        <div className="admin-stack flex flex-col gap-4 xl:gap-[18px]">
            <section className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3 xl:gap-[18px]" aria-label="Statistik toko">
                {items.map((item, index) => (
                    <motion.article key={item.label} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: index * 0.04 }} data-tone={item.tone} className="admin-card admin-stat relative min-h-[126px] min-w-0 overflow-hidden rounded-[22px] border border-white/70 bg-white p-4 shadow-xl shadow-[#184D47]/8 xl:min-h-[132px] xl:px-5 xl:py-[18px]">
                        <span aria-hidden="true" className="admin-stat-wave" />
                        <item.icon aria-hidden="true" className="admin-stat-ghost pointer-events-none absolute right-4 top-3 hidden sm:block" size={56} strokeWidth={1.2} />
                        <div className="relative z-10 flex items-start gap-3.5 pr-7">
                            <div className="admin-stat-icon grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white shadow-lg"><item.icon size={23} /></div>
                            <div className="min-w-0 flex-1">
                                <p className="admin-label text-[11px] font-bold uppercase tracking-[0.2em] text-[#184D47]/60">{item.label}</p>
                                <p className="admin-stat-value mt-0.5 break-words text-[28px] font-black leading-tight text-[#184D47] sm:text-[30px] xl:text-[32px]"><CountUp value={item.value} money={item.money} /></p>
                                <p className="admin-stat-hint mt-1 text-[13px] text-[#184D47]/65">{item.hint}</p>
                            </div>
                        </div>
                        <span aria-hidden="true" className="admin-stat-arrow pointer-events-none absolute bottom-4 right-4 z-10 text-[#184D47]/55"><ArrowRight size={18} /></span>
                    </motion.article>
                ))}
            </section>

            <Card className="admin-quick !p-4 xl:!p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div><p className="admin-label text-[11px] font-bold uppercase tracking-[0.3em] text-[#B8902F]">Quick Action</p><h3 className="admin-section-title text-[22px] font-black leading-tight xl:text-2xl">Aksi Cepat</h3></div>
                    <span className="admin-pill inline-flex items-center gap-2 rounded-full bg-[#0F4C45]/8 px-3.5 py-2 text-xs font-bold text-[#184D47]"><span aria-hidden="true" className="admin-dot h-2 w-2 rounded-full bg-[#2E8B57]" />Realtime</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2.5 xl:gap-3.5">
                    {actions.map((action) => (
                        <Link key={action.label} href={action.href} data-tone={action.tone} className="admin-action group relative flex min-h-[104px] flex-col justify-between gap-2.5 overflow-hidden rounded-[18px] p-3.5 font-bold text-[#184D47] shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg active:scale-[0.97]">
                            <div className="flex items-start gap-3">
                                <span className="admin-action-icon grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-white shadow-md"><action.icon size={19} /></span>
                                <span className="pt-0.5 text-[14px] leading-tight lg:text-[13px] xl:text-[14px]">{action.label}</span>
                            </div>
                            <span aria-hidden="true" className="admin-action-arrow ml-auto grid h-7 w-7 place-items-center rounded-full bg-white/70 text-[#184D47] transition duration-300 group-hover:translate-x-0.5"><ArrowRight size={15} /></span>
                        </Link>
                    ))}
                </div>
            </Card>

            <Card className="admin-account !p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        <div className="admin-avatar grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-black text-white shadow-lg" aria-hidden="true">{initial}</div>
                        <div className="min-w-0">
                            <p className="text-base font-black text-[#184D47]">Akun Admin</p>
                            <p className="admin-account-email mt-0.5 break-all text-sm text-[#184D47]/70">Login sebagai: {adminEmail}</p>
                        </div>
                    </div>
                    <span className="admin-pill inline-flex w-fit items-center gap-2 rounded-full bg-[#2E8B57]/10 px-3.5 py-2 text-xs font-bold text-[#1F6B43]"><span aria-hidden="true" className="admin-dot h-2 w-2 rounded-full bg-[#2E8B57]" />Online</span>
                    <AdminClock />
                </div>
            </Card>
        </div>
    );
}

function AdminClock() {
    // Rendered as empty on the server and first client paint, then filled after mount —
    // this keeps the markup identical during hydration (no mismatch) while still showing local time.
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        setNow(new Date());
        const timer = window.setInterval(() => setNow(new Date()), 30_000);
        return () => window.clearInterval(timer);
    }, []);
    if (!now) return <div className="hidden min-h-12 sm:block sm:w-px" aria-hidden="true" />;
    const dateLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
    const timeLabel = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace(".", ":");
    return (
        <div className="admin-clock flex items-center gap-3 border-t border-[#184D47]/10 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <span className="admin-clock-icon grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[#0F4C45]/8 text-[#0F4C45]"><CalendarDays size={20} /></span>
            <div className="min-w-0"><p className="text-sm font-bold text-[#184D47]">{dateLabel}</p><p className="admin-clock-time text-xs text-[#184D47]/65"><time>{timeLabel}</time></p></div>
        </div>
    );
}

function ProductsPanel({ products, onEdit, onDelete, onStock, _isPendingProduct }: { 
    products: Product[]; 
    onEdit: (product: Product) => void; 
    onDelete: (product: Product) => void; 
    onStock: (product: Product, delta: number) => void;
    _isPendingProduct: (productId: string) => boolean 
}) {
    if (!products.length) return <Card><EmptyState title="Belum ada produk" text="Tambahkan produk pertama agar tampil di katalog AFA STORE." action="Tambah Produk" href="/admin/products/new" /></Card>;
    return <Card><div className="mb-5 flex items-center justify-between"><h3 className="text-2xl font-black">Produk</h3><span className="rounded-full bg-[#C8A14A]/20 px-4 py-2 text-sm font-bold">{products.length} item</span></div><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-[#184D47]/50"><tr>{["Produk", "Harga", "Stok", "Status", "Aksi"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{products.map((product) => <tr key={product.id} className="border-t border-[#184D47]/10"><td className="flex items-center gap-3 p-3"><Image src={product.image || "/window.svg"} alt={product.name} width={56} height={56} className="h-14 w-14 rounded-2xl object-cover" unoptimized /><div><p className="font-black">{product.name}</p><p className="text-xs text-[#184D47]/55">{product.slug}</p></div></td><td className="p-3 font-black">{rupiah.format(product.price)}</td><td className="p-3 font-bold">{product.stock}</td><td className="p-3"><StatusBadge active={product.isActive} /></td><td className="p-3"><ActionButtons product={product} onEdit={onEdit} onDelete={onDelete} /></td></tr>)}</tbody></table></div><div className="grid gap-3 lg:hidden">{products.map((product) => <motion.article key={product.id} whileTap={{ scale: 0.98 }} className="rounded-[24px] border border-[#184D47]/10 bg-white p-3 shadow-lg shadow-[#184D47]/5"><div className="flex gap-3"><Image src={product.image || "/window.svg"} alt={product.name} width={84} height={84} className="h-24 w-24 shrink-0 rounded-[20px] object-cover" unoptimized /><div className="min-w-0 flex-1"><h4 className="line-clamp-2 font-black leading-tight">{product.name}</h4><p className="mt-1 text-lg font-black text-[#0F4C45]">{rupiah.format(product.price)}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#f8f0dd] px-3 py-1 text-xs font-black">Stok {product.stock}</span><StatusBadge active={product.isActive} /></div></div></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => onEdit(product)} className="min-h-12 rounded-2xl bg-[#0F4C45] font-black text-white active:scale-95"><Edit3 className="mr-2 inline" size={16} />Edit</button><button onClick={() => void onDelete(product)} className="min-h-12 rounded-2xl bg-red-600 font-black text-white active:scale-95"><Trash2 className="mr-2 inline" size={16} />Hapus</button></div><div className="mt-3 flex items-center justify-between rounded-2xl bg-[#f8f0dd] p-2"><button onClick={() => void onStock(product, -1)} className="h-12 w-12 rounded-2xl bg-white font-black">-</button><span className="text-xl font-black">{product.stock}</span><button onClick={() => void onStock(product, 1)} className="h-12 w-12 rounded-2xl bg-white font-black">+</button></div></motion.article>)}</div></Card>;
}

function StatusBadge({ active }: { active: boolean }) {
    return <span className={`h-fit rounded-full px-3 py-1 text-center text-xs font-bold ${active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{active ? "Aktif" : "Tidak Aktif"}</span>;
}

function ActionButtons({ product, onEdit, onDelete }: { product: Product; onEdit: (product: Product) => void; onDelete: (product: Product) => void }) {
    return <div className="flex gap-2"><button onClick={() => onEdit(product)} className="grid h-12 w-12 place-items-center rounded-2xl bg-[#184D47] text-white transition active:scale-95"><Edit3 size={17} /></button><button onClick={() => void onDelete(product)} className="grid h-12 w-12 place-items-center rounded-2xl bg-red-600 text-white transition active:scale-95"><Trash2 size={17} /></button></div>;
}

// Stock adjustment UI component (for future implementation)
function _StockAdjustmentButtons({ product, onStock, isPending }: { product: Product; onStock: (product: Product, delta: number) => void; isPending: boolean }) {
    const pending = isPending && product.id !== undefined;
    
    return (
        <div className="flex items-center gap-1">
            <button
                onClick={() => onStock(product, -1)}
                disabled={pending}
                className="h-10 min-w-10 grid place-items-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Kurangi stok"
            >
                −
            </button>
            <span className="min-w-8 text-center font-black">{product.stock}</span>
            <button
                onClick={() => onStock(product, 1)}
                disabled={pending}
                className="h-10 min-w-10 grid place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Tambah stok"
            >
                +
            </button>
        </div>
    );
}

function ProductFormPanel({ form, categories, saving, onChange, onSubmit, onUpload, onCancel }: { form: ProductForm; categories: { id: string; name: string }[]; saving: boolean; onChange: (field: keyof ProductForm, value: string | boolean) => void; onSubmit: (event: FormEvent) => void; onUpload: (file: File) => void; onCancel: () => void }) {
    const fields: [keyof ProductForm, string, string][] = [["name", "Nama", "text"], ["slug", "Slug otomatis", "text"], ["price", "Harga", "number"], ["stock", "Stok", "number"], ["weight", "Berat (gram)", "number"], ["rating", "Rating", "number"], ["flavor", "Flavor", "text"], ["size", "Size", "text"], ["badge", "Badge", "text"]];
    return <Card><h3 className="mb-5 text-2xl font-black">{form.id ? "Edit Produk" : "Tambah Produk"}</h3><form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">{fields.map(([key, label, type]) => <label key={key} className="space-y-2"><span className="text-sm font-bold">{label}</span><input value={String(form[key])} onChange={(event) => onChange(key, event.target.value)} type={type} min={type === "number" ? 0 : undefined} max={key === "rating" ? 5 : undefined} step={key === "rating" ? "0.1" : undefined} className="min-h-12 w-full rounded-2xl border bg-white px-4" required /></label>)}<label className="space-y-2"><span className="text-sm font-bold">Kategori</span><select value={form.categoryId} onChange={(event) => onChange("categoryId", event.target.value)} className="min-h-12 w-full rounded-2xl border bg-white px-4"><option value="">Tanpa Kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="space-y-2 md:col-span-2"><span className="flex items-center justify-between text-sm font-bold"><span>Deskripsi Produk</span><span className="font-medium text-[#6D6558]">{form.description.length} / 1000</span></span><textarea value={form.description} onChange={(event) => onChange("description", event.target.value)} maxLength={1000} rows={5} placeholder="Tuliskan informasi lengkap produk, rasa, keunggulan, bahan, atau saran penyajian..." className="min-h-32 w-full resize-y rounded-2xl border bg-white px-4 py-3" /></label><label className="flex items-center gap-3"><input type="checkbox" checked={form.isActive} onChange={(event) => onChange("isActive", event.target.checked)} /> Produk Aktif</label><label className="space-y-2 md:col-span-2"><span className="text-sm font-bold">Foto</span><input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && void onUpload(event.target.files[0])} /><input value={form.image} onChange={(event) => onChange("image", event.target.value)} className="min-h-12 w-full rounded-2xl bg-white px-4" placeholder="URL image" /></label><div className="grid gap-3 md:col-span-2 sm:grid-cols-[1fr_auto]"><button disabled={saving} className="min-h-12 rounded-2xl bg-[#184D47] px-5 font-black text-white">{saving ? "Menyimpan..." : "Simpan"}</button><button type="button" onClick={onCancel} className="min-h-12 rounded-2xl border px-5 font-bold">Reset</button></div></form></Card>;
}

function OrdersPanel({ orders, onStatus, onDetail }: { orders: Order[]; onStatus: (order: Order, status: string) => void; onDetail: (order: Order) => void }) {
    const statuses = ["Menunggu", "Diproses", "Dikemas", "Dikirim", "Selesai"];
    if (!orders.length) return <Card><EmptyState title="Belum ada pesanan" text="Pesanan pelanggan akan muncul realtime di sini." action="Buka Website" href="/" /></Card>;
    return <Card><h3 className="mb-5 text-2xl font-black">Pesanan</h3><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-[#184D47]/50"><tr>{["Invoice", "Nama", "Produk", "Status", "Total", "Detail"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[#184D47]/10"><td className="p-3 font-black">#{order.invoice || order.id.slice(0, 8)}</td><td className="p-3 font-bold">{order.customer}</td><td className="p-3">{order.items?.map((item) => `${item.name} x${item.quantity}`).join(", ") || "-"}</td><td className="p-3"><select value={order.status} onChange={(event) => void onStatus(order, event.target.value)} className="min-h-12 rounded-2xl border border-[#184D47]/15 px-3 font-bold">{statuses.map((status) => <option key={status}>{status}</option>)}</select></td><td className="p-3 font-black">{rupiah.format(order.total)}</td><td className="p-3"><button onClick={() => onDetail(order)} className="min-h-12 rounded-2xl bg-[#0F4C45] px-4 font-black text-white">Detail</button></td></tr>)}</tbody></table></div><div className="grid gap-3 lg:hidden">{orders.map((order) => <motion.article key={order.id} whileTap={{ scale: 0.98 }} className="rounded-[24px] bg-white p-4 shadow-lg shadow-[#184D47]/5"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase text-[#184D47]/50">Invoice</p><h4 className="truncate text-lg font-black">#{order.invoice || order.id.slice(0, 10)}</h4></div><span className="rounded-full bg-[#f8f0dd] px-3 py-1 text-xs font-black">{orderStatusLabel(order.status)}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><Info label="Nama" value={order.customer} /><Info label="Qty" value={String(order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0)} /><Info label="Produk" value={order.items?.map((item) => item.name).join(", ") || "-"} wide /><Info label="Total" value={rupiah.format(order.total)} /></div><select value={order.status} onChange={(event) => void onStatus(order, event.target.value)} className="mt-3 min-h-12 w-full rounded-2xl border border-[#184D47]/15 px-3 font-bold">{statuses.map((status) => <option key={status}>{status}</option>)}</select><button onClick={() => onDetail(order)} className="mt-3 min-h-12 w-full rounded-2xl bg-[#0F4C45] font-black text-white">Detail</button></motion.article>)}</div></Card>;
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


function OrderDetailModal({ order, couriers, onClose, onSave, onCreateBiteship }: { order: Order; couriers: string[]; onClose: () => void; onSave: (order: Order, courier: string, trackingNumber: string) => Promise<boolean>; onCreateBiteship: (order: Order) => Promise<boolean> }) {
    const initialCourier = order.courier && !couriers.includes(order.courier) ? order.courier : (order.courier || couriers[0] || "JNE");
    const [courier, setCourier] = useState(initialCourier);
    const [customCourier, setCustomCourier] = useState(order.courier && !couriers.includes(order.courier) ? order.courier : "");
    const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || "");
    const [saving, setSaving] = useState(false);
    const [creatingBiteship, setCreatingBiteship] = useState(false);
    const [error, setError] = useState("");

    const isShipped = String(order.status).toUpperCase() === "SHIPPED";
    const selectedCourier = courier === "Lainnya" ? customCourier : courier;

    const isPaid = String(order.paymentStatus || "").toUpperCase() === "PAID";
    const hasBiteship = Boolean(order.biteshipOrderId && !order.biteshipOrderId.startsWith("claim:"));
    const canBiteship = isPaid && Boolean(order.courierCode) && !hasBiteship;

    async function submitBiteship() {
        setError("");
        setCreatingBiteship(true);
        const ok = await onCreateBiteship(order);
        setCreatingBiteship(false);
        if (ok) onClose();
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        const trimmedTracking = trackingNumber.trim();
        const trimmedCourier = selectedCourier.trim();
        setError("");

        if (!trimmedCourier) {
            setError("Kurir wajib diisi.");
            return;
        }
        if (!trimmedTracking) {
            setError("Nomor resi wajib diisi.");
            return;
        }

        setSaving(true);
        const ok = await onSave(order, trimmedCourier, trimmedTracking);
        setSaving(false);
        if (ok) onClose();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="sticky top-0 flex items-center justify-between border-b bg-white/95 p-5 backdrop-blur">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]">Detail Pesanan</p>
                        <h3 className="text-2xl font-black">#{order.invoice || order.id.slice(0, 10)}</h3>
                    </div>
                    <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-[#184D47]/5 font-black hover:bg-[#184D47]/10"><X size={18} /></button>
                </div>
                <div className="space-y-5 p-5">
                    <section className="grid gap-3 sm:grid-cols-2">
                        <Info label="Nama Pelanggan" value={order.customer} />
                        <Info label="Nomor HP" value={order.phone} />
                        <Info label="Alamat" value={order.address || "-"} wide />
                    </section>
                    <section className="rounded-2xl bg-[#f8f6f0] p-4">
                        <p className="mb-2 text-sm font-black">Produk</p>
                        <div className="grid gap-2">
                            {order.items?.map((item) => (
                                <div key={`${item.name}-${item.productId ?? ""}`} className="flex justify-between rounded-xl bg-white p-2 text-sm">
                                    <span>{item.name} x{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex justify-between border-t border-[#184D47]/10 pt-3 font-black">
                            <span>Total</span>
                            <span>{rupiah.format(order.total)}</span>
                        </div>
                    </section>
                    <section className="grid gap-3 sm:grid-cols-2">
                        <Info label="Status Pembayaran" value={order.paymentStatus || "-"} />
                        <Info label="Status Pesanan" value={orderStatusLabel(order.status)} />
                        {isShipped && (
                            <>
                                <Info label="Kurir" value={order.courier || "-"} />
                                <Info label="Nomor Resi" value={order.trackingNumber || "-"} />
                                <Info label="Waktu Dikirim" value={order.shippedAt ? new Date(order.shippedAt).toLocaleString("id-ID") : "-"} />
                            </>
                        )}
                    </section>

                    <section className="rounded-2xl border border-[#184D47]/15 p-4">
                        <p className="mb-2 text-sm font-black">PENGIRIMAN BITESHIP</p>
                        {hasBiteship ? (
                            <div className="space-y-2 text-sm">
                                <Info label="ID Pesanan Biteship" value={order.biteshipOrderId || "-"} />
                                <Info label="Status Biteship" value={order.biteshipStatus || "-"} />
                                <Info label="Nomor Resi (AWB)" value={order.biteshipTrackingId || "-"} />
                                {order.biteshipLabelUrl && (
                                    <a href={order.biteshipLabelUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0F4C45] px-4 font-black text-white">
                                        <ExternalLink size={16} /> Buka Label
                                    </a>
                                )}
                            </div>
                        ) : isPaid && !order.courierCode ? (
                            <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
                                Kode kurir Biteship belum tersedia untuk pesanan lama ini. Gunakan pengiriman manual.
                            </p>
                        ) : (
                            <button onClick={() => void submitBiteship()} disabled={!canBiteship || creatingBiteship} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0F4C45] px-5 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60">
                                {creatingBiteship && <Loader2 className="animate-spin" size={18} />}
                                {creatingBiteship ? "Membuat..." : "Buat Pengiriman Biteship"}
                            </button>
                        )}
                    </section>

                    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[#184D47]/15 p-4">
                        <p className="text-sm font-black">PENGIRIMAN MANUAL</p>
                        <label className="block space-y-2">
                            <span className="text-sm font-bold">Kurir</span>
                            <select value={courier} onChange={(event) => setCourier(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#184D47]/15 bg-white px-4 font-bold">
                                {couriers.map((item) => <option key={item} value={item}>{item}</option>)}
                                <option value="Lainnya">Lainnya</option>
                            </select>
                        </label>
                        {courier === "Lainnya" && (
                            <label className="block space-y-2">
                                <span className="text-sm font-bold">Nama Kurir</span>
                                <input value={customCourier} onChange={(event) => setCustomCourier(event.target.value)} placeholder="Nama kurir" className="min-h-12 w-full rounded-2xl border border-[#184D47]/15 bg-white px-4" />
                            </label>
                        )}
                        <label className="block space-y-2">
                            <span className="text-sm font-bold">Nomor Resi</span>
                            <input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="Nomor resi pengiriman" className="min-h-12 w-full rounded-2xl border border-[#184D47]/15 bg-white px-4" />
                        </label>
                        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
                        <button disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#184D47] px-5 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60">
                            {saving && <Loader2 className="animate-spin" size={18} />}
                            {saving ? "Menyimpan..." : "Simpan Pengiriman"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}








