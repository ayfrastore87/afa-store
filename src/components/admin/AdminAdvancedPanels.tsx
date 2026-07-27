"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import Swal from "sweetalert2";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, Download, Edit3, Eye, EyeOff, FileSpreadsheet, FileText, History, Loader2, PackageMinus, PackagePlus, Printer, Save, Search, Settings2, ShieldCheck, Star, Trash2, UploadCloud } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

type Product = { id: string; name: string; slug: string; price: number; stock: number; image: string | null; category?: string | null; categoryId?: string | null; updatedAt?: string | null; createdAt?: string | null };
type StockHistory = { id?: string; product_id?: string; productId?: string; product_name?: string; productName?: string; type?: string; transaction_type?: string; quantity?: number; previous_stock?: number; previousStock?: number; new_stock?: number; newStock?: number; created_at?: string; createdAt?: string; note?: string | null; admin?: string | null; admin_name?: string | null; order_id?: string | null };
type OrderItem = { id?: string; orderId?: string; productId?: string | null; name: string; quantity: number; price: number; subtotal: number; product?: { category?: { name?: string } | null } | null };
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
    return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className={`rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-xl shadow-[#184D47]/10 ${className}`}>{children}</motion.div>;
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
        if (!response.ok) toast(data.message || "Gagal memuat testimoni", "error");
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
        if (!response.ok) return toast(data.message || "Aksi gagal", "error");
        toast(success);
        void load();
    }

    async function remove(item: Testimonial) {
        const confirm = await Swal.fire({ title: "Hapus testimoni?", text: `${item.name} - ${item.city}`, icon: "warning", showCancelButton: true, confirmButtonColor: "#184D47", cancelButtonText: "Batal", confirmButtonText: "Hapus" });
        if (!confirm.isConfirmed) return;
        const response = await fetch(`/api/admin/testimonials?id=${item.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return toast(data.message || "Gagal menghapus", "error");
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
            supabase.from("products").select("*").order("createdAt", { ascending: false }),
            supabase.from("stock_history").select("*").order("created_at", { ascending: false }).limit(80),
        ]);
        if (productRes.error) toast(productRes.error.message, "error");
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
        low: products.filter((item) => item.stock > 0 && item.stock <= 10).length,
        empty: products.filter((item) => item.stock <= 0).length,
    }), [history, products, today]);

    const categories = Array.from(new Set(products.map((item) => item.category || item.categoryId || "Tanpa Kategori")));
    const filtered = products.filter((item) => {
        const itemStatus = statusOf(item.stock).label;
        return item.name.toLowerCase().includes(search.toLowerCase()) && (category === "all" || (item.category || item.categoryId || "Tanpa Kategori") === category) && (status === "all" || itemStatus === status);
    });
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
    const rows = filtered.map((item) => ({ SKU: item.slug, Produk: item.name, Kategori: item.category || item.categoryId || "-", Stok: item.stock, Minimum: 10, Status: statusOf(item.stock).label }));

    async function adjustStock(product: Product, delta: number) {
        const qty = Math.abs(delta);
        const nextStock = Math.max(0, Number(product.stock || 0) + delta);
        setProducts((items) => items.map((item) => item.id === product.id ? { ...item, stock: nextStock } : item));
        const update = await supabase.from("products").update({ stock: nextStock }).eq("id", product.id);
        if (update.error) return toast(update.error.message, "error");
        const { data: auth } = await supabase.auth.getUser();
        const historyPayload = { product_id: product.id, product_name: product.name, type: delta > 0 ? "IN" : "OUT", quantity: qty, previous_stock: product.stock, new_stock: nextStock, note: delta > 0 ? "Tambah stok admin" : "Kurangi stok admin", admin: auth.user?.email || "Admin AFA STORE" };
        const insert = await supabase.from("stock_history").insert(historyPayload);
        if (insert.error) toast("Stok update berhasil, tapi riwayat gagal disimpan", "info"); else toast("Stok berhasil diperbarui");
        void load();
    }

    if (loading) return <Card><Loader2 className="animate-spin" /> Memuat stok...</Card>;
    return <div className="space-y-5"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[{ label: "Total Stok", value: stats.total }, { label: "Masuk Hari Ini", value: stats.inToday }, { label: "Keluar Hari Ini", value: stats.outToday }, { label: "Stok Menipis", value: stats.low }, { label: "Produk Habis", value: stats.empty }].map((item) => <Card key={item.label}><p className="text-sm font-bold text-[#184D47]/60">{item.label}</p><p className="mt-2 text-3xl font-black">{item.value}</p></Card>)}</section><Card><div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><h3 className="text-2xl font-black">Manajemen Stok Barang</h3><div className="flex flex-wrap gap-2"><button onClick={() => void exportXlsx("stok-afa-store.xlsx", rows)} className="rounded-xl bg-[#0F4C45] px-4 py-2 font-bold text-white"><FileSpreadsheet className="mr-2 inline" size={16} />Excel</button><button onClick={() => void exportPdf("Stok AFA STORE", rows)} className="rounded-xl bg-[#D4AF37] px-4 py-2 font-bold text-[#0F4C45]"><FileText className="mr-2 inline" size={16} />PDF</button></div></div><div className="mb-4 grid gap-3 md:grid-cols-3"><label className="flex items-center gap-2 rounded-2xl bg-[#f8f0dd] px-4"><Search size={18} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cari produk / SKU" className="h-12 w-full bg-transparent outline-none" /></label><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-12 rounded-2xl bg-[#f8f0dd] px-4 font-bold"><option value="all">Semua Kategori</option>{categories.map((item) => <option key={`category-${item}`} value={item}>{item}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-12 rounded-2xl bg-[#f8f0dd] px-4 font-bold"><option value="all">Semua Status</option>{["Ready", "Hampir Habis", "Stok Menipis", "Kosong"].map((item) => <option key={`status-${item}`} value={item}>{item}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="text-[#184D47]/60"><tr>{["Foto", "Nama Produk", "SKU", "Kategori", "Stok Saat Ini", "Minimum", "Status", "Terakhir Update", "Aksi"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{paged.map((item) => { const s = statusOf(item.stock); return <tr key={item.id} className="border-t border-[#184D47]/10"><td className="p-3"><Image src={item.image || "/window.svg"} alt={item.name} width={48} height={48} className="h-12 w-12 rounded-xl object-cover" unoptimized /></td><td className="p-3 font-black">{item.name}</td><td className="p-3">{item.slug}</td><td className="p-3">{item.category || item.categoryId || "-"}</td><td className="p-3 text-xl font-black">{item.stock}</td><td className="p-3">10</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${s.className}`}>{s.label}</span></td><td className="p-3">{productDate(item) ? new Date(productDate(item)).toLocaleDateString("id-ID") : "-"}</td><td className="p-3"><div className="flex gap-2"><button onClick={() => void adjustStock(item, 1)} className="rounded-xl bg-emerald-600 p-2 text-white" title="Tambah Stok"><PackagePlus size={16} /></button><button onClick={() => void adjustStock(item, -1)} className="rounded-xl bg-red-600 p-2 text-white" title="Kurangi Stok"><PackageMinus size={16} /></button><button onClick={() => Swal.fire({ title: `Riwayat ${item.name}`, html: history.filter((h) => (h.product_id || h.productId) === item.id).slice(0, 8).map((h) => `${historyType(h)} ${h.quantity} -> ${h.new_stock ?? h.newStock}`).join("<br/>") || "Belum ada riwayat" })} className="rounded-xl bg-[#f8f0dd] p-2"><History size={16} /></button></div></td></tr>; })}</tbody></table>{!paged.length && <p className="py-10 text-center font-bold text-[#184D47]/60">Data stok tidak ditemukan.</p>}</div><div className="mt-4 flex items-center justify-between"><p className="text-sm font-bold text-[#184D47]/60">Halaman {page} dari {Math.max(1, Math.ceil(filtered.length / pageSize))}</p><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((v) => Math.max(1, v - 1))} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-40">Prev</button><button disabled={page >= Math.ceil(filtered.length / pageSize)} onClick={() => setPage((v) => v + 1)} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-40">Next</button></div></div></Card><Card><div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-[#D4AF37]">Supabase stock_history</p><h3 className="text-2xl font-black">Riwayat Transaksi Stok</h3></div><button onClick={() => exportCsv("stock-history-afa-store.csv", history.map((h) => ({ Tanggal: new Date(historyDate(h)).toLocaleString("id-ID"), Produk: h.product_name || h.productName || "-", Jenis: historyType(h), Jumlah: h.quantity, StokSebelum: h.previous_stock ?? h.previousStock, StokSesudah: h.new_stock ?? h.newStock, Catatan: h.note || "-", Admin: h.admin || h.admin_name || "-" })))} className="rounded-xl border px-4 py-2 font-bold"><Download size={15} className="inline" /> CSV</button></div><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[980px] text-left text-sm"><thead className="text-[#184D47]/60"><tr>{["Tanggal", "Nama Produk", "Jenis Transaksi", "Jumlah", "Stok Sebelum", "Stok Sesudah", "Catatan", "Admin"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{history.map((item) => { const type = historyType(item); return <tr key={item.id || `${historyDate(item)}-${item.product_id}`} className="border-t border-[#184D47]/10"><td className="p-3 font-bold">{new Date(historyDate(item)).toLocaleString("id-ID")}</td><td className="p-3 font-black">{item.product_name || item.productName || "-"}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${typeBadge(type)}`}>{type}</span></td><td className="p-3 font-black">{item.quantity ?? 0}</td><td className="p-3">{item.previous_stock ?? item.previousStock ?? "-"}</td><td className="p-3">{item.new_stock ?? item.newStock ?? "-"}</td><td className="p-3">{item.note || "-"}</td><td className="p-3">{item.admin || item.admin_name || "-"}</td></tr>; })}</tbody></table></div><div className="grid gap-3 lg:hidden">{history.map((item) => { const type = historyType(item); return <article key={item.id || `${historyDate(item)}-${item.product_id}`} className="rounded-[24px] bg-[#f8f0dd] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-[#184D47]/55">{new Date(historyDate(item)).toLocaleString("id-ID")}</p><h4 className="mt-1 font-black">{item.product_name || item.productName || "-"}</h4></div><span className={`rounded-full px-3 py-1 text-xs font-black ${typeBadge(type)}`}>{type}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-white p-2"><p className="text-xs font-bold text-[#184D47]/50">Jumlah</p><p className="font-black">{item.quantity ?? 0}</p></div><div className="rounded-2xl bg-white p-2"><p className="text-xs font-bold text-[#184D47]/50">Sebelum</p><p className="font-black">{item.previous_stock ?? item.previousStock ?? "-"}</p></div><div className="rounded-2xl bg-white p-2"><p className="text-xs font-bold text-[#184D47]/50">Sesudah</p><p className="font-black">{item.new_stock ?? item.newStock ?? "-"}</p></div></div><p className="mt-3 text-sm font-bold">{item.note || "-"}</p><p className="mt-1 text-xs font-bold text-[#184D47]/55">Admin: {item.admin || item.admin_name || "-"}</p></article>; })}</div>{!history.length && <p className="py-10 text-center font-bold text-[#184D47]/60">Belum ada riwayat stok.</p>}</Card></div>;
}

