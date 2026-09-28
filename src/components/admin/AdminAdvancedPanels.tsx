"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import Swal from "sweetalert2";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Building2, CheckCircle2, CreditCard, Download, Edit3, Eye, EyeOff, FileSpreadsheet, FileText, Globe, History, Loader2, PackageMinus, PackagePlus, Printer, Save, Search, Settings2, ShieldCheck, Star, Trash2, TrendingUp, Truck, UploadCloud, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getUserFacingMessage, safeApiMessage } from "@/lib/user-facing-error";
import {
    optimizeSettingsImage,
    uploadSettingsImage,
    extractSettingsStoragePath,
    type SettingsImageProfile,
} from "@/lib/settings-image-upload-client";

type Product = { id: string; name: string; slug: string; sku?: string | null; price: number; stock: number; minimumStock?: number | null; image: string | null; category?: string | null; updatedAt?: string | null; createdAt?: string | null };
type StockHistory = { id?: string; product_id?: string; productId?: string; product_name?: string; productName?: string; type?: string; transaction_type?: string; quantity?: number; previous_stock?: number; previousStock?: number; new_stock?: number; newStock?: number; created_at?: string; createdAt?: string; note?: string | null; admin?: string | null; admin_name?: string | null; order_id?: string | null };
type OrderItem = { id?: string; orderId?: string; productId?: string | null; name: string; quantity: number; price: number; subtotal: number; product?: { categoryId?: string | null } | null };
type Order = { id: string; customer: string; total: number; status: string; createdAt: string; items?: OrderItem[] };
type SettingValue = string | boolean;
type Testimonial = { id: string; name: string; city: string; whatsapp?: string | null; message: string; rating: number; avatar?: string | null; isActive: boolean; isVerified: boolean; createdAt: string; updatedAt?: string | null };

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const pageSize = 8;
const colors = ["#0F4C45", "#D4AF37", "#0F766E", "#7C2D12", "#111827"];

function toast(title: string, icon: "success" | "error" | "info" = "success") {
    void Swal.fire({ toast: true, position: "top-end", timer: 2200, showConfirmButton: false, icon, title });
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className={`admin-advanced-card rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-xl shadow-[#184D47]/10 ${className}`}>{children}</motion.div>;
}

function exportCsv(filename: string, rows: Record<string, string | number | null | undefined>[]) {
    if (!rows.length) return toast("Tidak ada data untuk diexport", "info");
    const header = Object.keys(rows[0]);
    const body = rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

async function exportXlsx(filename: string, rows: Record<string, unknown>[]) {
    if (!rows.length) return toast("Tidak ada data untuk diexport", "info");
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "AFA STORE");
    XLSX.writeFile(workbook, filename);
}

async function exportPdf(title: string, rows: Record<string, unknown>[]) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.text(title, 14, 16);
    rows.slice(0, 30).forEach((row, index) => doc.text(Object.values(row).join(" | ").slice(0, 105), 14, 28 + index * 7));
    doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

function statusOf(stock: number, minimum = 10) {
    if (stock <= 0) return { label: "Kosong", className: "bg-black text-white" };
    if (stock <= Math.max(3, Math.floor(minimum / 2))) return { label: "Stok Menipis", className: "bg-red-100 text-red-700" };
    if (stock <= minimum) return { label: "Hampir Habis", className: "bg-yellow-100 text-yellow-700" };
    return { label: "Ready", className: "bg-emerald-100 text-emerald-700" };
}

function historyDate(item: StockHistory) {
    return item.created_at || item.createdAt || new Date().toISOString();
}

function productDate(item: Product) {
    return item.updatedAt || item.createdAt || "";
}

function historyType(item: StockHistory) {
    return (item.type || item.transaction_type || "-").toUpperCase();
}

function typeBadge(type: string) {
    if (["IN", "RETURN"].includes(type)) return "bg-emerald-100 text-emerald-700";
    if (["OUT", "SALE"].includes(type)) return "bg-red-100 text-red-700";
    return "bg-[#f8f0dd] text-[#184D47]";
}

function testimonialStatus(item: Testimonial) {
    if (item.isActive && item.isVerified) return { label: "Published", className: "bg-emerald-100 text-emerald-700" };
    if (item.isVerified) return { label: "Verified", className: "bg-blue-100 text-blue-700" };
    return { label: "Pending", className: "bg-yellow-100 text-yellow-700" };
}

