"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { uploadCategoryImage } from "@/lib/category-image-upload-client";

type Category = { id: string; name: string; slug: string; imageUrl: string | null; _count?: { products: number } };

const slugify = (value: string) => value.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [name, setName] = useState("");
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [editing, setEditing] = useState<Category | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function load() {
        const response = await fetch("/api/categories");
        const body = await response.json() as { data?: Category[] };
        setCategories(body.data ?? []);
    }
    useEffect(() => { void load(); }, []);

    async function submit(event: FormEvent) {
        event.preventDefault(); setError(""); setBusy(true);
        const response = await fetch(editing ? `/api/categories/${editing.id}` : "/api/categories", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, imageUrl, ...(editing ? { slug: editing.slug } : {}) }) });
        const body = await response.json() as { error?: string };
        if (!response.ok) setError(body.error ?? "Kategori gagal disimpan."); else { setName(""); setImageUrl(null); setEditing(null); await load(); }
        setBusy(false);
    }

    async function remove(category: Category) {
        if (!window.confirm(`Hapus kategori ${category.name}?`)) return;
        const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
        const body = await response.json() as { error?: string };
        if (!response.ok) setError(body.error ?? "Kategori gagal dihapus."); else await load();
    }
    return <main className="min-h-screen bg-[#F8F5EE] px-5 py-10 text-[#184D47] md:px-10"><div className="mx-auto max-w-6xl"><Link href="/admin/products" className="font-bold">â† Kembali ke Produk</Link><header className="mt-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-black tracking-[0.2em] text-[#C9A45B]">AFA STORE ADMIN</p><h1 className="mt-2 text-4xl font-black">KATEGORI PRODUK</h1><p className="mt-2 text-[#184D47]/65">Kelola kategori yang digunakan pada produk AFA STORE.</p></div><button onClick={() => { setEditing(null); setName(""); setImageUrl(null); }} className="rounded-2xl bg-[#0F4C45] px-5 py-3 font-bold text-white">+ Tambah Kategori</button></header><section className="mt-8 rounded-3xl bg-white p-5 shadow-sm"><form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end"><label className="space-y-2"><span className="text-sm font-bold">Nama Kategori</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Nama Kategori" className="min-h-12 w-full rounded-2xl border px-4" required /></label><label className="space-y-2"><span className="text-sm font-bold">Slug</span><input value={editing?.slug ?? (name ? slugify(name) : "")} readOnly className="min-h-12 w-full rounded-2xl border bg-slate-50 px-4" aria-label="Slug kategori" /></label><div className="space-y-2"><span className="block text-sm font-bold">Gambar Kategori</span><div className="flex items-center gap-3"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#0F4C45] text-xs text-white">{imageUrl ? <img src={imageUrl} alt="Preview kategori" className="h-full w-full object-cover" /> : <span>Preview</span>}</div><div className="min-w-0"><input type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { setImageUrl(await uploadCategoryImage(file)); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Gambar gagal diunggah."); } }} /><p className="mt-1 text-xs text-[#184D47]/60">Gunakan gambar persegi (1:1), disarankan minimal 600 Ã— 600 px.</p>{imageUrl && <button type="button" onClick={() => setImageUrl(null)} className="mt-1 text-xs font-bold text-red-700">Hapus Gambar</button>}</div></div></div><button disabled={busy} className="rounded-2xl bg-[#C9A45B] px-5 py-3 font-bold text-[#184D47]">{editing ? "Simpan Perubahan" : "Simpan Kategori"}</button></form>{error && <p role="alert" className="mt-3 font-semibold text-red-700">{error}</p>}</section><section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm"><div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4 border-b px-5 py-4 text-sm font-black"><span>Nama Kategori</span><span>Gambar</span><span>Aksi</span></div>{categories.map(category => <div key={category.id} className="grid grid-cols-[1.2fr_1fr_1fr] items-center gap-4 border-b px-5 py-4 text-sm"><div><b>{category.name}</b><small className="block text-[#184D47]/55">{category._count?.products ?? 0} produk</small></div><div className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-[#0F4C45] text-[10px] text-white">{category.imageUrl ? <img src={category.imageUrl} alt="" className="h-full w-full object-cover" /> : "Placeholder"}</div><div className="flex gap-3"><button onClick={() => { setEditing(category); setName(category.name); setImageUrl(category.imageUrl); }} className="font-bold text-[#0F4C45]">Edit</button><button onClick={() => void remove(category)} className="font-bold text-red-700">Hapus</button></div></div>)}</section></div></main>;
}
