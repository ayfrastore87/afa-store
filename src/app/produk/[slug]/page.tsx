import Link from "next/link";
import { Check, ChevronRight, LockKeyhole, PackageCheck, ShieldCheck, Star, Truck } from "lucide-react";
import { notFound } from "next/navigation";
import ProductDetailCta from "@/components/product-detail-cta";
import ProductGallery from "@/components/product-gallery";
import ProductImage from "@/components/product-image";
import { prisma } from "@/lib/prisma";
import { formatRupiah } from "@/lib/products";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const product = await prisma.product.findFirst({ where: { slug, isActive: true }, select: { name: true, flavor: true, size: true, category: true } });
    return { title: product ? `${product.name} | AFA STORE` : "Produk | AFA STORE", description: product ? [product.category?.name, product.flavor, product.size].filter(Boolean).join(" · ") : "Produk AFA STORE" };
}

export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const product = await prisma.product.findFirst({ where: { slug, isActive: true }, include: { category: true } });
    if (!product) notFound();

    const relatedProducts = await prisma.product.findMany({
        where: { isActive: true, id: { not: product.id }, ...(product.categoryId ? { categoryId: product.categoryId } : {}) },
        orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
        take: 4,
        include: { category: true },
    });
    const available = product.stock > 0;

    return <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_5%,rgba(201,164,91,0.16),transparent_25rem),linear-gradient(135deg,#F8F5EE,#FFFDF8_58%,#EFE6D5)] pb-28 text-[#123524] md:pb-16">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-12">
            <nav aria-label="Breadcrumb" className="mb-6 flex min-w-0 items-center gap-2 text-sm text-[#8B6B3F]"><Link href="/" className="shrink-0 font-semibold hover:text-[#123524]">Beranda</Link><ChevronRight size={15} aria-hidden="true" /><Link href="/produk" className="shrink-0 font-semibold hover:text-[#123524]">Katalog</Link><ChevronRight size={15} aria-hidden="true" /><span className="truncate" aria-current="page">{product.name}</span></nav>
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(380px,0.88fr)] lg:gap-12 xl:gap-16">
                <section aria-label={`Gambar ${product.name}`} className="min-w-0">
                    <ProductGallery product={{ id: product.id, name: product.name, price: product.price, image: product.image, badge: product.badge }} images={[product.image]} available={available} />
                </section>
                <section className="min-w-0 py-1 lg:py-2" aria-labelledby="product-title">
                    {product.category?.name && <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#8B6B3F]">{product.category.name}</span>}
                    <h1 id="product-title" className="mt-3 break-words font-display text-3xl font-bold leading-[1.1] text-[#123524] sm:text-4xl xl:text-5xl">{product.name}</h1>
                    {product.rating > 0 && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#123524]" aria-label={`Rating ${product.rating} dari 5`}><span className="flex items-center gap-0.5">{Array.from({ length: 5 }).map((_, index) => <Star key={index} size={16} className={index < Math.round(product.rating) ? "fill-[#C9A45B] text-[#C9A45B]" : "text-[#C9A45B]/30"} aria-hidden="true" />)}</span><span className="text-[#8B6B3F]">{product.rating.toFixed(1)}/5</span></p>}
                    {product.description && <p className="mt-4 line-clamp-3 text-[15px] leading-relaxed text-[#43503f]">{product.description}</p>}
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <p className="font-display text-4xl font-bold text-[#123524] sm:text-[2.75rem]">{formatRupiah(product.price)}</p>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${available ? "bg-[#e7f1ea] text-[#1d6b45]" : "bg-red-50 text-red-700"}`}>{available ? <><Check size={16} aria-hidden="true" /> Stok Tersedia</> : "Stok Habis"}</span>
                    </div>
                    {(product.size || product.flavor) && <dl className="mt-6 flex flex-wrap gap-3">{product.size && <div className="rounded-2xl border border-[#C9A45B]/30 bg-[#FBF6EA] px-4 py-2.5"><dt className="text-xs font-semibold uppercase tracking-wide text-[#8B6B3F]">Ukuran</dt><dd className="mt-0.5 font-bold text-[#123524]">{product.size}</dd></div>}{product.flavor && <div className="rounded-2xl border border-[#C9A45B]/30 bg-[#FBF6EA] px-4 py-2.5"><dt className="text-xs font-semibold uppercase tracking-wide text-[#8B6B3F]">Rasa</dt><dd className="mt-0.5 font-bold text-[#123524]">{product.flavor}</dd></div>}</dl>}
                    <ProductDetailCta product={{ id: product.id, name: product.name, slug: product.slug, price: product.price, image: product.image }} stock={product.stock} />
                    <ul className="mt-8 grid gap-3 rounded-[20px] border border-[#C9A45B]/20 bg-[#FBF6EA]/60 p-5 text-sm text-[#43503f] sm:grid-cols-2"><li className="flex items-center gap-2"><PackageCheck size={18} className="shrink-0 text-[#C9A45B]" aria-hidden="true" />{available ? "Produk tersedia" : "Informasi stok aktual"}</li><li className="flex items-center gap-2"><Truck size={18} className="shrink-0 text-[#C9A45B]" aria-hidden="true" />Pengiriman tersedia</li><li className="flex items-center gap-2"><LockKeyhole size={18} className="shrink-0 text-[#C9A45B]" aria-hidden="true" />Pembayaran aman</li><li className="flex items-center gap-2"><ShieldCheck size={18} className="shrink-0 text-[#C9A45B]" aria-hidden="true" />Checkout terlindungi</li></ul>
                </section>
            </div>
            <section aria-labelledby="description-title" className="mt-16 lg:mt-24">
                <div className="luxury-card overflow-hidden rounded-[28px]">
                    <div className="border-b border-[#C9A45B]/15 px-6 py-5 sm:px-8">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C9A45B]">Detail Produk</p>
                        <h2 id="description-title" className="mt-2 font-display text-3xl font-bold text-[#123524] sm:text-4xl">Deskripsi Produk</h2>
                    </div>
                    <div className="px-6 py-6 sm:px-8 sm:py-8">
                        {product.description ? (
                            <p className="whitespace-pre-line text-[15px] leading-relaxed text-[#43503f] sm:text-base">{product.description}</p>
                        ) : (
                            <p className="text-[15px] italic text-[#8B6B3F] sm:text-base">Deskripsi produk belum tersedia.</p>
                        )}
                    </div>
                </div>
                <div className="luxury-card mt-6 overflow-hidden rounded-[28px]">
                    <div className="border-b border-[#C9A45B]/15 px-6 py-5 sm:px-8">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C9A45B]">Spesifikasi</p>
                        <h3 className="mt-2 font-display text-2xl font-bold text-[#123524] sm:text-3xl">Informasi Produk</h3>
                    </div>
                    <dl className="grid gap-x-8 gap-y-5 px-6 py-6 sm:grid-cols-2 sm:px-8 sm:py-8 lg:grid-cols-4">
                        <div><dt className="text-[#8B6B3F]">Kategori</dt><dd className="mt-1 font-bold text-[#123524]">{product.category?.name ?? "Tanpa Kategori"}</dd></div>
                        {product.size && <div><dt className="text-[#8B6B3F]">Ukuran</dt><dd className="mt-1 font-bold text-[#123524]">{product.size}</dd></div>}
                        {product.flavor && <div><dt className="text-[#8B6B3F]">Rasa</dt><dd className="mt-1 font-bold text-[#123524]">{product.flavor}</dd></div>}
                        <div><dt className="text-[#8B6B3F]">Stok</dt><dd className={`mt-1 font-bold ${available ? "text-[#315d45]" : "text-red-700"}`}>{available ? `${product.stock} tersedia` : "Stok habis"}</dd></div>
                    </dl>
                </div>
            </section>
            <section aria-labelledby="reviews-title" className="mt-16 border-t border-[#C9A45B]/20 pt-10 lg:mt-24 lg:pt-14">
                <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C9A45B]">Ulasan Pelanggan</p>
                        <h2 id="reviews-title" className="mt-2 font-display text-3xl font-bold sm:text-4xl">Penilaian Produk</h2>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-[#C9A45B]/20 bg-white/70 px-4 py-3">
                        <div className="flex items-center gap-0.5" aria-label={product.rating > 0 ? `Rating ${product.rating} dari 5 bintang` : "Belum ada rating"}>
                            {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={20} className={index < Math.round(product.rating) ? "fill-[#C9A45B] text-[#C9A45B]" : "text-[#C9A45B]/30"} aria-hidden="true" />)}
                        </div>
                        <p className="font-display text-2xl font-bold text-[#123524]">{product.rating > 0 ? product.rating.toFixed(1) : "—"}</p>
                    </div>
                </div>
                <div className="luxury-card rounded-[28px] p-8 text-center sm:p-12">
                    <Star size={40} className="mx-auto text-[#C9A45B]/40" aria-hidden="true" />
                    <h3 className="mt-4 font-display text-2xl font-bold text-[#123524]">Belum ada ulasan untuk produk ini.</h3>
                    <p className="mx-auto mt-3 max-w-xl text-[#8B6B3F]">Ulasan tertulis per produk membutuhkan desain data dan API terpisah. Saat ini rating produk bersumber dari data produk AFA STORE.</p>
                </div>
            </section>
            {relatedProducts.length > 0 && <section aria-labelledby="related-title" className="mt-16 border-t border-[#C9A45B]/20 pt-10 lg:mt-24 lg:pt-14"><div className="mb-7"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C9A45B]">Pilihan AFA</p><h2 id="related-title" className="mt-2 font-display text-3xl font-bold sm:text-4xl">Mungkin Anda Juga Suka</h2></div><div className="flex snap-x gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-2 sm:overflow-visible md:grid-cols-3 lg:grid-cols-4">{relatedProducts.map((related) => <article key={related.id} className="min-w-[72vw] max-w-[290px] snap-start sm:min-w-0 sm:max-w-none"><Link href={`/produk/${related.slug}`} className="group block"><div className="relative aspect-square overflow-hidden rounded-[24px] border border-[#C9A45B]/15 bg-[#F7EEDC]"><ProductImage src={related.image} alt={related.name} sizes="(max-width: 639px) 72vw, (max-width: 1023px) 33vw, 25vw" /></div><div className="px-1 pt-4">{related.category?.name && <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8B6B3F]">{related.category.name}</p>}<h3 className="mt-1 line-clamp-2 min-h-[3rem] font-display text-lg font-bold leading-snug group-hover:text-[#8B6B3F]">{related.name}</h3><div className="mt-2 flex items-center justify-between gap-3"><p className="font-bold text-[#8B6B3F]">{formatRupiah(related.price)}</p><span className={`text-xs font-semibold ${related.stock > 0 ? "text-[#315d45]" : "text-red-700"}`}>{related.stock > 0 ? "Tersedia" : "Habis"}</span></div></div></Link></article>)}</div></section>}
        </div>
    </main>;
}