export function TestimonialsPanel() {
    const [items, setItems] = useState<Testimonial[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [rating, setRating] = useState("all");
    const [status, setStatus] = useState("all");

    const load = useCallback(async () => {
        setLoading(true);
        const response = await fetch("/api/admin/testimonials", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) toast(safeApiMessage(data) || "Gagal memuat testimoni", "error");
        setItems((data.testimonials ?? []) as Testimonial[]);
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const filtered = items.filter((item) => {
        const haystack = `${item.name} ${item.city} ${item.message}`.toLowerCase();
        const itemStatus = item.isActive && item.isVerified ? "published" : item.isVerified ? "verified" : "pending";
        return haystack.includes(search.toLowerCase()) && (rating === "all" || item.rating === Number(rating)) && (status === "all" || itemStatus === status);
    });
    const stats = { total: items.length, pending: items.filter((item) => !item.isVerified).length, verified: items.filter((item) => item.isVerified).length, published: items.filter((item) => item.isActive && item.isVerified).length };

    async function mutate(payload: Record<string, unknown>, success: string) {
        const response = await fetch("/api/admin/testimonials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return toast(safeApiMessage(data) || "Aksi gagal", "error");
        toast(success);
        void load();
    }

    async function remove(item: Testimonial) {
        const confirm = await Swal.fire({ title: "Hapus testimoni?", text: `${item.name} - ${item.city}`, icon: "warning", showCancelButton: true, confirmButtonColor: "#184D47", cancelButtonText: "Batal", confirmButtonText: "Hapus" });
        if (!confirm.isConfirmed) return;
        const response = await fetch(`/api/admin/testimonials?id=${item.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return toast(safeApiMessage(data) || "Gagal menghapus", "error");
        toast("Testimoni dihapus");
        void load();
    }

    async function edit(item: Testimonial) {
        const result = await Swal.fire({ title: "Edit Testimoni", width: 720, showCancelButton: true, confirmButtonColor: "#184D47", confirmButtonText: "Simpan", cancelButtonText: "Batal", html: `<div style="display:grid;gap:10px;text-align:left"><input id="swal-name" class="swal2-input" value="${item.name.replace(/"/g, "&quot;")}" placeholder="Nama"><input id="swal-city" class="swal2-input" value="${item.city.replace(/"/g, "&quot;")}" placeholder="Kota"><input id="swal-whatsapp" class="swal2-input" value="${item.whatsapp ?? ""}" placeholder="WhatsApp"><input id="swal-rating" class="swal2-input" type="number" min="1" max="5" value="${item.rating}"><textarea id="swal-message" class="swal2-textarea" placeholder="Pesan">${item.message}</textarea></div>`, preConfirm: () => ({ name: (document.getElementById("swal-name") as HTMLInputElement).value, city: (document.getElementById("swal-city") as HTMLInputElement).value, whatsapp: (document.getElementById("swal-whatsapp") as HTMLInputElement).value, rating: Number((document.getElementById("swal-rating") as HTMLInputElement).value), message: (document.getElementById("swal-message") as HTMLTextAreaElement).value }) });
        if (!result.isConfirmed) return;
        await mutate({ id: item.id, ...result.value }, "Testimoni diperbarui");
    }

    if (loading) return <Card><Loader2 className="animate-spin" /> Memuat testimoni...</Card>;
    return <div className="space-y-5"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: "Semua", value: stats.total }, { label: "Pending", value: stats.pending }, { label: "Verified", value: stats.verified }, { label: "Published", value: stats.published }].map((item) => <Card key={item.label}><p className="text-sm font-bold text-[#184D47]/60">{item.label}</p><p className="mt-2 text-3xl font-black">{item.value}</p></Card>)}</section><Card className="bg-gradient-to-br from-white via-[#fff8ea] to-[#D4AF37]/20"><div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-[#D4AF37]">Social Proof Control</p><h3 className="text-2xl font-black">Manajemen Testimoni Pelanggan</h3></div><button onClick={() => exportCsv("testimoni-afa-store.csv", filtered.map((item) => ({ Nama: item.name, Kota: item.city, WhatsApp: item.whatsapp, Rating: item.rating, Status: testimonialStatus(item).label, Pesan: item.message })))} className="rounded-xl border px-4 py-2 font-bold"><Download size={15} className="inline" /> CSV</button></div><div className="mb-4 grid gap-3 md:grid-cols-3"><label className="flex items-center gap-2 rounded-2xl bg-white px-4 shadow-sm"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, kota, pesan" className="h-12 w-full bg-transparent outline-none" /></label><select value={rating} onChange={(e) => setRating(e.target.value)} className="h-12 rounded-2xl bg-white px-4 font-bold shadow-sm"><option value="all">Semua Rating</option>{[5, 4, 3, 2, 1].map((item) => <option key={item} value={item}>{item} Bintang</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-12 rounded-2xl bg-white px-4 font-bold shadow-sm"><option value="all">Semua Status</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="published">Published</option></select></div><div className="grid gap-4 xl:grid-cols-2">{filtered.map((item) => { const s = testimonialStatus(item); return <article key={item.id} className="rounded-[28px] border border-[#184D47]/10 bg-white p-4 shadow-lg shadow-[#184D47]/5"><div className="flex gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#0F4C45] font-black text-[#D4AF37]">{item.avatar ? <Image src={item.avatar} alt={item.name} width={64} height={64} className="h-full w-full object-cover" unoptimized /> : item.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-black">{item.name}</h4><span className={`rounded-full px-3 py-1 text-xs font-black ${s.className}`}>{s.label}</span></div><p className="text-sm font-bold text-[#184D47]/60">{item.city} {item.whatsapp ? `- ${item.whatsapp}` : ""}</p><p className="mt-1 text-[#D4AF37]">{Array.from({ length: item.rating }).map((_, i) => <Star key={i} size={15} className="inline fill-current" />)}</p></div></div><p className="mt-4 line-clamp-4 rounded-2xl bg-[#f8f0dd] p-4 font-semibold leading-relaxed text-[#184D47]/80">{item.message}</p><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5"><button onClick={() => void mutate({ id: item.id, action: "approve" }, "Testimoni disetujui")} className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-black text-white"><CheckCircle2 className="mr-1 inline" size={15} />Approve</button><button onClick={() => void mutate({ id: item.id, action: item.isActive ? "unpublish" : "publish" }, item.isActive ? "Testimoni disembunyikan" : "Testimoni dipublish")} className="rounded-2xl bg-[#0F4C45] px-3 py-3 text-sm font-black text-white">{item.isActive ? <EyeOff className="mr-1 inline" size={15} /> : <Eye className="mr-1 inline" size={15} />}{item.isActive ? "Unpublish" : "Publish"}</button><button onClick={() => void edit(item)} className="rounded-2xl bg-[#D4AF37] px-3 py-3 text-sm font-black text-[#0F4C45]"><Edit3 className="mr-1 inline" size={15} />Edit</button><button onClick={() => void mutate({ id: item.id, isVerified: false }, "Verifikasi dibatalkan")} className="rounded-2xl border px-3 py-3 text-sm font-black">Reset</button><button onClick={() => void remove(item)} className="rounded-2xl bg-red-600 px-3 py-3 text-sm font-black text-white"><Trash2 className="mr-1 inline" size={15} />Hapus</button></div></article>; })}</div>{!filtered.length && <p className="py-10 text-center font-bold text-[#184D47]/60">Testimoni tidak ditemukan.</p>}</Card></div>;
}

export function StockPanel() {
    const [products, setProducts] = useState<Product[]>([]);
    const [history, setHistory] = useState<StockHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [status, setStatus] = useState("all");
    const [page, setPage] = useState(1);

    const load = useCallback(async () => {
        const [productRes, historyRes] = await Promise.all([
            supabase.from("products").select("*").eq("isActive", true).order("createdAt", { ascending: false }),
            supabase.from("stock_history").select("*").order("created_at", { ascending: false }).limit(80),
        ]);
        if (productRes.error) {
            console.error("Stok temp fail: products load", productRes.error);
            toast(getUserFacingMessage(productRes.error, "Produk gagal dimuat. Silakan coba lagi."), "error");
        }
        if (historyRes.error) toast("Tabel stock_history belum tersedia atau belum diberi RLS policy", "info");
        setProducts((productRes.data ?? []) as Product[]);
        setHistory((historyRes.data ?? []) as StockHistory[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
        const channel = supabase.channel("afa-stock-panel").on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => void load()).on("postgres_changes", { event: "*", schema: "public", table: "stock_history" }, () => void load()).subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, [load]);

    const today = new Date().toISOString().slice(0, 10);
    const stats = useMemo(() => ({
        total: products.reduce((sum, item) => sum + Number(item.stock || 0), 0),
        inToday: history.filter((item) => historyDate(item).slice(0, 10) === today && ["IN", "RETURN"].includes(historyType(item))).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        outToday: history.filter((item) => historyDate(item).slice(0, 10) === today && ["OUT", "SALE"].includes(historyType(item))).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        low: products.filter((item) => item.stock > 0 && item.stock <= (item.minimumStock ?? 10)).length,
        empty: products.filter((item) => item.stock <= 0).length,
    }), [history, products, today]);

    const categories = Array.from(new Set(products.map((item) => item.category || "Tanpa Kategori")));
    const filtered = products.filter((item) => {
        const itemStatus = statusOf(item.stock, item.minimumStock ?? 10).label;
        const haystack = `${item.name} ${item.sku ?? ""} ${item.slug} ${item.category ?? ""}`.toLowerCase();
        return haystack.includes(search.toLowerCase()) && (category === "all" || (item.category || "Tanpa Kategori") === category) && (status === "all" || itemStatus === status);
    });
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
    const rows = filtered.map((item) => ({ SKU: item.sku || item.slug, Produk: item.name, Kategori: item.category || "-", Stok: item.stock, Minimum: item.minimumStock ?? 10, Status: statusOf(item.stock, item.minimumStock ?? 10).label }));

    async function adjustStock(product: Product, delta: number) {
        const qty = Math.abs(delta);
        const nextStock = Math.max(0, Number(product.stock || 0) + delta);
        setProducts((items) => items.map((item) => item.id === product.id ? { ...item, stock: nextStock } : item));
        const update = await supabase.from("products").update({ stock: nextStock }).eq("id", product.id);
        if (update.error) {
            console.error("Stok temp fail: update", update.error);
            return toast(getUserFacingMessage(update.error, "Stok gagal diperbarui."), "error");
        }
        const { data: auth } = await supabase.auth.getUser();
        const historyPayload = { product_id: product.id, product_name: product.name, type: delta > 0 ? "IN" : "OUT", quantity: qty, previous_stock: product.stock, new_stock: nextStock, note: delta > 0 ? "Tambah stok admin" : "Kurangi stok admin", admin: auth.user?.email || "Admin AFA STORE" };
        const insert = await supabase.from("stock_history").insert(historyPayload);
        if (insert.error) toast("Stok update berhasil, tapi riwayat gagal disimpan", "info"); else toast("Stok berhasil diperbarui");
        void load();
    }

    if (loading) return <Card><Loader2 className="animate-spin" /> Memuat stok...</Card>;
    return <div className="space-y-5"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[{ label: "Total Stok", value: stats.total }, { label: "Masuk Hari Ini", value: stats.inToday }, { label: "Keluar Hari Ini", value: stats.outToday }, { label: "Stok Menipis", value: stats.low }, { label: "Produk Habis", value: stats.empty }].map((item) => <Card key={item.label}><p className="text-sm font-bold text-[#184D47]/60">{item.label}</p><p className="mt-2 text-3xl font-black">{item.value}</p></Card>)}</section><Card><div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><h3 className="text-2xl font-black">Manajemen Stok Barang</h3><div className="flex flex-wrap gap-2"><button onClick={() => void exportXlsx("stok-afa-store.xlsx", rows)} className="rounded-xl bg-[#0F4C45] px-4 py-2 font-bold text-white"><FileSpreadsheet className="mr-2 inline" size={16} />Excel</button><button onClick={() => void exportPdf("Stok AFA STORE", rows)} className="rounded-xl bg-[#D4AF37] px-4 py-2 font-bold text-[#0F4C45]"><FileText className="mr-2 inline" size={16} />PDF</button></div></div><div className="mb-4 grid gap-3 md:grid-cols-3"><label className="flex items-center gap-2 rounded-2xl bg-[#f8f0dd] px-4"><Search size={18} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cari produk / SKU" className="h-12 w-full bg-transparent outline-none" /></label><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-12 rounded-2xl bg-[#f8f0dd] px-4 font-bold"><option value="all">Semua Kategori</option>{categories.map((item) => <option key={`category-${item}`} value={item}>{item}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-12 rounded-2xl bg-[#f8f0dd] px-4 font-bold"><option value="all">Semua Status</option>{["Ready", "Hampir Habis", "Stok Menipis", "Kosong"].map((item) => <option key={`status-${item}`} value={item}>{item}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="text-[#184D47]/60"><tr>{["Foto", "Nama Produk", "SKU", "Kategori", "Stok Saat Ini", "Minimum", "Status", "Terakhir Update", "Aksi"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{paged.map((item) => { const minimum = item.minimumStock ?? 10; const s = statusOf(item.stock, minimum); return <tr key={item.id} className="border-t border-[#184D47]/10"><td className="p-3"><Image src={item.image || "/window.svg"} alt={item.name} width={48} height={48} className="h-12 w-12 rounded-xl object-cover" unoptimized /></td><td className="p-3 font-black">{item.name}</td><td className="p-3">{item.sku || item.slug}</td><td className="p-3">{item.category || "-"}</td><td className="p-3 text-xl font-black">{item.stock}</td><td className="p-3">{minimum}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${s.className}`}>{s.label}</span></td><td className="p-3">{productDate(item) ? new Date(productDate(item)).toLocaleDateString("id-ID") : "-"}</td><td className="p-3"><div className="flex gap-2"><button onClick={() => void adjustStock(item, 1)} className="rounded-xl bg-emerald-600 p-2 text-white" title="Tambah Stok"><PackagePlus size={16} /></button><button onClick={() => void adjustStock(item, -1)} className="rounded-xl bg-red-600 p-2 text-white" title="Kurangi Stok"><PackageMinus size={16} /></button><button onClick={() => Swal.fire({ title: `Riwayat ${item.name}`, html: history.filter((h) => (h.product_id || h.productId) === item.id).slice(0, 8).map((h) => `${historyType(h)} ${h.quantity} -> ${h.new_stock ?? h.newStock}`).join("<br/>") || "Belum ada riwayat" })} className="rounded-xl bg-[#f8f0dd] p-2"><History size={16} /></button></div></td></tr>; })}</tbody></table>{!paged.length && <p className="py-10 text-center font-bold text-[#184D47]/60">Data stok tidak ditemukan.</p>}</div><div className="mt-4 flex items-center justify-between"><p className="text-sm font-bold text-[#184D47]/60">Halaman {page} dari {Math.max(1, Math.ceil(filtered.length / pageSize))}</p><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((v) => Math.max(1, v - 1))} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-40">Prev</button><button disabled={page >= Math.ceil(filtered.length / pageSize)} onClick={() => setPage((v) => v + 1)} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-40">Next</button></div></div></Card><Card><div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-[#D4AF37]">Supabase stock_history</p><h3 className="text-2xl font-black">Riwayat Transaksi Stok</h3></div><button onClick={() => exportCsv("stock-history-afa-store.csv", history.map((h) => ({ Tanggal: new Date(historyDate(h)).toLocaleString("id-ID"), Produk: h.product_name || h.productName || "-", Jenis: historyType(h), Jumlah: h.quantity, StokSebelum: h.previous_stock ?? h.previousStock, StokSesudah: h.new_stock ?? h.newStock, Catatan: h.note || "-", Admin: h.admin || h.admin_name || "-" })))} className="rounded-xl border px-4 py-2 font-bold"><Download size={15} className="inline" /> CSV</button></div><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[980px] text-left text-sm"><thead className="text-[#184D47]/60"><tr>{["Tanggal", "Nama Produk", "Jenis Transaksi", "Jumlah", "Stok Sebelum", "Stok Sesudah", "Catatan", "Admin"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{history.map((item) => { const type = historyType(item); return <tr key={item.id || `${historyDate(item)}-${item.product_id}`} className="border-t border-[#184D47]/10"><td className="p-3 font-bold">{new Date(historyDate(item)).toLocaleString("id-ID")}</td><td className="p-3 font-black">{item.product_name || item.productName || "-"}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${typeBadge(type)}`}>{type}</span></td><td className="p-3 font-black">{item.quantity ?? 0}</td><td className="p-3">{item.previous_stock ?? item.previousStock ?? "-"}</td><td className="p-3">{item.new_stock ?? item.newStock ?? "-"}</td><td className="p-3">{item.note || "-"}</td><td className="p-3">{item.admin || item.admin_name || "-"}</td></tr>; })}</tbody></table></div><div className="grid gap-3 lg:hidden">{history.map((item) => { const type = historyType(item); return <article key={item.id || `${historyDate(item)}-${item.product_id}`} className="rounded-[24px] bg-[#f8f0dd] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-[#184D47]/55">{new Date(historyDate(item)).toLocaleString("id-ID")}</p><h4 className="mt-1 font-black">{item.product_name || item.productName || "-"}</h4></div><span className={`rounded-full px-3 py-1 text-xs font-black ${typeBadge(type)}`}>{type}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-white p-2"><p className="text-xs font-bold text-[#184D47]/50">Jumlah</p><p className="font-black">{item.quantity ?? 0}</p></div><div className="rounded-2xl bg-white p-2"><p className="text-xs font-bold text-[#184D47]/50">Sebelum</p><p className="font-black">{item.previous_stock ?? item.previousStock ?? "-"}</p></div><div className="rounded-2xl bg-white p-2"><p className="text-xs font-bold text-[#184D47]/50">Sesudah</p><p className="font-black">{item.new_stock ?? item.newStock ?? "-"}</p></div></div><p className="mt-3 text-sm font-bold">{item.note || "-"}</p><p className="mt-1 text-xs font-bold text-[#184D47]/55">Admin: {item.admin || item.admin_name || "-"}</p></article>; })}</div>{!history.length && <p className="py-10 text-center font-bold text-[#184D47]/60">Belum ada riwayat stok.</p>}</Card></div>;
}


type ReportData = {
    period: string;
    revenue: {
        customer: number;
        cashier: number;
        sales: number;
        total: number;
        salesCashReceived: number;
        salesReceivable: number;
    };
    summary: {
        transactionCount: number;
        itemsSold: number;
        averageTransaction: number;
    };
    topProducts: { name: string | null; quantity: number; revenue: number }[];
    recentOrders: {
        id: string;
        invoice: string | null;
        customer: string;
        source: string;
        paymentMethod: string;
        status: string;
        total: number;
        createdAt: string;
    }[];
    chart: {
        harian: { label: string; revenue: number; count: number }[];
        mingguan: { label: string; revenue: number; count: number }[];
        bulanan: { label: string; revenue: number; count: number }[];
    };
};

const PERIODS = ["hari", "minggu", "bulan", "tahun", "semua"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
    hari: "Hari Ini",
    minggu: "7 Hari Terakhir",
    bulan: "Bulan Ini",
    tahun: "Tahun Ini",
    semua: "Semua Waktu",
};

export function ReportsPanel() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<Period>("bulan");
    const [report, setReport] = useState<ReportData | null>(null);
    const [reportLoading, setReportLoading] = useState(true);

    const loadOrders = useCallback(async () => {
        const [res, categoryRes] = await Promise.all([
            supabase.from("orders").select("*, items:order_items(*, product:products(id, name, categoryId))").order("createdAt", { ascending: false }),
            fetch("/api/categories").then((response) => response.json() as Promise<{ data?: { id: string; name: string }[] }>).catch(() => ({ data: [] }) as { data?: { id: string; name: string }[] }),
        ]);
        if (res.error) {
            console.error("Laporan gagal: orders load", res.error);
            toast(getUserFacingMessage(res.error, "Laporan gagal dimuat. Silakan coba lagi."), "error");
        }
        setOrders((res.data ?? []) as Order[]);
        setCategories(categoryRes.data ?? []);
        setLoading(false);
    }, []);

    const loadReport = useCallback(async (p: Period) => {
        setReportLoading(true);
        try {
            const res = await fetch(`/api/admin/sales/report?period=${p}`, { cache: "no-store" });
            const data = await res.json() as ReportData;
            setReport(data);
        } catch {
            setReport(null);
        } finally {
            setReportLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadOrders();
        const channel = supabase
            .channel("afa-reports-panel")
            .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void loadOrders())
            .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => void loadOrders())
            .subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, [loadOrders]);

    useEffect(() => { void loadReport(period); }, [loadReport, period]);

    const categoryNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const cat of categories) map.set(cat.id, cat.name);
        return map;
    }, [categories]);

    const items = orders.flatMap((o) => o.items ?? []);
    const bestCategories = Object.entries(
        items.reduce<Record<string, number>>((acc, item) => {
            const key = categoryNameById.get(item.product?.categoryId ?? "") ?? "Tanpa Kategori";
            acc[key] = (acc[key] ?? 0) + Number(item.quantity || 0);
            return acc;
        }, {}),
    ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

    const rev = report?.revenue ?? { customer: 0, cashier: 0, sales: 0, total: 0, salesCashReceived: 0, salesReceivable: 0 };
    const allZero = rev.customer === 0 && rev.cashier === 0 && rev.sales === 0;

    const chartData =
        period === "tahun" ? (report?.chart.bulanan ?? []) :
        period === "minggu" ? (report?.chart.mingguan ?? []) :
        (report?.chart.harian ?? []);

    const sourceData = allZero
        ? []
        : ([
            { name: "Pelanggan", value: rev.customer },
            { name: "Kasir", value: rev.cashier },
            { name: "Sales", value: rev.sales },
          ] as { name: string; value: number }[]).filter((s) => s.value > 0);

    const exportRows = (report?.recentOrders ?? []).map((o) => ({
        Invoice: o.invoice ?? o.id,
        Pembeli: o.customer,
        Total: o.total,
        Status: o.status,
        Tanggal: o.createdAt,
    }));

    const flowSources = [
        { label: "Pelanggan", value: rev.customer, color: "#0F4C45", sub: "Pesanan Online" },
        { label: "Kasir", value: rev.cashier, color: "#D4AF37", sub: "TM Â· WA Â· Marketplace" },
        { label: "Sales", value: rev.sales, color: "#0F766E", sub: "Kunjungan Selesai" },
    ];

    if (loading && reportLoading) {
        return <Card><Loader2 className="animate-spin inline mr-2" />Memuat laporan...</Card>;
    }

    return (
        <div className="space-y-5">
            {/* â”€â”€ Header + Period Selector â”€â”€ */}
            <Card className="bg-[#0F4C45] text-white">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#D4AF37]">Laporan Keuangan</p>
                        <h3 className="text-3xl font-black">Pendapatan AFA STORE</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white/70">Periode:</span>
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value as Period)}
                            className="rounded-xl bg-white/20 px-4 py-2 font-bold text-white"
                        >
                            {PERIODS.map((p) => (
                                <option key={p} value={p} className="bg-[#0F4C45] text-white">
                                    {PERIOD_LABEL[p]}
                                </option>
                            ))}
                        </select>
                        {reportLoading && <Loader2 className="animate-spin" size={18} />}
                        <button onClick={() => void exportPdf("Laporan AFA STORE", exportRows)} className="rounded-xl bg-[#D4AF37] px-3 py-2 font-bold text-[#0F4C45]">PDF</button>
                        <button onClick={() => void exportXlsx("laporan-afa-store.xlsx", exportRows)} className="rounded-xl bg-white/20 px-3 py-2 font-bold">Excel</button>
                        <button onClick={() => exportCsv("laporan-afa-store.csv", exportRows)} className="rounded-xl border border-white/30 px-3 py-2 font-bold"><Download size={15} className="inline" /> CSV</button>
                        <button onClick={() => window.print()} className="rounded-xl border border-white/30 px-3 py-2 font-bold"><Printer size={15} className="inline" /> Print</button>
                    </div>
                </div>
            </Card>

            {/* â”€â”€ ARUS PENDAPATAN â”€â”€ */}
            <section>
                <h4 className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-[#184D47]/60 dark:text-white/50">
                    Arus Pendapatan â€” {PERIOD_LABEL[period]}
                </h4>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Card>
                        <p className="text-sm font-bold text-[#184D47]/60 dark:text-white/50">Pendapatan Pelanggan</p>
                        <p className="mt-1 text-2xl font-black text-[#0F4C45] dark:text-emerald-400">{rupiah.format(rev.customer)}</p>
                        <p className="mt-1 text-xs text-[#184D47]/40 dark:text-white/30">Pesanan Online</p>
                    </Card>
                    <Card>
                        <p className="text-sm font-bold text-[#184D47]/60 dark:text-white/50">Pendapatan Kasir</p>
                        <p className="mt-1 text-2xl font-black text-[#D4AF37]">{rupiah.format(rev.cashier)}</p>
                        <p className="mt-1 text-xs text-[#184D47]/40 dark:text-white/30">Tatap Muka Â· WA Â· Marketplace</p>
                    </Card>
                    <Card>
                        <p className="text-sm font-bold text-[#184D47]/60 dark:text-white/50">Pendapatan Sales</p>
                        <p className="mt-1 text-2xl font-black text-[#0F766E] dark:text-teal-400">{rupiah.format(rev.sales)}</p>
                        <p className="mt-1 text-xs text-[#184D47]/40 dark:text-white/30">Kunjungan Sales Selesai</p>
                    </Card>
                    <Card className="bg-[#0F4C45] text-white">
                        <p className="text-sm font-bold text-white/70">Total Pendapatan</p>
                        <p className="mt-1 text-2xl font-black text-[#D4AF37]">{rupiah.format(rev.total)}</p>
                        <p className="mt-1 text-xs text-white/50">Pelanggan + Kasir + Sales</p>
                    </Card>
                </div>
            </section>

            {/* â”€â”€ Visual Flow â”€â”€ */}
            <Card>
                <h4 className="mb-4 text-lg font-black text-[#0F4C45] dark:text-emerald-400">Alur Pendapatan</h4>
                {/* Desktop row */}
                <div className="hidden xl:flex items-center gap-2 flex-wrap">
                    {flowSources.map((src, i) => (
                        <div key={src.label} className="flex items-center gap-2">
                            <div
                                className="flex min-w-[130px] flex-col items-center rounded-2xl border-2 px-5 py-4 text-center"
                                style={{ borderColor: src.color }}
                            >
                                <span className="text-xs font-black uppercase tracking-widest" style={{ color: src.color }}>{src.label}</span>
                                <span className="mt-1 text-xl font-black">{rupiah.format(src.value)}</span>
                                <span className="mt-0.5 text-[10px] text-[#184D47]/40 dark:text-white/30">{src.sub}</span>
                            </div>
                            {i < flowSources.length - 1 && (
                                <ArrowRight className="flex-shrink-0 text-[#184D47]/30 dark:text-white/20" size={22} />
                            )}
                        </div>
                    ))}
                    <ArrowRight className="flex-shrink-0 text-[#D4AF37]" size={28} />
                    <div className="flex min-w-[150px] flex-col items-center rounded-2xl bg-[#0F4C45] px-6 py-4 text-center text-white">
                        <span className="text-xs font-black uppercase tracking-widest text-[#D4AF37]">Total</span>
                        <span className="mt-1 text-2xl font-black text-[#D4AF37]">{rupiah.format(rev.total)}</span>
                    </div>
                </div>
                {/* Mobile stack */}
                <div className="flex flex-col gap-2 xl:hidden">
                    {flowSources.map((src) => (
                        <div
                            key={src.label}
                            className="flex items-center justify-between rounded-2xl border px-4 py-3"
                            style={{ borderColor: src.color }}
                        >
                            <div>
                                <span className="font-bold" style={{ color: src.color }}>{src.label}</span>
                                <span className="ml-2 text-xs text-[#184D47]/40 dark:text-white/30">{src.sub}</span>
                            </div>
                            <span className="font-black">{rupiah.format(src.value)}</span>
                        </div>
                    ))}
                    <div className="flex items-center justify-between rounded-2xl bg-[#0F4C45] px-4 py-3 text-white">
                        <span className="font-bold text-[#D4AF37]">Total Pendapatan</span>
                        <span className="font-black text-[#D4AF37]">{rupiah.format(rev.total)}</span>
                    </div>
                </div>
            </Card>

            {/* â”€â”€ Sales Settlement â”€â”€ */}
            <Card>
                <h4 className="mb-3 text-lg font-black text-[#0F4C45] dark:text-emerald-400">Settlement Penjualan Sales</h4>
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 dark:border-amber-700/30 dark:bg-amber-900/20 dark:text-amber-400">
                    âš  Setoran sales adalah pelunasan piutang â€” bukan pendapatan baru. Tidak dihitung ulang dalam Total Pendapatan.
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl bg-[#f8f0dd] px-5 py-4 dark:bg-white/10">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#184D47]/60 dark:text-white/50">Penjualan Sales</p>
                        <p className="mt-1 text-xl font-black text-[#0F766E] dark:text-teal-400">{rupiah.format(rev.sales)}</p>
                    </div>
                    <div className="rounded-2xl bg-[#f8f0dd] px-5 py-4 dark:bg-white/10">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#184D47]/60 dark:text-white/50">Setoran Diterima</p>
                        <p className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-400">{rupiah.format(rev.salesCashReceived)}</p>
                    </div>
                    <div className="rounded-2xl bg-[#f8f0dd] px-5 py-4 dark:bg-white/10">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#184D47]/60 dark:text-white/50">Sisa Piutang</p>
                        <p className={`mt-1 text-xl font-black ${rev.salesReceivable > 0 ? "text-red-600 dark:text-red-400" : "text-[#184D47] dark:text-white"}`}>
                            {rupiah.format(rev.salesReceivable)}
                        </p>
                    </div>
                </div>
                {/* Settlement mini-flow */}
                <div className="mt-3 hidden items-center gap-2 text-xs font-semibold text-[#184D47]/40 dark:text-white/30 xl:flex">
                    <span>Penjualan Sales</span>
                    <ArrowRight size={12} />
                    <span>Setoran Diterima</span>
                    <ArrowRight size={12} />
                    <span>Sisa Piutang</span>
                </div>
            </Card>

            {/* â”€â”€ Source Breakdown Chart â”€â”€ */}
            <Card>
                <h4 className="mb-4 text-lg font-black text-[#0F4C45] dark:text-emerald-400">Sumber Pendapatan</h4>
                {allZero ? (
                    <div className="flex flex-col items-center justify-center py-12 text-[#184D47]/40 dark:text-white/30">
                        <TrendingUp size={40} className="mb-2 opacity-30" />
                        <p className="font-bold">Belum ada pendapatan pada periode ini</p>
                        <p className="mt-1 text-sm">Pilih periode lain atau cek kembali setelah ada transaksi.</p>
                    </div>
                ) : (
                    <div className="grid gap-5 xl:grid-cols-2">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={sourceData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={90}
                                        label={({ name, percent }) =>
                                            `${String(name)} ${(Number(percent ?? 0) * 100).toFixed(0)}%`
                                        }
                                    >
                                        {sourceData.map((_, i) => (
                                            <Cell key={i} fill={colors[i % colors.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v) => rupiah.format(Number(v))} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-col justify-center gap-3">
                            {sourceData.map((src, i) => (
                                <div key={src.name} className="flex items-center justify-between rounded-2xl bg-[#f8f0dd] px-4 py-3 dark:bg-white/10">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full" style={{ background: colors[i % colors.length] }} />
                                        <span className="font-bold">{src.name}</span>
                                    </div>
                                    <span className="font-black">{rupiah.format(src.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* â”€â”€ Tren Volume Pesanan â”€â”€ */}
            <Card>
                <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h3 className="text-2xl font-black">Tren Volume Pesanan</h3>
                    <p className="text-sm text-[#184D47]/50 dark:text-white/40">Jumlah pesanan per periode (semua status)</p>
                </div>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData.length ? chartData : [{ label: "â€”", count: 0, revenue: 0 }]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" />
                            <YAxis allowDecimals={false} />
                            <Tooltip formatter={(v) => [`${String(v)} pesanan`, "Volume"]} />
                            <Area dataKey="count" stroke="#0F4C45" fill="#0F766E" fillOpacity={0.25} name="Pesanan" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* â”€â”€ Produk & Kategori Terlaris â”€â”€ */}
            <div className="grid gap-5 xl:grid-cols-2">
                <Card>
                    <h4 className="mb-4 text-lg font-black">Produk Terlaris</h4>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={(report?.topProducts ?? []).slice(0, 6).map((p) => ({ ...p, name: p.name ?? "â€”" }))}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="quantity" fill="#0F4C45" name="Terjual" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
                <Card>
                    <h4 className="mb-4 text-lg font-black">Kategori Terlaris</h4>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={bestCategories}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#D4AF37" name="Terjual" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* â”€â”€ Pesanan Terbaru â”€â”€ */}
            <Card>
                <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h3 className="text-2xl font-black">Pesanan Terbaru</h3>
                    <p className="text-sm text-[#184D47]/50 dark:text-white/40">50 pesanan terakhir â€” gunakan export untuk laporan lengkap</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left font-bold text-[#184D47]/60 dark:text-white/50">
                                <th className="py-2 pr-4">Invoice</th>
                                <th className="py-2 pr-4">Pembeli</th>
                                <th className="py-2 pr-4">Sumber</th>
                                <th className="py-2 pr-4">Pembayaran</th>
                                <th className="py-2 pr-4">Status</th>
                                <th className="py-2">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(report?.recentOrders ?? []).map((o) => (
                                <tr key={o.id} className="border-b last:border-0 transition-colors hover:bg-[#f8f0dd]/50 dark:hover:bg-white/5">
                                    <td className="py-2 pr-4 font-mono text-xs">{o.invoice ?? o.id.slice(0, 8)}</td>
                                    <td className="py-2 pr-4 font-bold">{o.customer}</td>
                                    <td className="py-2 pr-4 text-[#184D47]/60 dark:text-white/50">{o.source}</td>
                                    <td className="py-2 pr-4 text-[#184D47]/60 dark:text-white/50">{o.paymentMethod}</td>
                                    <td className="py-2 pr-4">
                                        <span
                                            className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
                                                o.status.toUpperCase().includes("COMPLET") || o.status === "Selesai"
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : o.status.toUpperCase().includes("CANCEL")
                                                    ? "bg-red-100 text-red-700"
                                                    : "bg-yellow-100 text-yellow-700"
                                            }`}
                                        >
                                            {o.status}
                                        </span>
                                    </td>
                                    <td className="py-2 font-black">{rupiah.format(Number(o.total))}</td>
                                </tr>
                            ))}
                            {!(report?.recentOrders?.length) && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-[#184D47]/40 dark:text-white/30">
                                        Tidak ada pesanan pada periode ini
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

const settingSchema = z.record(z.string(), z.union([z.string(), z.boolean()]));
const defaultSettings: Record<string, SettingValue> = { storeName: "AFA STORE", logo: "", favicon: "", address: "", whatsapp: "", email: "", instagram: "", facebook: "", tiktok: "", maps: "", shippingEnabled: true, couriers: "JNE, J&T, SiCepat", defaultWeight: "1000", freeShipping: false, qris: true, bankTransfer: true, cod: false, virtualAccount: false, accountNumber: "", bankName: "", websiteTitle: "AFA STORE", metaDescription: "", seoKeywords: "", homeBanner: "", footerLogo: "", themeColor: "#0F4C45", darkMode: false, twoFA: false, session: "30 hari" };


// ── Module-level constants (placed before SettingsPanel) ──────────────────────

const STG_FIELD_CFG: Record<string, { label: string; wide?: boolean; textarea?: boolean; hint?: string; image?: boolean; profile?: SettingsImageProfile }> = {
    storeName:       { label: "Nama Toko" },
    logo:            { label: "Logo Toko", image: true, profile: "logo" },
    favicon:         { label: "Favicon", image: true, profile: "favicon" },
    address:         { label: "Alamat", wide: true, textarea: true },
    whatsapp:        { label: "WhatsApp" },
    email:           { label: "Email" },
    instagram:       { label: "Instagram" },
    facebook:        { label: "Facebook" },
    tiktok:          { label: "TikTok" },
    maps:            { label: "Google Maps URL", wide: true },
    shippingEnabled: { label: "Aktifkan Pengiriman" },
    couriers:        { label: "Kurir", hint: "Pisahkan dengan koma (contoh: JNE, J&T, SiCepat)" },
    defaultWeight:   { label: "Berat Default (gram)" },
    freeShipping:    { label: "Gratis Ongkir" },
    qris:            { label: "QRIS" },
    bankTransfer:    { label: "Transfer Bank" },
    cod:             { label: "COD" },
    virtualAccount:  { label: "Virtual Account" },
    accountNumber:   { label: "Nomor Rekening", wide: true },
    bankName:        { label: "Nama Bank" },
    websiteTitle:    { label: "Judul Website", wide: true },
    metaDescription: { label: "Meta Description", wide: true, textarea: true },
    seoKeywords:     { label: "Kata Kunci SEO", wide: true },
    homeBanner:      { label: "Banner Utama", wide: true, image: true, profile: "banner" },
    footerLogo:      { label: "Logo Footer", image: true, profile: "footer-logo" },
    themeColor:      { label: "Warna Tema" },
    darkMode:        { label: "Dark Mode" },
    twoFA:           { label: "2FA (Verifikasi Dua Langkah)" },
    session:         { label: "Durasi Sesi" },
};

const STG_SECTIONS: Array<{ id: string; title: string; icon: LucideIcon; keys: string[] }> = [
    { id: "informasi",  title: "Informasi Toko", icon: Building2,   keys: ["storeName","logo","favicon","address","whatsapp","email","instagram","facebook","tiktok","maps"] },
    { id: "pengiriman", title: "Pengiriman",      icon: Truck,       keys: ["shippingEnabled","couriers","defaultWeight","freeShipping"] },
    { id: "pembayaran", title: "Pembayaran",      icon: CreditCard,  keys: ["qris","bankTransfer","cod","virtualAccount","accountNumber","bankName"] },
    { id: "website",    title: "Website",          icon: Globe,       keys: ["websiteTitle","metaDescription","seoKeywords","homeBanner","footerLogo","themeColor","darkMode"] },
    { id: "keamanan",   title: "Keamanan",         icon: ShieldCheck, keys: ["twoFA","session"] },
    { id: "admin",      title: "Admin",             icon: Users,       keys: [] },
    { id: "backup",     title: "Backup",            icon: UploadCloud, keys: [] },
];

// ── Security action labels (preserved from original) ──────────────────────────
const STG_SECURITY_ACTIONS = ["Ganti Password", "2FA", "Logout Semua Device", "Session"];

// ── Backup action items (preserved from original) ─────────────────────────────
const STG_BACKUP_ACTIONS = [
    { label: "Backup Database",  desc: "Buat snapshot data toko saat ini" },
    { label: "Restore Database", desc: "Pulihkan data dari backup" },
    { label: "Download Backup",  desc: "Unduh file backup ke perangkat" },
];

// ── SettingsImageUploader ────────────────────────────────────────────────────
// A self-contained image uploader for settings fields.
// Uses the browser Canvas optimizer + the admin settings image API.
// No service-role key / supabase-admin required on the client.
type SettingsImageUploaderProps = {
    label: string;
    value: string;
    profile: SettingsImageProfile;
    wide?: boolean;
    onChange: (url: string, path: string) => void;
    onRemove: () => void;
};
function SettingsImageUploader({ label, value, profile, wide, onChange, onRemove }: SettingsImageUploaderProps) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!uploading) setPreview(value || null);
    }, [value, uploading]);
    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setUploadError(null);
        setUploading(true);
        try {
            const { blob, previewUrl } = await optimizeSettingsImage(file, profile);
            setPreview(previewUrl);
            const { url, path } = await uploadSettingsImage(blob, profile);
            URL.revokeObjectURL(previewUrl);
            onChange(url, path);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : "Upload gagal.");
            setPreview(value || null);
        } finally {
            setUploading(false);
        }
    }
    const hasImage = Boolean(preview);
    return (
        <div className={`stg-field flex flex-col gap-1.5${wide ? " stg-field-wide" : ""}`}>
            <span className="stg-field-label text-[11px] font-bold uppercase tracking-[0.18em] text-[#184D47]/60">{label}</span>
            <div className="relative flex items-center gap-3">
                {hasImage ? (
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border border-[#184D47]/15 bg-[#f5f5f5]">
                        <Image src={preview!} alt={label} fill unoptimized className="object-contain" sizes="64px" />
                        {uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                                <Loader2 size={20} className="animate-spin text-[#0F4C45]" />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[12px] border-2 border-dashed border-[#184D47]/20 bg-[#f8f0dd]">
                        {uploading
                            ? <Loader2 size={20} className="animate-spin text-[#0F4C45]" />
                            : <UploadCloud size={20} className="text-[#184D47]/40" />}
                    </div>
                )}
                <div className="flex flex-col gap-1.5">
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-[10px] bg-[#0F4C45] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                    >
                        <UploadCloud size={13} />
                        {uploading ? "Mengunggah..." : hasImage ? "Ganti" : "Unggah"}
                    </button>
                    {hasImage && !uploading && (
                        <button
                            type="button"
                            onClick={onRemove}
                            className="flex items-center gap-1 rounded-[10px] border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50"
                        >
                            Hapus
                        </button>
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label={`Unggah ${label}`}
                    onChange={(e) => void handleFileChange(e)}
                />
            </div>
            {uploadError && <span className="text-xs font-semibold text-red-600" role="alert">{uploadError}</span>}
        </div>
    );
}

export function SettingsPanel() {
    // ─────────────────────────────────────────────────────────────────────────
    // ── State ─────────────────────────────────────────────────────────────────
    const [values, setValues] = useState<Record<string, SettingValue>>(defaultSettings);
    const [admins, setAdmins] = useState<{ id: string; name?: string; email?: string; role?: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [activeSection, setActiveSection] = useState("informasi");
    const pendingDeletesRef = useRef<string[]>([]);

    // ── Load (UNCHANGED) ───────────────────────────────────────────────────────
    const load = useCallback(async () => {
        const [settingsRes, adminRes] = await Promise.all([
            supabase.from("settings").select("*"),
            supabase.from("users").select("id,name,email,role").in("role", ["Owner","Administrator","Operator","Viewer","admin"]),
        ]);
        const mapped = Object.fromEntries(
            (settingsRes.data ?? []).map((s: { key: string; value: unknown }) => {
                const raw = typeof s.value === "object" && s.value && "value" in s.value
                    ? (s.value as { value: unknown }).value
                    : s.value;
                return [s.key, typeof raw === "boolean" ? raw : String(raw ?? "")];
            })
        ) as Record<string, SettingValue>;
        setValues({ ...defaultSettings, ...mapped });
        setAdmins((adminRes.data ?? []) as { id: string; name?: string; email?: string; role?: string }[]);
    }, []);

    // ── Realtime subscription (UNCHANGED) ─────────────────────────────────────
    useEffect(() => {
        void load();
        const channel = supabase
            .channel("afa-settings-panel")
            .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => void load())
            .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => void load())
            .subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, [load]);

    // ── setValue (UNCHANGED + dirty tracking) ─────────────────────────────────
    function setValue(key: string, value: string | boolean) {
        setValues((v) => ({ ...v, [key]: value }));
        setDirty(true);
    }

    // ── Save — uses server-side PATCH /api/admin/settings (service-role write) ──
    async function save(event: FormEvent) {
        event.preventDefault();
        const parsed = settingSchema.safeParse(values);
        if (!parsed.success) return toast("Pengaturan tidak valid", "error");
        setSaving(true);
        try {
            const res = await fetch("/api/admin/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            setSaving(false);
            if (!res.ok) {
                let errMsg = "Pengaturan gagal disimpan. Silakan coba lagi.";
                try {
                    const data = await res.json() as { error?: string };
                    if (typeof data.error === "string" && data.error) errMsg = data.error;
                } catch { /* ignore parse error */ }
                console.error("[admin-settings-save]", { status: res.status });
                return toast(errMsg, "error");
            }
            setDirty(false);
            toast("Pengaturan tersimpan");
            void revalidatePublicCache();
            void flushPendingDeletes();
        } catch (err) {
            setSaving(false);
            return toast(getUserFacingMessage(err, "Gagal menyimpan pengaturan toko."), "error");
        }
    }
    // ── Post-save side effects ────────────────────────────────────────────────
    async function revalidatePublicCache(): Promise<void> {
        try {
            await fetch("/api/admin/settings/revalidate", { method: "POST" });
        } catch {
            // silently ignore \u2014 revalidation is best-effort
        }
    }
    // ── Flush old image files from storage ───────────────────────────────────
    async function flushPendingDeletes() {
        const paths = pendingDeletesRef.current.slice();
        pendingDeletesRef.current = [];
        await Promise.allSettled(
            paths.map((path) =>
                fetch("/api/admin/settings/image", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path }),
                }).catch(() => undefined)
            )
        );
    }

    // ── Admin action (UNCHANGED) ───────────────────────────────────────────────
    async function adminAction(action: string) {
        toast(`${action} admin siap dihubungkan ke tabel profiles/users`, "info");
    }

    // ── Derived ────────────────────────────────────────────────────────────────
    const currentSection = STG_SECTIONS.find((s) => s.id === activeSection) ?? STG_SECTIONS[0];
    const SectionIcon = currentSection.icon;

    // ── Field renderer ─────────────────────────────────────────────────────────
    function renderField(key: string) {
        const cfg = STG_FIELD_CFG[key];
        if (!cfg) return null;
        const isBoolean = typeof values[key] === "boolean";

        if (cfg.image && cfg.profile) {
            const currentUrl = String(values[key] ?? "");
            return (
                <SettingsImageUploader
                    key={key}
                    label={cfg.label}
                    value={currentUrl}
                    profile={cfg.profile}
                    wide={cfg.wide}
                    onChange={(url, _path) => {
                        // Queue old path for deletion after save
                        const oldPath = extractSettingsStoragePath(currentUrl);
                        if (oldPath) pendingDeletesRef.current.push(oldPath);
                        setValue(key, url);
                    }}
                    onRemove={() => {
                        const oldPath = extractSettingsStoragePath(currentUrl);
                        if (oldPath) pendingDeletesRef.current.push(oldPath);
                        setValue(key, "");
                    }}
                />
            );
        }

        if (isBoolean) {
            return (
                <label key={key} className={`stg-toggle-row flex items-center justify-between gap-4 rounded-[13px] bg-[#f8f0dd] px-4 py-3${cfg.wide ? " stg-field-wide" : ""}`}>
                    <div className="min-w-0">
                        <p className="font-bold text-[#184D47]">{cfg.label}</p>
                        {cfg.hint && <p className="mt-0.5 text-xs text-[#184D47]/60">{cfg.hint}</p>}
                    </div>
                    <input
                        type="checkbox"
                        checked={Boolean(values[key])}
                        onChange={(e) => setValue(key, e.target.checked)}
                        className="stg-checkbox h-5 w-5 shrink-0 cursor-pointer rounded accent-[#0F4C45]"
                        aria-label={cfg.label}
                    />
                </label>
            );
        }

        if (cfg.textarea) {
            return (
                <label key={key} className="stg-field stg-field-wide flex flex-col gap-1.5">
                    <span className="stg-field-label text-[11px] font-bold uppercase tracking-[0.18em] text-[#184D47]/60">{cfg.label}</span>
                    <textarea
                        rows={3}
                        value={String(values[key] ?? "")}
                        onChange={(e) => setValue(key, e.target.value)}
                        className="stg-input stg-textarea w-full rounded-[13px] border border-[#184D47]/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                        aria-label={cfg.label}
                    />
                    {cfg.hint && <span className="stg-field-hint text-xs text-[#184D47]/55">{cfg.hint}</span>}
                </label>
            );
        }

        return (
            <label key={key} className={`stg-field flex flex-col gap-1.5${cfg.wide ? " stg-field-wide" : ""}`}>
                <span className="stg-field-label text-[11px] font-bold uppercase tracking-[0.18em] text-[#184D47]/60">{cfg.label}</span>
                <input
                    value={String(values[key] ?? "")}
                    onChange={(e) => setValue(key, e.target.value)}
                    className="stg-input h-11 w-full rounded-[13px] border border-[#184D47]/15 bg-white px-4 text-sm outline-none transition focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                    aria-label={cfg.label}
                />
                {cfg.hint && <span className="stg-field-hint text-xs text-[#184D47]/55">{cfg.hint}</span>}
            </label>
        );
    }

    // ── JSX ────────────────────────────────────────────────────────────────────
    return (
        <form onSubmit={save} className="stg-root flex flex-col gap-4" data-testid="settings-panel">

            {/* ── Compact header ── */}
            <div className="stg-header flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-xl font-black text-[#184D47] lg:text-2xl">Pengaturan</h3>
                    <p className="mt-0.5 text-sm text-[#184D47]/65">Kelola konfigurasi toko, pembayaran, pengiriman, dan keamanan.</p>
                </div>
                <div className="flex items-center gap-3">
                    {dirty && (
                        <span className="stg-dirty hidden items-center gap-1.5 text-xs font-bold text-amber-600 sm:flex" aria-live="polite">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                            Belum disimpan
                        </span>
                    )}
                    <button
                        disabled={saving}
                        className="stg-save-btn flex items-center gap-2 rounded-[13px] bg-[#D4AF37] px-5 py-2.5 font-black text-[#0F4C45] shadow-md transition hover:brightness-105 active:scale-[0.97] disabled:opacity-60"
                    >
                        <Save size={16} aria-hidden="true" />
                        {saving ? "Menyimpan..." : "Simpan Perubahan"}
                    </button>
                </div>
            </div>

            {/* ── Mobile section tabs (≤1023px) ── */}
            <div className="stg-mobile-tabs lg:hidden" role="tablist" aria-label="Kategori pengaturan">
                <div className="stg-tabs-strip flex gap-2 overflow-x-auto pb-1">
                    {STG_SECTIONS.map((sec) => {
                        const active = activeSection === sec.id;
                        return (
                            <button
                                type="button"
                                key={sec.id}
                                role="tab"
                                aria-selected={active}
                                onClick={() => setActiveSection(sec.id)}
                                className={`stg-tab shrink-0 whitespace-nowrap rounded-[11px] px-4 py-2.5 text-[13px] font-bold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-[#D4AF37] focus-visible:outline-offset-2 ${active ? "bg-[#0F4C45] text-white shadow-md" : "bg-white/80 text-[#184D47]/70 hover:bg-white"}`}
                            >
                                {sec.title}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Desktop nav + workspace / Mobile active panel ── */}
            <div className="stg-workspace flex min-h-0 gap-5">

                {/* Desktop left navigation */}
                <nav
                    className="stg-nav hidden shrink-0 flex-col gap-1 lg:flex"
                    aria-label="Navigasi pengaturan"
                    style={{ width: "180px" }}
                >
                    {STG_SECTIONS.map((sec) => {
                        const NavIcon = sec.icon;
                        const active = activeSection === sec.id;
                        return (
                            <button
                                type="button"
                                key={sec.id}
                                aria-current={active ? "true" : undefined}
                                onClick={() => setActiveSection(sec.id)}
                                className={`stg-nav-item flex min-h-11 w-full items-center gap-3 rounded-[13px] px-4 py-2.5 text-left text-[14px] font-bold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#D4AF37] focus-visible:outline-offset-2 ${active ? "stg-nav-active bg-[#0F4C45] text-white shadow-lg" : "text-[#184D47]/75 hover:bg-[#0F4C45]/8 hover:text-[#184D47]"}`}
                            >
                                <NavIcon size={18} className="shrink-0" aria-hidden="true" />
                                <span className="truncate">{sec.title}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* ── Workspace panel ── */}
                <div className="admin-advanced-card stg-panel min-w-0 flex-1 rounded-[20px] border border-white/70 bg-white/90 p-5 shadow-xl shadow-[#184D47]/10">

                    {/* Panel heading */}
                    <div className="stg-panel-head mb-4 flex items-center gap-2.5 border-b border-[#184D47]/8 pb-3.5">
                        <SectionIcon size={20} className="shrink-0 text-[#0F4C45]" aria-hidden="true" />
                        <h4 className="text-lg font-black text-[#184D47]">{currentSection.title}</h4>
                    </div>

                    {/* ── Standard field sections ── */}
                    {!["keamanan", "admin", "backup"].includes(activeSection) && (
                        <div className="stg-field-grid" data-section={activeSection}>
                            {currentSection.keys.map((key) => renderField(key))}
                        </div>
                    )}

                    {/* ── Keamanan section ── */}
                    {activeSection === "keamanan" && (
                        <div className="stg-field-grid" data-section="keamanan">
                            {currentSection.keys.map((key) => renderField(key))}
                            <div className="stg-field-wide mt-2">
                                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#184D47]/60">Aksi Keamanan</p>
                                <div className="flex flex-col gap-2">
                                    {STG_SECURITY_ACTIONS.map((a) => (
                                        <button
                                            type="button"
                                            key={a}
                                            onClick={() => toast(`${a} diproses melalui auth Supabase`, "info")}
                                            className="stg-security-btn flex min-h-11 items-center justify-between rounded-[13px] bg-[#f8f0dd] px-4 py-3 text-left font-bold text-[#184D47] transition hover:bg-[#edf7f2] active:scale-[0.98]"
                                        >
                                            <span className="flex items-center gap-3">
                                                <ShieldCheck size={17} aria-hidden="true" />
                                                {a}
                                            </span>
                                            <ArrowRight size={16} className="opacity-50" aria-hidden="true" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Admin section ── */}
                    {activeSection === "admin" && (
                        <div className="stg-admin-panel flex flex-col gap-4" data-section="admin">
                            <div className="flex flex-wrap gap-2">
                                {["Tambah", "Edit", "Hapus"].map((a) => (
                                    <button
                                        type="button"
                                        key={a}
                                        onClick={() => void adminAction(a)}
                                        className="rounded-[12px] bg-[#0F4C45] px-4 py-2.5 font-bold text-white transition active:scale-95"
                                    >
                                        {a} Admin
                                    </button>
                                ))}
                            </div>
                            <select
                                className="stg-input h-11 w-full max-w-xs rounded-[13px] border border-[#184D47]/15 bg-white px-4 text-sm font-bold outline-none"
                                aria-label="Filter role admin"
                            >
                                {["Owner", "Administrator", "Operator", "Viewer"].map((r) => (
                                    <option key={r}>{r}</option>
                                ))}
                            </select>
                            {admins.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                    {admins.map((a) => (
                                        <div key={a.id} className="flex items-center gap-3 rounded-[13px] border border-[#184D47]/10 bg-white px-4 py-3">
                                            <div
                                                className="stg-admin-avatar grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0F4C45] text-sm font-black text-[#D4AF37]"
                                                aria-hidden="true"
                                            >
                                                {(a.name ?? a.email ?? "A").slice(0, 1).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-bold text-[#184D47]">{a.name ?? a.email}</p>
                                                <p className="truncate text-xs text-[#184D47]/60">{a.email}</p>
                                            </div>
                                            <span className="shrink-0 rounded-full bg-[#f8f0dd] px-3 py-1 text-xs font-black text-[#184D47]">
                                                {a.role}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm font-bold text-[#184D47]/60">Belum ada data admin/profiles.</p>
                            )}
                        </div>
                    )}

                    {/* ── Backup section ── */}
                    {activeSection === "backup" && (
                        <div className="flex flex-col gap-3" data-section="backup">
                            {STG_BACKUP_ACTIONS.map((item) => (
                                <button
                                    type="button"
                                    key={item.label}
                                    onClick={() => toast(`${item.label} membutuhkan service role/server action`, "info")}
                                    className="flex min-h-14 items-center justify-between rounded-[13px] bg-[#f8f0dd] px-4 py-4 text-left transition hover:bg-[#edf7f2] active:scale-[0.98]"
                                >
                                    <div>
                                        <p className="font-bold text-[#184D47]">{item.label}</p>
                                        <p className="text-xs text-[#184D47]/60">{item.desc}</p>
                                    </div>
                                    <ArrowRight size={18} className="shrink-0 text-[#184D47]/50" aria-hidden="true" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Mobile bottom save bar (≤1023px) ── */}
            <div className="stg-mobile-save mt-1 flex items-center justify-between gap-3 rounded-[16px] border border-[#184D47]/10 bg-white/90 px-4 py-3 shadow-lg backdrop-blur lg:hidden">
                {dirty ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600" aria-live="polite">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                        Belum disimpan
                    </span>
                ) : (
                    <span className="text-xs text-[#184D47]/50">Simpan setelah mengubah pengaturan</span>
                )}
                <button
                    disabled={saving}
                    className="stg-save-btn flex shrink-0 items-center gap-2 rounded-[13px] bg-[#D4AF37] px-5 py-2.5 font-black text-[#0F4C45] shadow-md transition active:scale-[0.97] disabled:opacity-60"
                >
                    <Save size={16} aria-hidden="true" />
                    {saving ? "Menyimpan..." : "Simpan"}
                </button>
            </div>
        </form>
    );
}