export function ReportsPanel() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("bulan");
    const load = useCallback(async () => { const res = await supabase.from("orders").select("*, items:order_items(*, product:products(category:categories(name)))").order("createdAt", { ascending: false }); if (res.error) toast(res.error.message, "error"); setOrders((res.data ?? []) as Order[]); setLoading(false); }, []);
    useEffect(() => { void load(); const channel = supabase.channel("afa-reports-panel").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load()).on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => void load()).subscribe(); return () => { void supabase.removeChannel(channel); }; }, [load]);
    const now = new Date(); const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const startWeek = new Date(startDay); startWeek.setDate(startDay.getDate() - startDay.getDay()); const startMonth = new Date(now.getFullYear(), now.getMonth(), 1); const startYear = new Date(now.getFullYear(), 0, 1);
    const sumSince = (date: Date) => orders.filter((o) => new Date(o.createdAt) >= date).reduce((sum, o) => sum + Number(o.total || 0), 0);
    const items = orders.flatMap((o) => o.items ?? []);
    const grouped = (keyer: (i: OrderItem) => string) => Object.entries(items.reduce<Record<string, number>>((acc, item) => { const key = keyer(item); acc[key] = (acc[key] ?? 0) + Number(item.quantity || 0); return acc; }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const bestProducts = grouped((i) => i.name || "Produk").slice(0, 6); const bestCategories = grouped((i) => i.product?.category?.name || "Tanpa Kategori").slice(0, 6);
    const daily = Object.entries(orders.reduce<Record<string, number>>((acc, o) => { const key = new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }); acc[key] = (acc[key] ?? 0) + Number(o.total || 0); return acc; }, {})).map(([name, total]) => ({ name, total })).slice(0, 14).reverse();
    const monthly = Object.entries(orders.reduce<Record<string, number>>((acc, o) => { const key = new Date(o.createdAt).toLocaleDateString("id-ID", { month: "short", year: "2-digit" }); acc[key] = (acc[key] ?? 0) + Number(o.total || 0); return acc; }, {})).map(([name, total]) => ({ name, total })).slice(0, 12).reverse();
    const rows = orders.map((o) => ({ Invoice: o.id, Pembeli: o.customer, Total: o.total, Status: o.status, Tanggal: o.createdAt }));
    if (loading) return <Card><Loader2 className="animate-spin" /> Memuat laporan...</Card>;
    return <div className="space-y-5"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: "Hari Ini", value: sumSince(startDay) }, { label: "Minggu Ini", value: sumSince(startWeek) }, { label: "Bulan Ini", value: sumSince(startMonth) }, { label: "Tahun Ini", value: sumSince(startYear) }].map((item) => <Card key={item.label}><p className="text-sm font-bold text-[#184D47]/60">Pendapatan {item.label}</p><p className="mt-2 text-2xl font-black">{rupiah.format(item.value)}</p></Card>)}</section><Card><div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><h3 className="text-2xl font-black">Laporan Penjualan Realtime</h3><div className="flex flex-wrap gap-2"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl bg-[#f8f0dd] px-3 py-2 font-bold">{["hari", "minggu", "bulan", "tahun", "custom date"].map((i) => <option key={i}>{i}</option>)}</select><button onClick={() => void exportPdf("Laporan AFA STORE", rows)} className="rounded-xl bg-[#D4AF37] px-3 py-2 font-bold">PDF</button><button onClick={() => void exportXlsx("laporan-afa-store.xlsx", rows)} className="rounded-xl bg-[#0F4C45] px-3 py-2 font-bold text-white">Excel</button><button onClick={() => exportCsv("laporan-afa-store.csv", rows)} className="rounded-xl border px-3 py-2 font-bold"><Download size={15} className="inline" /> CSV</button><button onClick={() => window.print()} className="rounded-xl border px-3 py-2 font-bold"><Printer size={15} className="inline" /> Print</button></div></div><div className="grid gap-5 xl:grid-cols-2"><div className="h-72"><ResponsiveContainer><AreaChart data={filter === "tahun" ? monthly : daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v) => rupiah.format(Number(v))} /><Area dataKey="total" stroke="#0F4C45" fill="#0F766E" fillOpacity={0.25} /></AreaChart></ResponsiveContainer></div><div className="h-72"><ResponsiveContainer><BarChart data={bestProducts}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#D4AF37" /></BarChart></ResponsiveContainer></div><div className="h-72"><ResponsiveContainer><PieChart><Pie data={bestCategories} dataKey="value" nameKey="name" outerRadius={95} label>{bestCategories.map((category, i) => <Cell key={`category-cell-${category.name}`} fill={colors[i % colors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div><div className="grid gap-3">{[{ label: "Produk Terlaris", value: bestProducts[0]?.name || "-" }, { label: "Kategori Terlaris", value: bestCategories[0]?.name || "-" }, { label: "Pesanan Terbanyak", value: orders.length }, { label: "Pembeli Terbanyak", value: Object.entries(orders.reduce<Record<string, number>>((a, o) => ({ ...a, [o.customer]: (a[o.customer] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]?.[0] || "-" }].map((i) => <div key={i.label} className="rounded-2xl bg-[#f8f0dd] p-4"><p className="text-sm font-bold text-[#184D47]/60">{i.label}</p><p className="text-xl font-black">{i.value}</p></div>)}</div></div></Card></div>;
}

