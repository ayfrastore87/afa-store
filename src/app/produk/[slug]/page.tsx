import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProductDetailCta from "@/components/product-detail-cta";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const product = await prisma.product.findFirst({ where: { slug, isActive: true }, select: { name: true, flavor: true, size: true, category: true } });
    return { title: product ? `${product.name} | AFA STORE` : "Produk | AFA STORE", description: product ? [product.category?.name, product.flavor, product.size].filter(Boolean).join(" · ") : "Produk AFA STORE" };
}

export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const product = await prisma.product.findFirst({ where: { slug, isActive: true }, include: { category: true } });
    if (!product) notFound();
    return <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 md:grid-cols-2"><div className="relative min-h-80 overflow-hidden rounded-3xl bg-[#F8F0DD]"><Image src={product.image || "/products/parcel.png"} alt={product.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" /></div><section className="flex flex-col justify-center"><p className="font-bold uppercase tracking-widest text-[#8B6B3F]">{product.category?.name || "Tanpa Kategori"}</p><h1 className="mt-2 text-4xl font-black">{product.name}</h1><p className="mt-4 text-2xl font-black text-[#8B6B3F]">Rp{product.price.toLocaleString("id-ID")}</p><p className="mt-4">Rating: {product.rating > 0 ? `${product.rating}/5` : "Belum ada rating"}</p><div className="mt-3 space-y-1 text-sm"><p>Flavor: {product.flavor || "-"}</p><p>Size: {product.size || "-"}</p><p>Stok: {product.stock}</p></div><ProductDetailCta product={{ id: product.id, name: product.name, slug: product.slug, price: product.price, image: product.image }} stock={product.stock} /></section></main>;
}