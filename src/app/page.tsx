"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useScroll, type Variants } from "framer-motion";
import { ArrowUp, ChevronRight, Headphones, Heart, Menu, Minus, Moon, Plus, Search, Shield, ShoppingCart, Star, Sun, Trash2, Truck, User, X } from "lucide-react";
import AdminButton from "@/components/AdminButton";
import TestimonialsSection from "@/components/TestimonialsSection";
import ProductImage from "@/components/product-image";
import { CartItem, useCart } from "@/context/cart-context";
import { useWishlist } from "@/context/wishlist-context";
import { parseJsonResponse } from "@/lib/api-fetch";
import { hasAuthenticatedUser, loginPath, whatsappUrl } from "@/lib/client-auth";
import { fetchProducts, formatRupiah, productSizes, type Product } from "@/lib/products";
type HeroCategory = "bawang" | "parcel" | "oleh";
const heroOrder: HeroCategory[] = ["bawang", "parcel", "oleh"];
const nav = ["Beranda", "Bawang Goreng", "Parcel", "Promo", "Tentang Kami", "Testimoni", "FAQ", "Kontak"];
const heroContent: Record<HeroCategory, { badge: string; title: string[]; description: string; image: string; target: "katalog" | "parcel" }> = {
  bawang: {
    badge: "BAWANG GORENG",
    title: ["BAWANG GORENG", ""],
    description: "Bawang goreng renyah pilihan dengan aroma harum dan rasa gurih untuk setiap hidangan.",
    image: "/products/backround.png",
    target: "katalog",
  },
  parcel: {
    badge: "Parcel",
    title: ["Parcel", ""],
    description: "Parcel pilihan untuk momen istimewa dengan tampilan elegan dan rasa berkelas.",
    image: "/products/parcel 1.png",
    target: "parcel",
  },
  oleh: {
    badge: "OLEH-OLEH",
    title: ["HAMPERS", ""],
    description: "Paket oleh-oleh AFA berisi pilihan produk favorit yang praktis, elegan, dan siap dibawa untuk keluarga maupun relasi.",
    image: "/products/parcel.png",
    target: "parcel",
  },
};
const shippingOptions = { Cilegon: 10000, Serang: 15000, Anyer: 20000, Merak: 10000, "Luar Kota": 25000 } as const;
const voucherRates: Record<string, number> = {
  AFA10: 0.1,
  AFA20: 0.2,
};
const slideVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 72, scale: 0.98 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -72, scale: 0.98 }),
};