const settingSchema = z.record(z.string(), z.union([z.string(), z.boolean()]));
const defaultSettings: Record<string, SettingValue> = { storeName: "AFA STORE", logo: "", favicon: "", address: "", whatsapp: "", email: "", instagram: "", facebook: "", tiktok: "", maps: "", shippingEnabled: true, couriers: "JNE, J&T, SiCepat", defaultWeight: "1000", freeShipping: false, qris: true, bankTransfer: true, cod: false, virtualAccount: false, accountNumber: "", bankName: "", websiteTitle: "AFA STORE", metaDescription: "", seoKeywords: "", homeBanner: "", footerLogo: "", themeColor: "#0F4C45", darkMode: false, twoFA: false, session: "30 hari" };

export function SettingsPanel() {
    const [values, setValues] = useState<Record<string, SettingValue>>(defaultSettings);
    const [admins, setAdmins] = useState<{ id: string; name?: string; email?: string; role?: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => { const [settingsRes, adminRes] = await Promise.all([supabase.from("settings").select("*"), supabase.from("users").select("id,name,email,role").in("role", ["Owner", "Administrator", "Operator", "Viewer", "admin"])]); const mapped = Object.fromEntries((settingsRes.data ?? []).map((s: { key: string; value: unknown }) => { const raw = typeof s.value === "object" && s.value && "value" in s.value ? (s.value as { value: unknown }).value : s.value; return [s.key, typeof raw === "boolean" ? raw : String(raw ?? "")]; })) as Record<string, SettingValue>; setValues({ ...defaultSettings, ...mapped }); setAdmins((adminRes.data ?? []) as { id: string; name?: string; email?: string; role?: string }[]); }, []);
    useEffect(() => { void load(); const channel = supabase.channel("afa-settings-panel").on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => void load()).on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => void load()).subscribe(); return () => { void supabase.removeChannel(channel); }; }, [load]);
    function setValue(key: string, value: string | boolean) { setValues((v) => ({ ...v, [key]: value })); }
    async function save(event: FormEvent) { event.preventDefault(); const parsed = settingSchema.safeParse(values); if (!parsed.success) return toast("Pengaturan tidak valid", "error"); setSaving(true); const rows = Object.entries(values).map(([key, value]) => ({ key, value: { value } })); const res = await supabase.from("settings").upsert(rows, { onConflict: "key" }); setSaving(false); if (res.error) return toast(res.error.message, "error"); toast("Pengaturan tersimpan realtime"); }
    async function adminAction(action: string) { toast(`${action} admin siap dihubungkan ke tabel profiles/users`, "info"); }
    const sections = [{ title: "Informasi Toko", keys: ["storeName", "logo", "favicon", "address", "whatsapp", "email", "instagram", "facebook", "tiktok", "maps"] }, { title: "Pengiriman", keys: ["shippingEnabled", "couriers", "defaultWeight", "freeShipping"] }, { title: "Pembayaran", keys: ["qris", "bankTransfer", "cod", "virtualAccount", "accountNumber", "bankName"] }, { title: "Website", keys: ["websiteTitle", "metaDescription", "seoKeywords", "homeBanner", "footerLogo", "themeColor", "darkMode"] }, { title: "Keamanan", keys: ["twoFA", "session"] }];
    return <form onSubmit={save} className="space-y-5"><Card className="bg-[#0F4C45] text-white"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.3em] text-[#D4AF37]">Control Center</p><h3 className="text-3xl font-black">Pengaturan AFA STORE</h3></div><button disabled={saving} className="rounded-2xl bg-[#D4AF37] px-5 py-3 font-black text-[#0F4C45] disabled:opacity-60"><Save className="mr-2 inline" size={18} />{saving ? "Menyimpan..." : "Simpan Semua"}</button></div></Card><div className="grid gap-5 xl:grid-cols-2">{sections.map((section) => <Card key={section.title}><h4 className="mb-4 flex items-center gap-2 text-xl font-black"><Settings2 size={20} />{section.title}</h4><div className="grid gap-3">{section.keys.map((key) => typeof values[key] === "boolean" ? <label key={key} className="flex items-center justify-between rounded-2xl bg-[#f8f0dd] p-4 font-bold"><span>{key}</span><input type="checkbox" checked={Boolean(values[key])} onChange={(e) => setValue(key, e.target.checked)} /></label> : <label key={key} className="space-y-2"><span className="text-sm font-bold text-[#184D47]/70">{key}</span><input value={String(values[key] ?? "")} onChange={(e) => setValue(key, e.target.value)} className="h-12 w-full rounded-2xl border border-[#184D47]/15 px-4 outline-none focus:border-[#D4AF37]" /></label>)}</div></Card>)}</div><div className="grid gap-5 xl:grid-cols-3"><Card><h4 className="mb-4 text-xl font-black">Admin</h4><div className="mb-3 flex flex-wrap gap-2">{["Tambah", "Edit", "Hapus"].map((a) => <button type="button" key={a} onClick={() => void adminAction(a)} className="rounded-xl bg-[#0F4C45] px-3 py-2 font-bold text-white">{a} Admin</button>)}</div><select className="mb-3 h-12 w-full rounded-2xl bg-[#f8f0dd] px-4 font-bold">{["Owner", "Administrator", "Operator", "Viewer"].map((r) => <option key={r}>{r}</option>)}</select>{admins.length ? admins.map((a) => <p key={a.id} className="rounded-xl border p-3 text-sm font-bold">{a.email} - {a.role}</p>) : <p className="text-sm font-bold text-[#184D47]/60">Belum ada data admin/profiles.</p>}</Card><Card><h4 className="mb-4 flex items-center gap-2 text-xl font-black"><ShieldCheck /> Keamanan</h4>{["Ganti Password", "2FA", "Logout Semua Device", "Session"].map((a) => <button type="button" key={a} onClick={() => toast(`${a} diproses melalui auth Supabase`, "info")} className="mb-2 w-full rounded-2xl bg-[#f8f0dd] p-3 text-left font-bold">{a}</button>)}</Card><Card><h4 className="mb-4 flex items-center gap-2 text-xl font-black"><UploadCloud /> Backup</h4>{["Backup Database", "Restore Database", "Download Backup"].map((a) => <button type="button" key={a} onClick={() => toast(`${a} membutuhkan service role/server action`, "info")} className="mb-2 w-full rounded-2xl bg-[#f8f0dd] p-3 text-left font-bold">{a}</button>)}</Card></div></form>;
}