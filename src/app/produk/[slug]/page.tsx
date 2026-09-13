import Link from "next/link";
import { Check, ChevronRight, LockKeyhole, ShieldCheck, Star } from "lucide-react";
import { notFound } from "next/navigation";
import ProductDetailCta from "@/components/product-detail-cta";
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
            <nav aria-label="Breadcrumb" className="mb-6 flex min-w-0 items-center gap-2 text-sm text-[#8B6B3F]"><Link href="/" className="shrink-0 font-semibold hover:text-[#123524]">Beranda</Link><ChevronRight size={15} aria-hidden="true" /><span className="truncate" aria-current="page">{product.name}</span></nav>
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:gap-14 xl:gap-20">
                <section aria-label={`Gambar ${product.name}`} className="relative aspect-square min-w-0 overflow-hidden rounded-[28px] border border-[#C9A45B]/15 bg-[#F7EEDC] sm:rounded-[40px] lg:sticky lg:top-8"><div className="absolute inset-8 rounded-full bg-white/70 blur-3xl" aria-hidden="true" /><ProductImage src={product.image} alt={product.name} priority sizes="(max-width: 1023px) 100vw, 55vw" /></section>
                <section className="min-w-0 py-1 lg:py-6" aria-labelledby="product-title">
                    <div className="flex flex-wrap items-center gap-2">{product.badge && <span className="rounded-full bg-[#C9A45B] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">{product.badge}</span>}{product.category?.name && <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#8B6B3F]">{product.category.name}</span>}</div>
                    <h1 id="product-title" className="mt-4 break-words font-display text-4xl font-bold leading-[1.08] text-[#123524] sm:text-5xl xl:text-6xl">{product.name}</h1>
                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2"><p className="font-display text-3xl font-bold text-[#8B6B3F] sm:text-4xl">{formatRupiah(product.price)}</p><p className="flex items-center gap-1.5 text-sm font-semibold" aria-label={product.rating > 0 ? `Rating ${product.rating} dari 5` : "Belum ada rating"}><Star size={18} fill={product.rating > 0 ? "#C9A45B" : "none"} className="text-[#C9A45B]" aria-hidden="true" />{product.rating > 0 ? `${product.rating}/5` : "Belum ada rating"}</p></div>
                    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-[#C9A45B]/20 py-6 text-sm sm:grid-cols-3">{product.flavor && <div><dt className="text-[#8B6B3F]">Rasa</dt><dd className="mt-1 font-bold">{product.flavor}</dd></div>}{product.size && <div><dt className="text-[#8B6B3F]">Ukuran</dt><dd className="mt-1 font-bold">{product.size}</dd></div>}<div><dt className="text-[#8B6B3F]">Ketersediaan</dt><dd className={`mt-1 font-bold ${available ? "text-[#315d45]" : "text-red-700"}`}>{available ? `${product.stock} tersedia` : "Stok habis"}</dd></div></dl>
                    <ProductDetailCta product={{ id: product.id, name: product.name, slug: product.slug, price: product.price, image: product.image }} stock={product.stock} />
                    <ul className="mt-8 grid gap-3 border-t border-[#C9A45B]/20 pt-6 text-sm text-[#43503f] sm:grid-cols-3"><li className="flex items-center gap-2"><Check size={18} className="shrink-0 text-[#C9A45B]" aria-hidden="true" />{available ? "Produk tersedia" : "Informasi stok aktual"}</li><li className="flex items-center gap-2"><LockKeyhole size={18} className="shrink-0 text-[#C9A45B]" aria-hidden="true" />Pembayaran aman</li><li className="flex items-center gap-2"><ShieldCheck size={18} className="shrink-0 text-[#C9A45B]" aria-hidden="true" />Checkout terlindungi</li></ul>
                </section>
            </div>
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