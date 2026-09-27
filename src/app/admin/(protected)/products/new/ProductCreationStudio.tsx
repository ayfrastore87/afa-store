"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Crop, ImagePlus, Loader2, Plus, RotateCcw, RotateCw, Save, Trash2, X } from "lucide-react";
import { uploadProductImage } from "@/lib/product-image-upload-client";
import { getUserFacingMessage, safeApiMessage } from "@/lib/user-facing-error";
import { getCropFileName, getSquareCropRect, PRODUCT_IMAGE_MAX_EDGE, PRODUCT_IMAGE_QUALITY, PRODUCT_IMAGE_TYPE } from "@/lib/product-image-crop";
type Category = { id: string; name: string };
type Form = { name: string; slug: string; categoryId: string; isActive: boolean; price: string; stock: string; rating: string; description: string; flavor: string; size: string; weight: string; badge: string };
type Photo = { file: File; url: string; name: string; original: number; final: number };
type CropArea = { x: number; y: number; size: number; zoom?: number; panX?: number; panY?: number; viewportSize?: number };
const MAX_ZOOM = 3;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function cropGeometry(width: number, height: number, viewport: number, zoom: number, panX: number, panY: number) { const baseScale = Math.max(viewport / width, viewport / height); const renderedWidth = width * baseScale * zoom; const renderedHeight = height * baseScale * zoom; const maxPanX = Math.max(0, (renderedWidth - viewport) / 2); const maxPanY = Math.max(0, (renderedHeight - viewport) / 2); return { baseScale, renderedWidth, renderedHeight, maxPanX, maxPanY, panX: clamp(panX, -maxPanX, maxPanX), panY: clamp(panY, -maxPanY, maxPanY) }; }
const blank: Form = { name: "", slug: "", categoryId: "", isActive: true, price: "", stock: "0", rating: "5", description: "", flavor: "", size: "", weight: "1000", badge: "" };
const TARGET = 950_000; const TYPES = ["image/jpeg", "image/png", "image/webp"];
const slugify = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const size = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`;

async function optimize(file: File, rotation = 0, crop?: CropArea) {
  const image = "createImageBitmap" in window ? await createImageBitmap(file) : await new Promise<HTMLImageElement>((ok, fail) => { const img = new window.Image(); const url = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(url); ok(img); }; img.onerror = fail; img.src = url; });
  const base = getSquareCropRect(image.width, image.height); const zoom = clamp(crop?.zoom ?? 1, 1, MAX_ZOOM); const viewport = crop?.viewportSize ?? 1000; const geometry = cropGeometry(image.width, image.height, viewport, zoom, crop?.panX ?? 0, crop?.panY ?? 0); const side = Math.min(image.width, image.height) / zoom; const sx = clamp(base.x + (base.width - side) / 2 - geometry.panX / (geometry.baseScale * zoom), 0, image.width - side); const sy = clamp(base.y + (base.height - side) / 2 - geometry.panY / (geometry.baseScale * zoom), 0, image.height - side); const sw = side; const sh = side; let scale = Math.min(1, PRODUCT_IMAGE_MAX_EDGE / Math.max(sw, sh)); let output: Blob | null = null;
  for (let pass = 0; pass < 8; pass++) { const w = Math.max(1, Math.round(sw * scale)); const h = Math.max(1, Math.round(sh * scale)); const turned = Math.abs(rotation % 180) === 90; const canvas = document.createElement("canvas"); canvas.width = turned ? h : w; canvas.height = turned ? w : h; const context = canvas.getContext("2d"); if (!context) throw new Error(); context.translate(canvas.width / 2, canvas.height / 2); context.rotate(rotation * Math.PI / 180); context.drawImage(image, sx, sy, sw, sh, -w / 2, -h / 2, w, h); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high"; output = await new Promise(resolve => canvas.toBlob(resolve, PRODUCT_IMAGE_TYPE, [PRODUCT_IMAGE_QUALITY, 0.82, 0.72, 0.62][Math.min(pass, 3)])); if (output && output.size <= TARGET) break; if (pass >= 3) scale *= .8; }
  if ("close" in image && typeof image.close === "function") image.close(); if (!output || output.size > TARGET) throw new Error(); return output;
}

export default function ProductCreationStudio() {
  const [form, setForm] = useState(blank); const [categories, setCategories] = useState<Category[]>([]); const [photo, setPhoto] = useState<Photo | null>(null); const [source, setSource] = useState<File | null>(null); const [zoom, setZoom] = useState(1); const [temporaryUrl, setTemporaryUrl] = useState(""); const [previewFailed, setPreviewFailed] = useState(false); const [rotation, setRotation] = useState(0); const [crop, setCrop] = useState<CropArea | undefined>(); const [cropOpen, setCropOpen] = useState(false); const [cropBeforeEdit, setCropBeforeEdit] = useState<CropArea | undefined>(); const [cameraOpen, setCameraOpen] = useState(false); const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false); const [processing, setProcessing] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false); const fileRef = useRef<HTMLInputElement>(null); const cameraRef = useRef<HTMLInputElement>(null); const videoRef = useRef<HTMLVideoElement>(null); const cropRef = useRef<HTMLDivElement>(null); const streamRef = useRef<MediaStream | null>(null); const pointers = useRef(new Map<number, { x: number; y: number }>()); const gesture = useRef<{ mode: "drag" | "pinch"; startX: number; startY: number; start: CropArea; distance: number; zoom: number; midX: number; midY: number } | null>(null);
  const processingRef = useRef(false); const submittingRef = useRef(false); const errorRef = useRef<HTMLParagraphElement>(null); const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  useEffect(() => { void fetch("/api/categories").then(async r => { const body = await r.json() as { data?: Category[] }; if (!r.ok) throw new Error(); setCategories(body.data ?? []); }).catch(() => setError("Kategori belum dapat dimuat. Silakan muat ulang halaman.")); }, []); useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]); useEffect(() => () => { if (temporaryUrl) URL.revokeObjectURL(temporaryUrl); }, [temporaryUrl]); useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);
  const category = categories.find(c => c.id === form.categoryId); const parcel = category?.name.trim().toLowerCase() === "parcel"; const items = useMemo(() => form.flavor.split(",").map(v => v.trim()).filter(Boolean), [form.flavor]); const set = (key: keyof Form, value: string | boolean) => setForm(current => ({ ...current, [key]: value, ...(key === "name" ? { slug: slugify(String(value)) } : {}) }));
  async function process(file: File, turn = 0, area?: CropArea) { setError(""); setPreviewFailed(false); if (!TYPES.includes(file.type)) { setError("Format gambar ini belum didukung. Gunakan JPG, PNG, atau WebP."); return; } processingRef.current = true; setProcessing(true); try { const blob = await optimize(file, turn, area); const final = new File([blob], getCropFileName(slugify(file.name)), { type: PRODUCT_IMAGE_TYPE }); setPhoto(previous => { if (previous) URL.revokeObjectURL(previous.url); return { file: final, url: URL.createObjectURL(final), name: file.name, original: file.size, final: final.size }; }); } catch { setError("Foto tidak dapat diproses. Gunakan JPG, PNG, atau WebP berukuran lebih kecil."); requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })); } finally { processingRef.current = false; setProcessing(false); } }
  function choose(file?: File) { if (!file) return; if (!TYPES.includes(file.type)) { setError("Format gambar ini belum didukung. Gunakan JPG, PNG, atau WebP."); return; } setPhoto(null); setSource(file); setTemporaryUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(file); }); setPreviewFailed(false); setRotation(0); setCrop(undefined); const probe = new window.Image(); const probeUrl = URL.createObjectURL(file); probe.onload = () => { setImageSize({ width: probe.naturalWidth, height: probe.naturalHeight }); URL.revokeObjectURL(probeUrl); }; probe.onerror = () => URL.revokeObjectURL(probeUrl); probe.src = probeUrl; void process(file); }
  function edit(turn: number, area?: CropArea) { if (!source) return; setRotation(turn); setCrop(area); void process(source, turn, area); }
  function beginCrop() { if (!source) return; const initial = crop ?? { x: 0, y: 0, size: 1, zoom: 1, panX: 0, panY: 0 }; setCropBeforeEdit(initial); setCrop(initial); setZoom(initial.zoom ?? 1); setCropOpen(true); }
  function updateCrop(event: React.PointerEvent<HTMLDivElement>) { if (!crop || !cropRef.current) return; event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const active = [...pointers.current.values()]; if (active.length === 2) { const [a, b] = active; gesture.current = { mode: "pinch", startX: 0, startY: 0, start: crop, distance: Math.hypot(a.x - b.x, a.y - b.y), zoom, midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 }; } else gesture.current = { mode: "drag", startX: event.clientX, startY: event.clientY, start: crop, distance: 0, zoom, midX: event.clientX, midY: event.clientY }; }
  function moveCrop(event: React.PointerEvent<HTMLDivElement>) { if (!crop || !cropRef.current || !pointers.current.has(event.pointerId)) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const active = [...pointers.current.values()]; const rect = cropRef.current.getBoundingClientRect(); const state = gesture.current; if (!state) return; if (active.length >= 2) { const [a, b] = active; const distance = Math.hypot(a.x - b.x, a.y - b.y); const nextZoom = clamp(state.zoom * distance / Math.max(1, state.distance), 1, MAX_ZOOM); const geometry = cropGeometry(imageSize.width, imageSize.height, rect.width, nextZoom, (state.start.panX ?? 0) + (a.x + b.x) / 2 - state.midX, (state.start.panY ?? 0) + (a.y + b.y) / 2 - state.midY); setZoom(nextZoom); setCrop({ ...state.start, zoom: nextZoom, viewportSize: rect.width, panX: geometry.panX, panY: geometry.panY }); return; } const geometry = cropGeometry(imageSize.width, imageSize.height, rect.width, zoom, (state.start.panX ?? 0) + event.clientX - state.startX, (state.start.panY ?? 0) + event.clientY - state.startY); setCrop({ ...state.start, viewportSize: rect.width, panX: geometry.panX, panY: geometry.panY }); }
  function endCrop(event: React.PointerEvent<HTMLDivElement>) { if (cropRef.current?.hasPointerCapture(event.pointerId)) cropRef.current.releasePointerCapture(event.pointerId); pointers.current.delete(event.pointerId); if (pointers.current.size === 1) { const [point] = [...pointers.current.values()]; gesture.current = { mode: "drag", startX: point.x, startY: point.y, start: crop ?? { x: 0, y: 0, size: 1, zoom }, distance: 0, zoom, midX: point.x, midY: point.y }; } else if (!pointers.current.size) gesture.current = null; }
  function stopCamera() { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; setCameraOpen(false); }
  async function openCamera() { if (window.matchMedia("(pointer: coarse)").matches) { cameraRef.current?.click(); return; } if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { setError("Kamera tidak dapat digunakan. Silakan gunakan Upload Foto."); return; } try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }); streamRef.current = stream; setCameraOpen(true); requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } }); } catch { stopCamera(); setError("Kamera tidak dapat digunakan. Silakan gunakan Upload Foto."); } }
  async function captureCamera() { const video = videoRef.current; if (!video?.videoWidth) return; const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext("2d")?.drawImage(video, 0, 0); const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .92)); stopCamera(); if (blob) choose(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" })); }
  function removePhoto() { setPhoto(null); setSource(null); setTemporaryUrl(""); setPreviewFailed(false); setRotation(0); setCrop(undefined); setCropOpen(false); if (fileRef.current) fileRef.current.value = ""; if (cameraRef.current) cameraRef.current.value = ""; } function reset() { setForm(blank); removePhoto(); setDraft(""); setError(""); setDone(false); }
  function showError(message: string, field?: string) { setError(message); requestAnimationFrame(() => { const element = field ? document.querySelector<HTMLElement>(`[name="${field}"]`) : errorRef.current; element?.scrollIntoView({ behavior: "smooth", block: "center" }); element?.focus(); }); }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (submittingRef.current) return; setError(""); const price = Number(form.price), stock = Number(form.stock), rating = Number(form.rating), weight = Number(form.weight); if (processingRef.current) return showError("Gambar masih diproses. Tunggu sebentar lalu simpan kembali."); if (!form.name.trim()) return showError("Nama produk wajib diisi.", "name"); if (!form.categoryId) return showError("Kategori wajib dipilih.", "categoryId"); if (form.price === "" || !Number.isInteger(price) || price < 0) return showError("Harga tidak valid.", "price"); if (form.stock === "" || !Number.isInteger(stock) || stock < 0) return showError("Stok tidak valid.", "stock"); if (!Number.isFinite(rating) || rating < 0 || rating > 5) return showError("Rating harus antara 0 dan 5.", "rating"); if (form.weight === "" || !Number.isInteger(weight) || weight < 1) return showError("Berat produk tidak valid.", "weight"); if (photo && photo.file.size > 1024 * 1024) return showError("Ukuran gambar terlalu besar."); submittingRef.current = true; setBusy(true); try { let image: string | null = null; if (photo) image = (await uploadProductImage(photo.file)).url; const response = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, name: form.name.trim(), slug: form.slug || slugify(form.name), categoryId: form.categoryId, price, stock, rating, weight, description: form.description || null, flavor: form.flavor || null, size: form.size || null, badge: form.badge || null, image }) }); if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(safeApiMessage(body) ?? "Gagal menyimpan produk. Periksa data yang belum lengkap."); } setDone(true); } catch (caught) { showError(getUserFacingMessage(caught, "Gagal menyimpan produk. Periksa data yang belum lengkap.")); } finally { submittingRef.current = false; setBusy(false); } }

  if (done) return <main className="studio-page"><div className="studio-success"><Check size={44} /><h1>Produk berhasil ditambahkan.</h1><p>Produk telah disimpan melalui API produk AFA STORE.</p><div><Link href="/admin/products">Lihat Produk</Link><button onClick={reset}>Tambah Produk Lagi</button></div></div></main>;

  return <main className="studio-page"><div className="studio-shell">
    <header className="studio-heading">
      <nav className="studio-top-nav" aria-label="Navigasi tambah produk">
        <Link href="/admin/products">← Kembali ke Produk</Link>
        <Link href="/admin/categories" className="studio-top-nav-cat">Kelola Kategori</Link>
      </nav>
      <div className="studio-heading-body">
        <p>AFA STORE ADMIN • PRODUCT CREATION STUDIO</p>
        <h1>Tambah Produk</h1>
        <span>Lengkapi data produk dan pilih kategori yang tersedia.</span>
      </div>
    </header>
    <form onSubmit={submit} className="studio-layout">
      <div className="studio-sections">
        <Section n="01" title="Informasi Produk" subtitle="Isi informasi dasar produk.">
          <Field id="name" label="Nama Produk *">
            <input name="name" required value={form.name} onChange={e => set("name", e.target.value)} placeholder="Contoh: Bawang Goreng Original" />
          </Field>
          <Field id="slug" label="Slug otomatis" help="Terbentuk otomatis dan tetap dapat diedit.">
            <input name="slug" required value={form.slug} onChange={e => set("slug", slugify(e.target.value))} placeholder="Contoh: bawang-goreng-original" />
          </Field>
          <Field id="category" label="Kategori *">
            <select name="categoryId" required value={form.categoryId} onChange={e => set("categoryId", e.target.value)}>
              <option value="">Pilih kategori</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field id="status" label="Status Produk *">
            <select value={form.isActive ? "on" : "off"} onChange={e => set("isActive", e.target.value === "on")}>
              <option value="on">● Aktif</option>
              <option value="off">○ Nonaktif</option>
            </select>
          </Field>
        </Section>
        <Section n="02" title="Deskripsi Produk" subtitle="Ceritakan detail produk Anda.">
          <div className="studio-field">
            <label><span>Deskripsi</span><textarea value={form.description} onChange={e => set("description", e.target.value)} maxLength={1000} rows={6} placeholder="Tuliskan informasi lengkap produk, rasa, keunggulan, bahan, atau saran penyajian..." /></label>
            <small>{form.description.length} / 1000 karakter</small>
          </div>
        </Section>
        <Section n="03" title="Harga & Stok" subtitle="Atur harga dan jumlah stok.">
          <Grid three>
            <Field id="price" label="Harga *">
              <div className="money-input"><span>Rp</span><input name="price" type="number" min="0" step="1" required value={form.price} onChange={e => set("price", e.target.value)} placeholder="0" /></div>
              <small>{money.format(Number(form.price) || 0)}</small>
            </Field>
            <Field id="stock" label="Stok *" help="Jumlah stok yang tersedia.">
              <input name="stock" type="number" min="0" step="1" required value={form.stock} onChange={e => set("stock", e.target.value)} />
            </Field>
            <Field id="rating" label="Rating (0–5)">
              <input name="rating" type="number" min="0" max="5" step="0.1" required value={form.rating} onChange={e => set("rating", e.target.value)} />
            </Field>
          </Grid>
        </Section>
        <Section n="04" title="Gambar Produk" subtitle="Unggah foto produk.">
          <input ref={fileRef} hidden type="file" accept="image/*" onChange={e => choose(e.target.files?.[0])} />
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={e => choose(e.target.files?.[0])} />
          <div className="photo-actions">
            <button type="button" onClick={openCamera}><Camera /> 📷 Ambil Foto</button>
            <button type="button" onClick={() => fileRef.current?.click()}><ImagePlus /> Upload Foto</button>
          </div>
          <p className="helper">JPEG, PNG, atau WebP · Otomatis dioptimalkan ke maksimal 950 KB.</p>
          {photo || temporaryUrl ? <div className="photo-studio">
            <div className="photo-frame">{previewFailed ? <b>Preview tidak tersedia</b> : <Image src={photo?.url || temporaryUrl} alt={form.name || "Preview produk"} fill unoptimized onError={() => setPreviewFailed(true)} />}</div>
            <div>{processing && <p><Loader2 className="spin" /> Memproses foto…</p>}{photo && <><dl><dt>Nama file</dt><dd>{photo.name}</dd><dt>Original</dt><dd>{size(photo.original)}</dd><dt>Optimized</dt><dd>{size(photo.final)}</dd><dt>Format</dt><dd>WebP</dd></dl><strong><Check /> Siap diupload</strong><div className="tools"><button type="button" aria-label="Crop foto" onClick={beginCrop}><Crop /> Crop</button><button type="button" aria-label="Putar kiri" onClick={() => edit(rotation - 90, crop)}><RotateCcw /> Kiri</button><button type="button" aria-label="Putar kanan" onClick={() => edit(rotation + 90, crop)}><RotateCw /> Kanan</button><button type="button" aria-label="Reset editor" onClick={() => edit(0, undefined)}>Reset</button><button type="button" aria-label="Hapus foto produk" onClick={removePhoto}><Trash2 /> Hapus</button></div></>}</div>
          </div> : <div className="photo-empty" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} aria-label="Pilih gambar produk" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}><ImagePlus size={32} /><b>Pilih Gambar</b><span>Klik untuk upload gambar</span><span className="photo-empty-hint">JPG, PNG, WebP · maks 2 MB</span></div>}
          <div className="canva"><b>Edit di Canva</b><span>Integrasi Canva belum dikonfigurasi.</span></div>
        </Section>
        <Section n="05" title="Informasi Tambahan" subtitle="Atur detail tambahan produk.">
          <Field id="weight" label="Berat (gram)" help="Dipakai untuk menghitung ongkir pengiriman.">
            <input name="weight" type="number" min="1" step="1" required value={form.weight} onChange={e => set("weight", e.target.value)} />
          </Field>
          <Grid>
            <Field id="flavor" label={parcel ? "Isi / Variasi Parcel" : "Variasi / Flavor"} help={parcel ? "Masukkan isi atau variasi parcel yang ditawarkan." : "Contoh: Original, Pedas, atau Daun Jeruk."}>
              <input value={form.flavor} onChange={e => set("flavor", e.target.value)} placeholder={parcel ? "Bawang Goreng Original + Pedas + Daun Jeruk" : "Original"} />
            </Field>
            <Field id="size" label="Ukuran / Dimensi">
              <input value={form.size} onChange={e => set("size", e.target.value)} placeholder="Contoh: 100 gr" />
            </Field>
          </Grid>
          <Field id="badge" label="Badge (opsional)">
            <input value={form.badge} onChange={e => set("badge", e.target.value)} placeholder="Contoh: Best Seller" />
          </Field>
          {parcel && <div className="parcel-builder"><h3>Tambahan Parcel</h3><p>Hasil disimpan sebagai teks pada field flavor existing.</p><div><input aria-label="Isi parcel baru" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Bawang Goreng Original" /><button type="button" onClick={() => { if (draft.trim()) { set("flavor", [...items, draft.trim()].join(", ")); setDraft(""); } }}><Plus size={18} /> Tambah Isi</button></div>{items.map((item, i) => <span key={`${item}-${i}`}>{item}<button type="button" aria-label={`Hapus ${item}`} onClick={() => set("flavor", items.filter((_, j) => i !== j).join(", "))}><X size={17} /></button></span>)}</div>}
        </Section>
        {error && <p ref={errorRef} role="alert" tabIndex={-1} className="studio-error">{error}</p>}
        <footer className="studio-footer">
          <button type="submit" className="studio-submit" disabled={busy || processing} aria-busy={busy}>{busy ? <Loader2 className="spin" /> : <Save />} {busy ? "MENYIMPAN…" : "SIMPAN PRODUK"}</button>
          <Link href="/admin/products" className="studio-cancel">BATAL</Link>
        </footer>
      </div>
      <aside>
        <Section n="P" title="Preview">
          <div className="product-preview"><div>{photo && !previewFailed ? <Image src={photo.url || temporaryUrl} alt={form.name || "Preview produk"} fill unoptimized onError={() => setPreviewFailed(true)} /> : photo ? <b>Preview tidak tersedia</b> : <ImagePlus />}{form.badge && <b>{form.badge}</b>}</div><article><small>{category?.name || "Kategori"}</small><h2>{form.name || "Nama Produk"}</h2><p>{form.flavor || (parcel ? "Isi parcel" : "Flavor produk")}{form.size && ` • ${form.size}`}</p><strong>{money.format(Number(form.price) || 0)}</strong><footer><span>Stok: {Number(form.stock) || 0}</span><b>{form.isActive ? "Aktif" : "Nonaktif"}</b></footer></article></div>
        </Section>
      </aside>
    </form>
  </div>
  {cameraOpen && <div className="media-modal" role="dialog" aria-modal="true" aria-label="Camera Preview"><div><h2>Camera Preview</h2><video ref={videoRef} playsInline muted /><footer><button type="button" onClick={captureCamera}>Ambil Foto</button><button type="button" onClick={stopCamera}>Batal</button></footer></div></div>}
  {cropOpen && source && crop && <div className="media-modal crop-modal" role="dialog" aria-modal="true" aria-label="Editor crop"><div><header className="crop-header"><h2>← Crop Gambar</h2><button type="button" onClick={() => { setZoom(1); setCrop(c => c ? { ...c, zoom: 1, panX: 0, panY: 0 } : c); }}>Reset</button></header><div ref={cropRef} className="crop-preview" onPointerDown={updateCrop} onPointerMove={moveCrop} onPointerUp={endCrop} onPointerCancel={endCrop}><Image src={temporaryUrl} alt="Crop preview" fill unoptimized sizes="(max-width: 640px) 100vw, 650px" style={{ objectFit: "cover", transform: `translate3d(${crop.panX ?? 0}px, ${crop.panY ?? 0}px, 0) scale(${zoom})` }} /><span className="crop-frame" aria-hidden="true" /></div><label className="crop-zoom"><span>Perbesar / Perkecil</span><span className="crop-zoom-controls"><button type="button" aria-label="Perkecil" onClick={() => { const value = Math.max(1, zoom - .1); setZoom(value); setCrop(c => c ? { ...c, zoom: value } : c); }}>−</button><input aria-label="Zoom gambar" type="range" min="1" max="3" step=".05" value={zoom} onChange={e => { const value = Number(e.target.value); setZoom(value); setCrop(c => c ? { ...c, zoom: value, panX: 0, panY: 0 } : c); }} /><button type="button" aria-label="Perbesar" onClick={() => { const value = Math.min(3, zoom + .1); setZoom(value); setCrop(c => c ? { ...c, zoom: value } : c); }}>+</button></span></label><footer><button type="button" className="crop-cancel" onClick={() => { setCrop(cropBeforeEdit); setCropOpen(false); }}>BATAL</button><button type="button" onClick={() => { setCropOpen(false); edit(rotation, crop); }}>GUNAKAN GAMBAR</button></footer></div></div>}
  </main>;
}
function Section({ n, title, subtitle, children }: { n: string; title: string; subtitle?: string; children: React.ReactNode }) { return <section className="studio-card"><header><b>{n}</b><div className="section-header-text"><h2>{title}</h2>{subtitle && <p className="section-subtitle">{subtitle}</p>}</div></header>{children}</section>; }
function Grid({ children, three }: { children: React.ReactNode; three?: boolean }) { return <div className={three ? "studio-grid three" : "studio-grid"}>{children}</div>; }
function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) { return <div className="studio-field"><label><span>{label}</span>{children}</label>{help && <small id={`${id}-help`}>{help}</small>}</div>; }
