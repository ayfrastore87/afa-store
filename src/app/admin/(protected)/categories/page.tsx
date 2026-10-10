"use client";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ImagePlus, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { optimizeCategoryImage, uploadCategoryImage, type CategoryImagePreview } from "@/lib/category-image-upload-client";
import "./categories.css";

type Category = { id: string; name: string; slug: string; imageUrl: string | null; _count?: { products: number } };
type Toast = { type: "success" | "error"; message: string };

const slugify = (v: string) => v.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Lenient variant used while typing so a trailing "-" is not stripped mid-edit.
const slugTyping = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-");
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

function Thumb({ category }: { category: Category }) {
    return category.imageUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={category.imageUrl} alt={`Gambar ${category.name}`} className="cat-thumb" />
        : <span className="cat-thumb cat-thumb-empty">Belum ada gambar</span>;
}

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugTouched, setSlugTouched] = useState(false);
    const [editing, setEditing] = useState<Category | null>(null);
    const [preview, setPreview] = useState<CategoryImagePreview | null>(null);
    const [fieldError, setFieldError] = useState("");
    const [error, setError] = useState("");
    const [toast, setToast] = useState<Toast | null>(null);
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState("");
    const [query, setQuery] = useState("");
    const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
    const [deleting, setDeleting] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLElement>(null);

    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/categories", { cache: "no-store" });
            const b = await r.json() as { data?: Category[] };
            setCategories(b.data ?? []);
        } catch {
            setToast({ type: "error", message: "Kategori belum dapat dimuat. Muat ulang halaman." });
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 4500);
        return () => window.clearTimeout(timer);
    }, [toast]);

    function reset() {
        if (preview) URL.revokeObjectURL(preview.previewUrl);
        setPreview(null); setEditing(null); setName(""); setSlug(""); setSlugTouched(false); setFieldError(""); setError("");
        if (input.current) input.current.value = "";
    }
    function onName(e: ChangeEvent<HTMLInputElement>) {
        const value = e.target.value;
        setName(value); setFieldError("");
        if (!slugTouched) setSlug(slugify(value));
    }
    function onSlug(e: ChangeEvent<HTMLInputElement>) {
        setSlugTouched(true); setFieldError("");
        setSlug(slugTyping(e.target.value));
    }
    async function choose(file?: File) {
        if (!file) return;
        try {
            setError(""); setStage("Memproses Gambar...");
            const next = await optimizeCategoryImage(file);
            if (preview) URL.revokeObjectURL(preview.previewUrl);
            setPreview(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gambar tidak valid.");
        } finally {
            setStage("");
            if (input.current) input.current.value = "";
        }
    }
    function clearPreview() {
        if (preview) URL.revokeObjectURL(preview.previewUrl);
        setPreview(null);
    }
    async function submit(e: FormEvent) {
        e.preventDefault();
        if (busy) return;
        const cleanName = name.trim();
        const cleanSlug = slugify(slug);
        if (!cleanName) { setFieldError("Nama kategori wajib diisi."); return; }
        if (!cleanSlug) { setFieldError("Slug tidak valid. Gunakan huruf, angka, dan tanda hubung."); return; }
        setBusy(true); setError(""); setFieldError("");
        try {
            let imageUrl: string | undefined;
            if (preview) { setStage("Mengunggah..."); imageUrl = await uploadCategoryImage(preview.file); }
            setStage("Menyimpan...");
            const r = await fetch(editing ? `/api/categories/${editing.id}` : "/api/categories", {
                method: editing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: cleanName, slug: cleanSlug, ...(imageUrl ? { imageUrl } : {}) }),
            });
            const b = await r.json() as { error?: string };
            if (!r.ok) throw new Error(b.error ?? "Kategori gagal disimpan.");
            const wasEditing = Boolean(editing);
            await load(); reset();
            setToast({ type: "success", message: wasEditing ? "Perubahan kategori berhasil disimpan." : "Kategori berhasil ditambahkan dan tersedia di website." });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Kategori gagal disimpan.";
            setError(message); setToast({ type: "error", message });
        } finally {
            setBusy(false); setStage("");
        }
    }
    function edit(c: Category) {
        reset(); setEditing(c); setName(c.name); setSlug(c.slug); setSlugTouched(true);
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    async function confirmRemove() {
        if (!pendingDelete || deleting) return;
        setDeleting(true);
        try {
            const r = await fetch(`/api/categories/${pendingDelete.id}`, { method: "DELETE" });
            const b = await r.json().catch(() => ({})) as { error?: string };
            if (!r.ok) throw new Error(b.error ?? "Kategori gagal dihapus.");
            if (editing?.id === pendingDelete.id) reset();
            setToast({ type: "success", message: `Kategori ${pendingDelete.name} berhasil dihapus.` });
            await load();
        } catch (err) {
            setToast({ type: "error", message: err instanceof Error ? err.message : "Kategori gagal dihapus." });
        } finally {
            setDeleting(false); setPendingDelete(null);
        }
    }

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? categories.filter(c => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)) : categories;
    }, [categories, query]);
    const currentImage = preview?.previewUrl ?? editing?.imageUrl ?? null;

    return <main className="cat-page">
        <div className="cat-wrap">
            <Link href="/admin/products" className="cat-back"><ArrowLeft size={18} />Kembali ke Produk</Link>
            <header className="cat-header">
                <div>
                    <p className="cat-kicker">AFA STORE ADMIN</p>
                    <h1 className="cat-title">Kategori Produk</h1>
                    <p className="cat-sub">Kelola kategori dan gambar yang tampil di website.</p>
                </div>
                <button type="button" onClick={() => { reset(); formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="cat-btn cat-btn-primary"><Plus size={18} />Tambah Kategori</button>
            </header>

            <section ref={formRef} className="cat-card" aria-labelledby="cat-form-title">
                <h2 id="cat-form-title" className="cat-card-title">{editing ? `Edit Kategori: ${editing.name}` : "Kategori Baru"}</h2>
                <form onSubmit={submit} className="cat-form" noValidate>
                    <label className="cat-field">
                        <span className="cat-label">Nama Kategori</span>
                        <input required value={name} onChange={onName} placeholder="Contoh: Hampers Lebaran" autoComplete="off" className="cat-input" aria-invalid={Boolean(fieldError)} />
                    </label>
                    <label className="cat-field">
                        <span className="cat-label">Slug</span>
                        <input value={slug} onChange={onSlug} placeholder="dibuat-otomatis-dari-nama" autoComplete="off" autoCapitalize="none" spellCheck={false} className="cat-input" />
                        <span className="cat-hint">Dibuat otomatis dari nama, dapat diubah manual.</span>
                    </label>
                    {fieldError && <p role="alert" className="cat-error">{fieldError}</p>}

                    <div className="cat-field">
                        <span className="cat-label">Gambar Kategori</span>
                        <div className="cat-upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void choose(e.dataTransfer.files[0]); }}>
                            {currentImage
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={currentImage} alt={preview ? "Preview Gambar" : `Gambar ${editing?.name ?? "kategori"}`} className="cat-upload-img" />
                                : <button type="button" onClick={() => input.current?.click()} className="cat-upload-empty" aria-label="Upload Gambar Kategori"><ImagePlus size={26} /></button>}
                            <div className="cat-upload-info">
                                <strong>{preview ? "Preview Gambar" : currentImage ? "Gambar saat ini" : "Upload Gambar Kategori"}</strong>
                                <span className="cat-hint">Klik atau tarik gambar. JPG, PNG, atau WEBP. Dioptimasi otomatis di bawah 500 KB.</span>
                                {preview && <span className="cat-hint">{preview.file.name} · {preview.finalWidth} × {preview.finalHeight}px · {kb(preview.finalBytes)}</span>}
                                <div className="cat-upload-actions">
                                    <button type="button" onClick={() => input.current?.click()} className="cat-btn cat-btn-outline">{currentImage ? "Ganti Gambar" : "Pilih Gambar"}</button>
                                    {preview && <button type="button" onClick={clearPreview} className="cat-btn cat-btn-danger-outline"><Trash2 size={16} />Hapus</button>}
                                </div>
                            </div>
                        </div>
                        <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void choose(e.target.files?.[0])} />
                        {stage === "Memproses Gambar..." && <p className="cat-hint" role="status">Memproses Gambar...</p>}
                    </div>

                    {error && <p role="alert" className="cat-error">{error}</p>}
                    <div className="cat-form-actions">
                        <button type="submit" disabled={busy || !name.trim()} className="cat-btn cat-btn-primary cat-btn-block">
                            {busy && <Loader2 size={18} className="animate-spin" />}{busy && stage ? stage : "Simpan Kategori"}
                        </button>
                        {editing && <button type="button" onClick={reset} disabled={busy} className="cat-btn cat-btn-outline cat-btn-block">Batal Edit</button>}
                    </div>
                </form>
            </section>

            <section className="cat-list" aria-labelledby="cat-list-title">
                <div className="cat-list-head">
                    <h2 id="cat-list-title" className="cat-card-title">Daftar Kategori <span className="cat-count">{filtered.length}</span></h2>
                    <label className="cat-search">
                        <Search size={18} aria-hidden="true" />
                        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari kategori..." aria-label="Cari kategori" className="cat-input cat-search-input" />
                    </label>
                </div>

                {loading ? <p className="cat-empty" role="status">Memuat kategori...</p>
                    : filtered.length === 0 ? <div className="cat-empty">
                        <strong>{query ? "Kategori tidak ditemukan." : "Belum ada kategori."}</strong>
                        <span>{query ? `Tidak ada kategori yang cocok dengan “${query}”. Coba kata kunci lain.` : "Tambahkan kategori pertama Anda lewat form di atas."}</span>
                    </div>
                        : <>
                            <ul className="cat-cards">
                                {filtered.map(c => <li key={c.id} className="cat-item">
                                    <Thumb category={c} />
                                    <div className="cat-item-main">
                                        <p className="cat-item-name">{c.name}</p>
                                        <p className="cat-item-slug">/{c.slug}</p>
                                        <p className="cat-item-meta">{c._count?.products ?? 0} produk</p>
                                    </div>
                                    <div className="cat-item-actions">
                                        <button type="button" onClick={() => edit(c)} className="cat-btn cat-btn-outline" aria-label={`Edit ${c.name}`}><Pencil size={16} />Edit</button>
                                        <button type="button" onClick={() => setPendingDelete(c)} className="cat-btn cat-btn-danger-outline" aria-label={`Hapus ${c.name}`}><Trash2 size={16} />Hapus</button>
                                    </div>
                                </li>)}
                            </ul>
                            <div className="cat-table-wrap">
                                <table className="cat-table">
                                    <thead><tr><th>Gambar</th><th>Nama</th><th>Slug</th><th>Produk</th><th>Aksi</th></tr></thead>
                                    <tbody>{filtered.map(c => <tr key={c.id}>
                                        <td><Thumb category={c} /></td>
                                        <td className="cat-td-name">{c.name}</td>
                                        <td>{c.slug}</td>
                                        <td>{c._count?.products ?? 0}</td>
                                        <td><div className="cat-item-actions">
                                            <button type="button" onClick={() => edit(c)} className="cat-btn cat-btn-outline" aria-label={`Edit ${c.name}`}><Pencil size={16} />Edit</button>
                                            <button type="button" onClick={() => setPendingDelete(c)} className="cat-btn cat-btn-danger-outline" aria-label={`Hapus ${c.name}`}><Trash2 size={16} />Hapus</button>
                                        </div></td>
                                    </tr>)}</tbody>
                                </table>
                            </div>
                        </>}
            </section>
        </div>

        {pendingDelete && <div className="cat-overlay" onClick={() => { if (!deleting) setPendingDelete(null); }}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="cat-del-title" aria-describedby="cat-del-desc" className="cat-dialog" onClick={e => e.stopPropagation()}>
                <span className="cat-dialog-icon"><AlertTriangle size={24} /></span>
                <h2 id="cat-del-title" className="cat-dialog-title">Hapus kategori {pendingDelete.name}?</h2>
                <p id="cat-del-desc" className="cat-sub">Kategori yang dihapus tidak dapat dikembalikan. Kategori yang masih dipakai produk tidak dapat dihapus.</p>
                <div className="cat-dialog-actions">
                    <button type="button" autoFocus onClick={() => setPendingDelete(null)} disabled={deleting} className="cat-btn cat-btn-outline cat-btn-block">Batal</button>
                    <button type="button" onClick={() => void confirmRemove()} disabled={deleting} className="cat-btn cat-btn-danger cat-btn-block">{deleting && <Loader2 size={18} className="animate-spin" />}Ya, Hapus</button>
                </div>
            </div>
        </div>}

        {toast && <div role="status" aria-live="polite" className={`cat-toast ${toast.type === "error" ? "cat-toast-error" : "cat-toast-success"}`}>
            {toast.type === "error" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Tutup notifikasi" className="cat-toast-close"><X size={18} /></button>
        </div>}
    </main>;
}

﻿