export default function Home() {
  const [cartOpen, setCartOpen] = useState(false), [dark, setDark] = useState(false), [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("Semua"), [sort, setSort] = useState("featured");
  const [products, setProducts] = useState<Product[]>([]), [productsLoading, setProductsLoading] = useState(true), [productsError, setProductsError] = useState("");
  const [heroCategory, setHeroCategory] = useState<HeroCategory>("bawang");
  const [heroSlideDirection, setHeroSlideDirection] = useState(1);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null), [zoom, setZoom] = useState(1);
  const parcelRef = useRef<HTMLElement | null>(null);
  const katalogRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const { cart, subtotal, totalItems, itemState, addToCart, increaseQty, decreaseQty, removeFromCart, clearCart } = useCart();
  const { wishlistCount, toast, toggleWishlist, isWishlisted } = useWishlist();
  const { scrollYProgress } = useScroll();
  const cartItemCount = totalItems;
  const visibleProducts = useMemo(() => products.filter((p) => { const term = query.trim().toLowerCase(); const searchable = [p.name, p.slug, p.flavor, p.size, p.category].filter(Boolean).join(" ").toLowerCase(); return (filter === "Semua" || p.category === filter) && searchable.includes(term); }).sort((a, b) => sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : b.rating - a.rating), [filter, products, query, sort]);
  const parcelProducts = useMemo(() => products.filter((p) => p.category?.trim().toLowerCase() === "parcel"), [products]);
  const requireAuth = async (next: string) => {
    if (!(await hasAuthenticatedUser())) { router.push(loginPath(next)); return false; }
    return true;
  };
  const openCart = async () => { if (await requireAuth("/cart")) setCartOpen(true); };
  const addCart = async (item: { id: string; name: string; slug?: string | null; price: number; image: string }) => { if (await requireAuth("/")) { addToCart(item); setCartOpen(true); } };
  const buyNow = async (item: { id: string; name: string; slug?: string | null; price: number; image: string }) => {
    if (!(await requireAuth("/"))) return;
    try {
      const response = await fetch("/api/cart/buy-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, qty: 1 }) });
      const data = await parseJsonResponse<{ redirectTo?: string }>(response);
      router.push(data.redirectTo || "/checkout");
    } catch (error) {
      console.error("Buy now failed", error);
      router.push("/login");
    }
  };
  const continueToCheckout = async () => {
    if (checkoutPending || !cart.length) return;
    if (!(await requireAuth("/cart"))) return;
    setCheckoutPending(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/checkout/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart.map(({ id, qty }) => ({ id, qty })) }) });
      if (!response.ok) throw new Error("session");
      router.push("/checkout");
    } catch {
      setCheckoutError("Checkout belum dapat dimulai. Periksa keranjang lalu coba lagi.");
      setCheckoutPending(false);
    }
  };
  const scrollToSection = (target: RefObject<HTMLElement | null>) => target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const activeHero = heroContent[heroCategory];
  const heroTargetRef = activeHero.target === "parcel" ? parcelRef : katalogRef;
  const selectHeroCategory = (category: HeroCategory) => {
    const currentIndex = heroOrder.indexOf(heroCategory);
    const nextIndex = heroOrder.indexOf(category);
    setHeroSlideDirection(nextIndex >= currentIndex ? 1 : -1);
    setHeroCategory(category);
    scrollToSection(category === "parcel" || category === "oleh" ? parcelRef : katalogRef);
  };
  const goToHeroSlide = (category: HeroCategory) => {
    const currentIndex = heroOrder.indexOf(heroCategory);
    const nextIndex = heroOrder.indexOf(category);
    setHeroSlideDirection(nextIndex >= currentIndex ? 1 : -1);
    setHeroCategory(category);
  };

  const loadProducts = useCallback(() => {
    setProductsLoading(true);
    setProductsError("");
    fetchProducts()
      .then(setProducts)
      .catch(() => setProductsError("Produk sedang mengalami gangguan. Silakan coba lagi beberapa saat."))
      .finally(() => setProductsLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setDark(window.localStorage.getItem("afa-theme") === "dark");
  }, []);

  useEffect(() => {
    const theme = dark ? "dark" : "light";
    document.body.dataset.theme = theme;
    window.localStorage.setItem("afa-theme", theme);
  }, [dark]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroCategory((current) => {
        const nextIndex = (heroOrder.indexOf(current) + 1) % heroOrder.length;
        setHeroSlideDirection(1);
        return heroOrder[nextIndex];
      });
    }, 5200);

    return () => window.clearInterval(timer);
  }, []);

  return <main data-theme={dark ? "dark" : "light"} className={`min-h-screen overflow-hidden bg-[#F8F5EE] text-[#123524] ${dark ? "theme-dark" : ""}`}><motion.div className="fixed left-0 right-0 top-0 z-80 h-1 origin-left bg-[#C9A45B]" style={{ scaleX: scrollYProgress }} />
    <WishlistToast message={toast} />
    <header className="sticky top-0 z-50 min-h-[80px] border-b border-[#C9A45B]/15 bg-[#F8F5EE]/85 text-[#123524] shadow-[0_8px_28px_rgba(18,53,36,0.08)] backdrop-blur-xl md:min-h-[104px]"><div className="mx-auto flex min-h-[80px] max-w-[1440px] items-center justify-between gap-3 px-4 min-[393px]:px-5 md:min-h-[104px]"><a href="#beranda" className="group flex shrink-0 items-center gap-3 font-display text-2xl font-bold md:gap-4"><Image src="/AFA LOGO.svg" alt="AFA STORE" width={96} height={144} className="h-16 w-12 shrink-0 object-contain transition-transform duration-300 group-hover:scale-105 md:h-24 md:w-16" priority sizes="(max-width: 767px) 48px, 64px" /><span className="hidden leading-none md:inline">AFA STORE</span></a><div className="hidden flex-1 items-center rounded-full border border-[#C9A45B]/20 bg-white/80 px-5 py-2.5 shadow-sm md:flex"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari bawang goreng, parcel, atau rasa favorit..." className="w-full bg-transparent text-sm outline-none placeholder:text-[#8B6B3F]/70" /><Search size={18} className="text-[#C9A45B]" /></div><div className="flex shrink-0 items-center gap-1.5"><button onClick={() => setDark((current) => !current)} aria-label={dark ? "Switch to light mode" : "Night Mode"} title="Night Mode" aria-pressed={dark} className="theme-toggle group relative flex h-10 items-center gap-2 rounded-full border border-[#C9A45B]/30 bg-[#123524]/8 px-3 text-[#123524] shadow-sm transition hover:-translate-y-0.5 hover:border-[#C9A45B] hover:bg-[#C9A45B]/15 md:h-11 md:px-3.5">{dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}<span className="hidden text-xs font-bold tracking-wide md:inline">{dark ? "Light" : "Night"}</span><span role="tooltip" className="theme-tooltip">Night Mode</span></button><Link href="/account" aria-label="Akun" className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10"><User size={20} /></Link>{whatsappUrl() && <a href={whatsappUrl()!} target="_blank" rel="noopener noreferrer" aria-label="Pesan via WhatsApp" className="hidden rounded-full px-3 py-2 text-sm font-bold hover:bg-[#C9A45B]/10 sm:inline-flex">Pesan</a>}<Link href="/wishlist" aria-label="Wishlist" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10"><Heart size={20} />{wishlistCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{wishlistCount}</span>}</Link><button onClick={() => void openCart()} aria-label="Keranjang" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10"><ShoppingCart size={20} /><span className="absolute -right-1 -top-1 rounded-full bg-[#C9A45B] px-1.5 text-[10px] font-bold text-white">{cartItemCount}</span></button><AdminButton /><button onClick={() => setMobileMenuOpen(true)} aria-label="Buka menu" className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10 md:hidden"><Menu size={22} /></button></div></div></header>
    <section id="beranda" className="relative mt-0 overflow-hidden bg-[radial-gradient(circle_at_82%_18%,rgba(201,164,91,0.42),transparent_30%),radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.92),transparent_34%),linear-gradient(135deg,#FFFDF8_0%,#F8F5EE_50%,#FBF7EC_100%)] pt-4 text-[#123524]"><HeroDecor spicy /><div className="absolute right-[-30px] top-[30px] h-[240px] w-[240px] rounded-full bg-[#C9A45B]/25 blur-[90px]" /><div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(#123524_1px,transparent_1px),linear-gradient(90deg,#123524_1px,transparent_1px)] [background-size:22px_22px]" /><AnimatePresence mode="wait" custom={heroSlideDirection}><motion.div key={heroCategory} custom={heroSlideDirection} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="relative z-10 mx-auto grid min-h-[560px] w-full max-w-[1440px] grid-cols-[62%_38%] items-start gap-2 px-5 pb-10 pt-4 md:min-h-[640px] md:grid-cols-2 md:items-center md:gap-6 lg:grid-cols-[1.1fr_0.9fr]"><div className="relative z-20 max-w-[240px] text-left md:max-w-md md:pt-12"><span className="inline-flex rounded-full border border-[#C9A45B]/30 bg-white/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C9A45B] shadow-sm backdrop-blur md:px-4 md:py-2 md:text-xs">{activeHero.badge}</span><h1 className="mt-4 font-display uppercase leading-none tracking-[-1px]"><span className="block text-[44px] font-bold min-[390px]:text-5xl md:text-7xl">{activeHero.title[0]}</span><span className="block text-[30px] font-bold leading-none md:text-5xl">{activeHero.title[1]}</span></h1><p className="mt-4 max-w-[220px] text-base leading-[1.75] text-[#43503f] md:max-w-sm md:text-lg">{activeHero.description}</p><div className="mt-6 grid w-full gap-4"><motion.a whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={(event) => { if (!whatsappUrl()) { event.preventDefault(); scrollToSection(heroTargetRef); } }} href={whatsappUrl() || "#katalog"} target={whatsappUrl() ? "_blank" : undefined} rel={whatsappUrl() ? "noopener noreferrer" : undefined} className="inline-flex min-h-[58px] w-full items-center justify-center rounded-full bg-[#C9A45B] px-6 py-3 text-center text-base font-bold leading-normal text-white shadow-[0_18px_38px_rgba(201,164,91,0.34)] transition-all hover:bg-[#A7833A] md:text-lg">Pesan Sekarang</motion.a><motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={() => scrollToSection(heroTargetRef)} className="h-[58px] w-full rounded-full border border-[#C9A45B] bg-white/60 px-5 text-sm font-bold text-[#123524] shadow-[0_16px_34px_rgba(18,53,36,0.10)] backdrop-blur transition-all hover:bg-[#C9A45B]/10">Lihat Katalog</motion.button></div><div className="mt-5 flex items-center gap-2" aria-label="Pilih slide hero">{heroOrder.map((category) => <button key={category} type="button" onClick={() => goToHeroSlide(category)} aria-label={`Slide ${heroContent[category].badge}`} className={`h-2.5 rounded-full transition-all ${heroCategory === category ? "w-8 bg-[#C9A45B] shadow-[0_8px_18px_rgba(201,164,91,0.35)]" : "w-2.5 bg-[#123524]/20 hover:bg-[#C9A45B]/60"}`} />)}</div></div><div className="relative z-20 mt-14 flex justify-center self-start md:mt-0 md:translate-y-[-10px] md:self-center lg:justify-end"><HeroShowcase src={activeHero.image} /></div></motion.div></AnimatePresence></section>
    <section className="relative z-10 mx-auto -mt-1 grid max-w-6xl grid-cols-2 gap-3 px-5 md:grid-cols-4"><Info icon={<Truck />} title="Pengiriman Cepat" desc="" /><Info icon={<Shield />} title="Aman" desc="" /><Info icon={<Star />} title="HAMPERS" desc="" /><Info icon={<Headphones />} title="Support" desc="" /></section><section className="mx-auto grid max-w-6xl grid-cols-2 gap-5 px-5 py-20 md:grid-cols-5">{[["Bawang Goreng", "ON", "bawang"], ["Parcel", "GIFT", "parcel"], ["Paket Oleh-Oleh", "GIFT", "oleh"], ["Best Seller", "TOP", "bawang"], ["Produk Baru", "NEW", "bawang"]].map(([name, icon, category]) => <motion.button type="button" onClick={() => selectHeroCategory(category as HeroCategory)} whileHover={{ y: -8, scale: 1.02 }} key={name} className="luxury-card rounded-3xl p-6 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#F8F5EE] text-xl font-bold text-[#C9A45B]">{icon}</div><p className="mt-3 font-bold text-[#123524]">{name}</p></motion.button>)}</section>
    <section id="katalog" ref={katalogRef} className="product-section mx-auto max-w-[1440px] px-5 pb-28 pt-20 md:pb-20"><SectionTitle title="Semua Produk" /><div className="mb-6 flex gap-3 overflow-x-auto pb-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari bawang goreng..." className="min-w-56 rounded-full border border-[#C9A45B]/25 bg-white px-5 py-2.5 text-sm shadow-sm outline-none" /><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-full border border-[#C9A45B]/25 bg-white px-4 py-2 text-sm text-[#123524] shadow-sm"><option>Semua</option><option>Bawang Goreng</option><option>Parcel</option><option>Lainnya</option></select><select onChange={(e) => setSort(e.target.value)} className="rounded-full border border-[#C9A45B]/25 bg-white px-4 py-2 text-sm text-[#123524] shadow-sm"><option value="featured">Rating terbaik</option><option value="low">Harga termurah</option><option value="high">Harga tertinggi</option></select>{productSizes.map((s) => <span key={s} className="shrink-0 rounded-full bg-white px-4 py-2 text-sm text-[#8B6B3F] shadow-sm">{s}</span>)}</div><ProductGrid loading={productsLoading} error={productsError} products={visibleProducts} isWishlisted={isWishlisted} toggleWishlist={toggleWishlist} addCart={addCart} buyNow={buyNow} setPreview={setPreview} setZoom={setZoom} onRetry={loadProducts} /></section>
    <section ref={parcelRef} id="parcel" className="product-section mx-auto max-w-[1440px] px-5 pb-28 pt-20 md:pb-20"><SectionTitle title="Parcel" id="parcel-title" subtitle="Pilihan parcel spesial untuk berbagai momen istimewa" /><ProductGrid loading={productsLoading} error={productsError} products={parcelProducts} parcel isWishlisted={isWishlisted} toggleWishlist={toggleWishlist} addCart={addCart} buyNow={buyNow} setPreview={setPreview} setZoom={setZoom} onRetry={loadProducts} /></section><Promo /><TestimonialsSection /><FAQ /><Footer /><Floating onCart={openCart} /><CartDrawer open={cartOpen} cart={cart} subtotal={subtotal} totalItems={totalItems} checkoutPending={checkoutPending} checkoutError={checkoutError} itemState={itemState} onClose={() => setCartOpen(false)} onCheckout={continueToCheckout} increaseQty={increaseQty} decreaseQty={decreaseQty} removeFromCart={removeFromCart} clearCart={clearCart} />
  </main>;
}

function ProductGrid({ loading, error, products, isWishlisted, toggleWishlist, addCart, buyNow, setPreview, setZoom, onRetry, parcel = false }: { loading: boolean; error: string; products: Product[]; parcel?: boolean; isWishlisted: (id: string) => boolean; toggleWishlist: (item: Product) => void; addCart: (item: Product) => void; buyNow: (item: Product) => void; setPreview: (preview: { src: string; name: string }) => void; setZoom: (zoom: number) => void; onRetry: () => void }) {
  if (loading) return <div aria-label="Memuat produk" aria-busy="true" className="product-grid grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="luxury-card overflow-hidden rounded-3xl"><div className="skeleton aspect-square" /><div className="space-y-3 p-4"><div className="skeleton h-5 w-3/4 rounded-full" /><div className="skeleton h-4 w-1/2 rounded-full" /><div className="skeleton h-11 rounded-2xl" /></div></div>)}</div>;
  if (error) return <div role="alert" className="luxury-card rounded-3xl p-8 text-center md:p-12"><h3 className="font-display text-2xl font-bold">Produk sedang mengalami gangguan.</h3><p className="mt-2 text-[#8B6B3F]">Silakan coba lagi beberapa saat.</p><button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-full bg-[#123524] px-6 py-3 font-bold text-white">Coba Lagi</button></div>;
  if (!products.length) return <div className="luxury-card rounded-3xl p-8 text-center md:p-12"><h3 className="font-display text-2xl font-bold">{parcel ? "Parcel AFA" : "Belum ada produk yang sesuai."}</h3><p className="mx-auto mt-2 max-w-lg text-[#8B6B3F]">{parcel ? "Pilihan parcel akan tampil di sini saat tersedia." : "Coba kata kunci atau kategori lain untuk menemukan produk favorit Anda."}</p><a href="#katalog" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#123524]/20 px-6 py-3 font-bold">{parcel ? "Jelajahi Produk" : "Reset Filter"}</a></div>;
  return <div className="product-grid grid auto-rows-fr grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{products.map((p) => <ProductCard key={p.id} item={p} wish={isWishlisted(p.id)} onWish={() => toggleWishlist(p)} onAdd={() => addCart(p)} onBuy={() => buyNow(p)} onPreview={() => { setPreview({ src: p.image, name: p.name }); setZoom(1); }} />)}</div>;
}
function MobileMenu({ open, onClose, onSelectCategory }: { open: boolean; onClose: () => void; onSelectCategory: (category: HeroCategory) => void }) { const handleClick = (name: string) => { if (name === "Parcel") onSelectCategory("parcel"); if (name === "Bawang Goreng") onSelectCategory("bawang"); onClose(); }; return <AnimatePresence>{open && <motion.aside initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }} className="fixed right-0 top-0 z-90 h-full w-full max-w-xs overflow-auto bg-[#F8F4EC] p-6 text-[#2E2A26] shadow-2xl md:hidden"><div className="mb-6 flex items-center justify-between"><b className="text-2xl text-[#C8A45D]">Menu</b><button onClick={onClose} aria-label="Tutup menu" className="rounded-full p-2 hover:bg-[#C8A45D]/10"><X /></button></div><nav className="grid gap-3">{nav.map((n) => <a key={n} onClick={() => handleClick(n)} href={`#${n.toLowerCase().replaceAll(" ", "-")}`} className="rounded-2xl bg-white px-4 py-3 font-bold shadow-sm hover:bg-[#C8A45D]/10 hover:text-[#C8A45D]">{n}</a>)}</nav></motion.aside>}</AnimatePresence>; }

function Info({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) { return <div className="luxury-card flex items-center gap-4 rounded-3xl p-5"><span className="text-[#C8A45D]">{icon}</span><div><b>{title}</b><p className="text-sm text-[#8B6B3F]">{desc}</p></div></div>; }
function SectionTitle({ title, id, subtitle }: { title: string; id?: string; subtitle?: string }) { return <div className="mb-6 flex items-end justify-between gap-4"><div><h2 id={id} className="font-display text-3xl font-bold uppercase text-[#2E2A26]">{title}</h2>{subtitle && <p className="mt-2 text-sm text-[#8B6B3F] sm:text-base">{subtitle}</p>}</div><a href="#katalog" className="flex shrink-0 items-center gap-1 text-sm text-[#8B6B3F] hover:text-[#C8A45D]">Lihat Semua <ChevronRight size={16} /></a></div>; }
function HeroShowcase({ src }: { src: string }) { return <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} whileHover={{ scale: 1.02 }} className="relative z-20 aspect-square w-[180px] max-w-full overflow-visible border-none bg-transparent shadow-none min-[390px]:w-[220px] md:w-[340px] lg:w-[460px]"><div className="absolute left-1/2 top-1/2 h-[190px] w-[190px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C9A45B] opacity-[0.22] blur-[70px] md:h-[260px] md:w-[260px] md:blur-[90px]" /><OnionDecor /><HeroProduct src={src} /></motion.div>; }
function HeroProduct({ src }: { src: string }) {
  const [imageSrc, setImageSrc] = useState(src || "/products/parcel.png");

  useEffect(() => {
    setImageSrc(src || "/products/parcel.png");
  }, [src]);

  return <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }} className="relative z-20 aspect-square h-auto w-full overflow-visible border-none bg-transparent shadow-none"><Image src={imageSrc} alt="AFA Store produk premium" fill quality={75} sizes="(max-width: 767px) 220px, (max-width: 1023px) 340px, 460px" className="bg-transparent object-contain object-center drop-shadow-[0_28px_40px_rgba(18,53,36,0.18)]" priority onError={() => setImageSrc("/products/parcel.png")} /></motion.div>;
}
function OnionDecor() { return <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0"><motion.span animate={{ y: [0, -10, 0], rotate: [-28, -18, -28] }} transition={{ repeat: Infinity, duration: 5.2 }} className="absolute right-[8%] top-[16%] h-5 w-8 rounded-[999px] border-2 border-[#C06D4B]/55 bg-[#F7D6C7]/70 blur-[0.2px]" /><motion.span animate={{ y: [0, 8, 0], rotate: [22, 34, 22] }} transition={{ repeat: Infinity, duration: 4.8 }} className="absolute left-[5%] top-[28%] h-3 w-6 rounded-full bg-[#C9A45B]/65 shadow-[0_10px_22px_rgba(201,164,91,0.24)]" /><motion.span animate={{ y: [0, -7, 0], rotate: [-18, -30, -18] }} transition={{ repeat: Infinity, duration: 5.8 }} className="absolute bottom-[24%] right-[2%] h-3 w-7 rounded-full bg-[#A45B35]/50" /><motion.span animate={{ y: [0, 9, 0], rotate: [31, 18, 31] }} transition={{ repeat: Infinity, duration: 4.4 }} className="absolute bottom-[12%] left-[18%] h-2.5 w-5 rounded-full bg-[#C9A45B]/70" /><motion.span animate={{ y: [0, -6, 0], rotate: [12, 26, 12] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute left-[30%] top-[6%] h-2 w-4 rounded-full bg-[#B87945]/45" /><motion.span animate={{ y: [0, 7, 0], rotate: [-10, -22, -10] }} transition={{ repeat: Infinity, duration: 4.6 }} className="absolute bottom-[38%] left-[0%] h-2 w-5 rounded-full bg-[#E3BC6B]/70" /></div>; }
function HeroDecor({ spicy }: { spicy: boolean }) { return <div aria-hidden="true" className="pointer-events-none absolute inset-0"><motion.span animate={{ y: [0, -14, 0], rotate: [18, 28, 18] }} transition={{ repeat: Infinity, duration: 6 }} className="absolute left-[6%] top-[18%] text-5xl opacity-30">✦</motion.span><motion.span animate={{ y: [0, 12, 0], rotate: [-12, -24, -12] }} transition={{ repeat: Infinity, duration: 7 }} className="absolute bottom-[13%] left-[45%] text-4xl text-[#C8A45D]/40">◆</motion.span>{spicy && <motion.span animate={{ y: [0, -16, 0], rotate: [20, 32, 20] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute right-[8%] top-[15%] text-5xl text-[#C8A45D]/45">✧</motion.span>}<div className="absolute right-[18%] top-[20%] h-64 w-64 rounded-full bg-[#C8A45D]/25 blur-3xl" /><div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-white/80 blur-3xl" /></div>; }
function WishlistToast({ message }: { message: string }) { return <AnimatePresence>{message && <motion.div initial={{ opacity: 0, y: -18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -18, scale: 0.96 }} className="fixed left-1/2 top-5 z-100 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-full border border-[#C8A45D]/30 bg-white px-5 py-3 text-center font-semibold text-[#2E2A26] shadow-[0_18px_45px_rgba(46,42,38,0.16)]">{message}</motion.div>}</AnimatePresence>; }
function ProductCard({ item, onAdd, onBuy, onWish, wish, onPreview }: { item: Product; onAdd: () => void; onBuy: () => void; onWish?: () => void; wish?: boolean; onPreview: () => void }) { const categoryClass = item.category === "Parcel" ? "bg-orange-100 text-orange-700" : item.category === "Bawang Goreng" ? "bg-emerald-100 text-emerald-700" : "bg-[#F8F5EE] text-[#8B6B3F]"; return <motion.article initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -6, scale: 1.01 }} className="luxury-card product-card flex h-full min-w-0 flex-col overflow-hidden rounded-[24px] text-[#2E2A26] transition"><div className="p-3 pb-0 md:p-4 md:pb-0"><div className="relative"><button onClick={onPreview} className="relative block aspect-square w-full overflow-hidden rounded-[24px] bg-linear-to-br from-[#FFF8EA] via-white to-[#EFE6D5] text-left"><ProductImage src={item.image} alt={item.name} sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" />{item.badge && <b className="absolute left-3 top-3 rounded-full bg-[#C8A45D] px-3 py-1 text-xs text-white">{item.badge}</b>}<span className="absolute bottom-3 left-3 rounded-full bg-[#2E2A26]/80 px-3 py-1 text-xs font-bold text-white">Lihat gambar</span></button><motion.button whileHover={{ scale: 1.14 }} whileTap={{ scale: 0.86 }} onClick={onWish} aria-label={wish ? `Hapus ${item.name} dari wishlist` : `Tambah ${item.name} ke wishlist`} className="absolute right-3 top-3 grid rounded-full bg-white p-2 shadow"><Heart fill={wish ? "#ef4444" : "none"} className={wish ? "text-red-500" : "text-[#C8A45D]"} /></motion.button></div></div><div className="product-card-info flex flex-1 flex-col px-3 pt-4 md:px-4"><h3 className="product-card-title min-h-[3.25rem] font-display text-lg font-bold leading-tight md:min-h-[3.5rem] md:text-xl">{item.name}</h3><p className="text-sm text-[#C8A45D]">★★★★★ <span className="text-[#8B6B3F]">{item.rating > 0 ? item.rating.toFixed(1) : "Baru"}</span></p><div className="mt-2 flex items-center justify-between gap-2"><p className="font-bold text-[#8B6B3F]">{formatRupiah(item.price)}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${categoryClass}`}>{item.category}</span></div><div className="mt-auto grid gap-2 pt-4"><button onClick={onAdd} className="min-h-11 rounded-full border border-[#C8A45D]/40 font-bold text-[#8B6B3F] transition hover:bg-[#FFF8EA]">+ Keranjang</button><button onClick={onBuy} className="min-h-11 rounded-full bg-[#123524] font-bold text-white transition hover:bg-[#315d45]">Beli Sekarang</button></div></div></motion.article>; }
function ImagePreview({ preview, zoom, onZoomIn, onZoomOut, onClose }: { preview: { src: string; name: string } | null; zoom: number; onZoomIn: () => void; onZoomOut: () => void; onClose: () => void }) { return <AnimatePresence>{preview && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 grid place-items-center bg-[#2E2A26]/85 p-4 backdrop-blur-md"><div className="w-full max-w-5xl overflow-hidden rounded-4xl bg-white p-4 text-[#2E2A26] shadow-2xl"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#C8A45D]">Preview Produk</p><h3 className="font-display text-2xl font-bold">{preview.name}</h3></div><div className="flex items-center gap-2"><button onClick={onZoomOut} className="rounded-full border border-[#C8A45D]/30 px-4 py-2 font-bold">-</button><span className="min-w-14 text-center font-bold">{Math.round(zoom * 100)}%</span><button onClick={onZoomIn} className="rounded-full border border-[#C8A45D]/30 px-4 py-2 font-bold">+</button><button onClick={onClose} className="rounded-full bg-[#C8A45D] p-3 text-white"><X /></button></div></div><div className="relative h-[70vh] overflow-auto rounded-3xl bg-[#FFF8EA]"><div className="relative mx-auto h-full min-h-105 w-full transition-transform duration-300" style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}><Image src={preview.src} alt={preview.name} fill sizes="100vw" className="object-contain" priority /></div></div></div></motion.div>}</AnimatePresence>; }
function Promo() { return <section id="promo" className="section-shell grid gap-6 py-12 md:grid-cols-[1.2fr_0.8fr]"><div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#123524,#315d45)] p-7 text-white shadow-[0_24px_70px_rgba(18,53,36,0.18)] sm:p-10"><p className="text-sm font-bold uppercase tracking-[0.22em] text-[#E4C982]">Inspirasi AFA</p><h2 className="mt-3 max-w-lg font-display text-4xl font-bold sm:text-5xl">Temukan Rasa Favoritmu</h2><p className="mt-4 max-w-xl text-white/75">Lengkapi setiap hidangan dengan pilihan rasa AFA yang tersedia.</p><a href="#katalog" className="mt-7 inline-flex min-h-11 items-center rounded-full bg-[#C9A45B] px-6 py-3 font-bold text-white">Lihat Produk</a><Image src="/products/bawang goreng original.jpg" alt="Produk AFA" width={220} height={220} className="absolute -bottom-14 -right-10 hidden rotate-6 rounded-full object-contain opacity-80 sm:block" /></div><div className="luxury-card rounded-[32px] p-7 sm:p-10"><p className="text-sm font-bold uppercase tracking-[0.22em] text-[#C9A45B]">Kabar dari AFA</p><h3 className="mt-3 font-display text-3xl font-bold">Jadilah yang pertama tahu.</h3><p className="mt-3 text-[#8B6B3F]">Fitur berlangganan belum tersedia. Anda tetap dapat menjelajahi produk terbaru di katalog.</p><label className="mt-6 block text-sm font-semibold" htmlFor="newsletter-email">Email</label><input id="newsletter-email" type="email" disabled aria-describedby="newsletter-note" className="mt-2 min-h-12 w-full rounded-full border border-[#C8A45D]/25 px-5 disabled:cursor-not-allowed disabled:opacity-60" placeholder="nama@email.com" /><p id="newsletter-note" className="mt-2 text-xs text-[#8B6B3F]">Pendaftaran email akan tersedia setelah layanan berlangganan aktif.</p></div></section>; }
function FAQ() { const qs = ["Apakah tanpa tepung?", "Berapa lama tahan?", "Apakah bisa COD?", "Apakah bisa kirim seluruh Indonesia?", "Apakah bisa custom parcel?"]; return <section id="faq" className="mx-auto max-w-4xl px-4 py-10"><SectionTitle title="FAQ" />{qs.map((q) => <details key={q} className="luxury-card mb-3 rounded-2xl p-5"><summary className="cursor-pointer font-bold">{q}</summary><p className="mt-3 text-[#8B6B3F]">Ya, tim AFA STORE siap membantu kebutuhan Anda dengan kualitas premium.</p></details>)}</section>; }
function Footer() { return <footer id="kontak" className="mt-12 bg-[#17251d] text-white"><div className="section-shell grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]"><div><Image src="/AFA LOGO.svg" alt="AFA FOOD" width={64} height={84} className="mb-4 h-16 w-auto object-contain" /><h2 className="font-display text-3xl font-bold text-[#E4C982]">AFA FOOD</h2><p className="mt-3 max-w-sm text-white/65">Rasa premium untuk setiap hidangan.</p></div><nav aria-label="Navigasi footer"><h3 className="font-bold">Jelajahi</h3><div className="mt-4 grid gap-3 text-white/70"><a href="#katalog">Produk</a><a href="#parcel">Parcel</a><a href="#tentang-kami">Tentang</a><a href="#faq">Bantuan</a></div></nav><div><h3 className="font-bold">AFA Store</h3><p className="mt-4 text-white/70">Cilegon, Banten</p></div></div><div className="border-t border-white/10 py-5 text-center text-sm text-white/50">© AFA FOOD</div></footer>; }
function Floating({ onCart }: { onCart: () => void }) { return <><button onClick={onCart} aria-label="Buka keranjang" className="fixed bottom-[90px] right-[18px] z-40 grid h-14 w-14 place-items-center rounded-full bg-[#2E2A26] text-white shadow-xl transition hover:-translate-y-1 hover:bg-[#8B6B3F]"><ShoppingCart /></button><a href="#beranda" aria-label="Scroll ke atas" className="fixed bottom-5 right-[18px] z-40 grid h-14 w-14 place-items-center rounded-full bg-[#C8A45D] text-white shadow-xl transition hover:-translate-y-1 hover:bg-[#A9853F]"><ArrowUp /></a></>; }
type CartDrawerProps = { open: boolean; cart: CartItem[]; subtotal: number; totalItems: number; checkoutPending: boolean; checkoutError: string; itemState: (id: string) => { pending: boolean; error: string; notice: string }; onClose: () => void; onCheckout: () => void; increaseQty: (id: string) => void; decreaseQty: (id: string) => void; removeFromCart: (id: string) => void; clearCart: () => void };
function CartDrawer({ open, cart, subtotal, totalItems, checkoutPending, checkoutError, itemState, onClose, onCheckout, increaseQty, decreaseQty, removeFromCart, clearCart }: CartDrawerProps) {
  return <AnimatePresence>{open && <motion.aside role="dialog" aria-modal="true" aria-label="Keranjang belanja" className="fixed right-0 top-0 z-90 h-full w-full max-w-md overflow-auto bg-white p-6 text-[#102116] shadow-2xl"><button onClick={onClose} aria-label="Tutup keranjang"><X /></button><h2 className="text-2xl font-bold">Keranjang Belanja</h2>{cart.map((i) => { const state = itemState(i.id); return <div key={i.id} className="my-4 border-b pb-4"><b>{i.name}</b><p>{formatRupiah(i.price)}</p><button disabled={state.pending || i.qty <= 1} onClick={() => decreaseQty(i.id)} aria-label={`Kurangi ${i.name}`}>−</button><span className="mx-3">{i.qty}</span><button disabled={state.pending} onClick={() => increaseQty(i.id)} aria-label={`Tambah ${i.name}`}>+</button><button disabled={state.pending} onClick={() => removeFromCart(i.id)} aria-label={`Hapus ${i.name}`}><Trash2 size={16} /></button>{state.error && <p role="alert">{state.error}</p>}</div>; })}<p className="flex justify-between border-t pt-4"><b>Subtotal</b><b>{formatRupiah(subtotal)}</b></p>{checkoutError && <p role="alert">{checkoutError}</p>}<Link href="/cart" onClick={onClose} className="my-3 block rounded-full border p-3 text-center font-bold">Lihat Keranjang</Link><button onClick={onCheckout} disabled={!cart.length || checkoutPending} className="w-full rounded-full bg-[#14532d] p-3 font-bold text-white">{checkoutPending ? "Menyiapkan checkout…" : "Checkout"}</button><button onClick={clearCart} className="mt-3 w-full text-sm text-red-600">Kosongkan Keranjang</button></motion.aside>}</AnimatePresence>;
}







































































