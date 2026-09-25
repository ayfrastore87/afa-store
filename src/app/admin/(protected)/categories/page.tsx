"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Category = { id: string; name: string; slug: string; _count?: { products: number } };

const slugify = (value: string) => value.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [name, setName] = useState("");
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
        const response = await fetch(editing ? `/api/categories/${editing.id}` : "/api/categories", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, ...(editing ? { slug: editing.slug } : {}) }) });
        const body = await response.json() as { error?: string };
        if (!response.ok) setError(body.error ?? "Kategori gagal disimpan."); else { setName(""); setEditing(null); await load(); }
        setBusy(false);
    }

    async function remove(category: Category) {
        if (!window.confirm(`Hapus kategori ${category.name}?`)) return;
        const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
        const body = await response.json() as { error?: string };
        if (!response.ok) setError(body.error ?? "Kategori gagal dihapus."); else await load();
    }

    return <main className="min-h-screen bg-[#F8F5EE] px-5 py-10 text-[#184D47] md:px-10"><div className="mx-auto max-w-6xl"><Link href="/admin/products" className="font-bold">← Kembali ke Produk</Link><header className="mt-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-black tracking-[0.2em] text-[#C9A45B]">AFA STORE ADMIN</p><h1 className="mt-2 text-4xl font-black">KATEGORI PRODUK</h1><p className="mt-2 text-[#184D47]/65">Kelola kategori yang digunakan pada produk AFA STORE.</p></div><button onClick={() => { setEditing(null); setName(""); }} className="rounded-2xl bg-[#0F4C45] px-5 py-3 font-bold text-white">+ Tambah Kategori</button></header><section className="mt-8 rounded-3xl bg-white p-5 shadow-sm"><form onSubmit={submit} className="flex flex-col gap-3 md:flex-row"><input value={name} onChange={event => setName(event.target.value)} placeholder="Nama Kategori" className="min-h-12 flex-1 rounded-2xl border px-4" required /><input value={editing?.slug ?? (name ? slugify(name) : "")} readOnly className="min-h-12 flex-1 rounded-2xl border bg-slate-50 px-4" aria-label="Slug kategori" /><button disabled={busy} className="rounded-2xl bg-[#C9A45B] px-5 py-3 font-bold text-[#184D47]">{editing ? "Simpan Perubahan" : "Simpan Kategori"}</button></form>{error && <p role="alert" className="mt-3 font-semibold text-red-700">{error}</p>}</section><section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm"><div className="grid grid-cols-3 gap-4 border-b px-5 py-4 text-sm font-black"><span>Nama Kategori</span><span>Slug</span><span>Aksi</span></div>{categories.map(category => <div key={category.id} className="grid grid-cols-3 gap-4 border-b px-5 py-4 text-sm"><div><b>{category.name}</b><small className="block text-[#184D47]/55">{category._count?.products ?? 0} produk</small></div><span className="break-all">{category.slug}</span><div className="flex gap-3"><button onClick={() => { setEditing(category); setName(category.name); }} className="font-bold">Edit</button><button onClick={() => void remove(category)} className="font-bold text-red-700">Hapus</button></div></div>)}</section></div></main>;
}
