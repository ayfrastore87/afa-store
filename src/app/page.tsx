"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useScroll, type Variants } from "framer-motion";
import { ArrowUp, ChevronRight, Headphones, Heart, Menu, Minus, Moon, Plus, Search, Shield, ShoppingCart, Star, Sun, Trash2, Truck, User, X } from "lucide-react";
import { CartItem, useCart } from "@/context/cart-context";
import { useWishlist } from "@/context/wishlist-context";
import { formatRupiah, parcels, products, productSizes, testimonials } from "@/lib/data";
const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "6287770000883";
type HeroCategory = "bawang" | "parcel" | "oleh";
const heroOrder: HeroCategory[] = ["bawang", "parcel", "oleh"];
const nav = ["Beranda", "Bawang Goreng", "Parcel", "Promo", "Tentang Kami", "Testimoni", "FAQ", "Kontak"];
const heroContent: Record<HeroCategory, { badge: string; title: string[]; description: string; image: string; target: "katalog" | "parcel" }> = {
  bawang: {
    badge: "BAWANG GORENG",
    title: ["PREMIUM", "BAWANG GORENG"],
    description: "Bawang goreng renyah pilihan dengan aroma harum, rasa gurih, dan kualitas premium untuk setiap hidangan.",
    image: "/products/backround.png",
    target: "katalog",
  },
  parcel: {
    badge: "Premium Parcel",
    title: ["PREMIUM", "PARCEL HAMPERS"],
    description: "Parcel pilihan untuk momen istimewa dengan tampilan elegan dan rasa berkelas.",
    image: "/products/parcel 1.png",
    target: "parcel",
  },
  oleh: {
    badge: "OLEH-OLEH",
    title: ["PAKET OLEH-OLEH", "PREMIUM"],
    description: "Paket oleh-oleh premium AFA berisi pilihan produk favorit yang praktis, elegan, dan siap dibawa untuk keluarga maupun relasi.",
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

function buildCheckoutMessage(cart: CartItem[], subtotal: number, shipping: number, discount: number, total: number) {
  const itemLines = cart.map((item) => `- ${item.name} x${item.qty} = ${formatRupiah(item.price * item.qty)}`).join("\n");

  return [
    "Halo AFA STORE.",
    "",
    "Saya ingin memesan:",
    "",
    itemLines,
    "",
    `Subtotal: ${formatRupiah(subtotal)}`,
    `Ongkir: ${formatRupiah(shipping)}`,
    `Diskon: ${formatRupiah(discount)}`,
    `Total: ${formatRupiah(total)}`,
    "",
    "Nama:",
    "Alamat:",
  ].join("\n");
}

export default function Home() {
  const [cartOpen, setCartOpen] = useState(false), [dark, setDark] = useState(false), [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("Semua"), [sort, setSort] = useState("featured");
  const [heroCategory, setHeroCategory] = useState<HeroCategory>("bawang");
  const [heroSlideDirection, setHeroSlideDirection] = useState(1);
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null), [zoom, setZoom] = useState(1);
  const parcelRef = useRef<HTMLElement | null>(null);
  const katalogRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const { cart, subtotal, addToCart, increaseQty, decreaseQty, removeFromCart } = useCart();
  const { wishlistCount, toast, toggleWishlist, isWishlisted } = useWishlist();
  const { scrollYProgress } = useScroll();
  const cartItemCount = cart.reduce((total, item) => total + item.qty, 0);
  const visibleProducts = useMemo(() => products.filter((p) => (filter === "Semua" || p.category === filter) && p.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : b.rating - a.rating), [filter, query, sort]);
  const addCart = (item: { id: string; name: string; price: number; image: string }) => { addToCart(item); setCartOpen(true); };
  const buyNow = async (item: { id: string; name: string; price: number; image: string }) => {
    const response = await fetch("/api/cart/buy-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, qty: 1 }) });
    const data = await response.json();
    router.push(data.redirectTo || (response.ok ? "/checkout" : "/login"));
  };
  const checkoutWhatsApp = (shipping: number, discount: number) => {
    const finalTotal = subtotal + shipping - discount;
    const message = buildCheckoutMessage(cart, subtotal, shipping, discount, finalTotal);
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, "_blank");
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
    <header className="sticky top-0 z-50 h-[70px] border-b border-[#C9A45B]/15 bg-[#F8F5EE]/85 text-[#123524] shadow-[0_8px_28px_rgba(18,53,36,0.08)] backdrop-blur-xl"><div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-5"><a href="#beranda" className="flex shrink-0 items-center gap-2 font-display text-2xl font-bold"><Image src="/assets/logo.svg" alt="AFA STORE logo" width={42} height={42} priority /><span className="hidden md:inline">AFA STORE</span></a><div className="hidden flex-1 items-center rounded-full border border-[#C9A45B]/20 bg-white/80 px-5 py-2.5 shadow-sm md:flex"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari produk premium..." className="w-full bg-transparent text-sm outline-none placeholder:text-[#8B6B3F]/70" /><Search size={18} className="text-[#C9A45B]" /></div><div className="flex shrink-0 items-center gap-1.5"><button onClick={() => setDark((current) => !current)} aria-label={dark ? "Aktifkan light mode" : "Aktifkan dark mode"} aria-pressed={dark} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10">{dark ? <Sun size={20} /> : <Moon size={20} />}</button><Link href="/account" aria-label="Akun" className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10"><User size={20} /></Link><Link href="/wishlist" aria-label="Wishlist" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10"><Heart size={20} />{wishlistCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{wishlistCount}</span>}</Link><button onClick={() => setCartOpen(true)} aria-label="Keranjang" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10"><ShoppingCart size={20} /><span className="absolute -right-1 -top-1 rounded-full bg-[#C9A45B] px-1.5 text-[10px] font-bold text-white">{cartItemCount}</span></button><button onClick={() => setMobileMenuOpen(true)} aria-label="Buka menu" className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10 md:hidden"><Menu size={22} /></button></div></div></header>
    <section id="beranda" className="relative mt-0 overflow-hidden bg-[radial-gradient(circle_at_82%_18%,rgba(201,164,91,0.42),transparent_30%),radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.92),transparent_34%),linear-gradient(135deg,#FFFDF8_0%,#F8F5EE_50%,#FBF7EC_100%)] pt-4 text-[#123524]"><HeroDecor spicy /><div className="absolute right-[-30px] top-[30px] h-[240px] w-[240px] rounded-full bg-[#C9A45B]/25 blur-[90px]" /><div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(#123524_1px,transparent_1px),linear-gradient(90deg,#123524_1px,transparent_1px)] [background-size:22px_22px]" /><AnimatePresence mode="wait" custom={heroSlideDirection}><motion.div key={heroCategory} custom={heroSlideDirection} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="relative z-10 mx-auto grid min-h-[520px] w-full max-w-7xl grid-cols-[58%_42%] items-center gap-6 px-5 pb-10 pt-4 md:min-h-[640px] md:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr]"><div className="relative z-20 max-w-[220px] text-left md:max-w-md md:pt-12"><span className="inline-flex rounded-full border border-[#C9A45B]/30 bg-white/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C9A45B] shadow-sm backdrop-blur md:px-4 md:py-2 md:text-xs">{activeHero.badge}</span><h1 className="mt-4 font-display uppercase leading-none tracking-[-1px]"><span className="block text-[44px] font-bold min-[390px]:text-5xl md:text-7xl">{activeHero.title[0]}</span><span className="block text-[30px] font-bold leading-none md:text-5xl">{activeHero.title[1]}</span></h1><p className="mt-4 max-w-[220px] text-base leading-[1.75] text-[#43503f] md:max-w-sm md:text-lg">{activeHero.description}</p><div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-[#123524] md:text-xs">{["Premium", "Elegan", "Cepat"].map((feature) => <span key={feature} className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5 shadow-sm"><Shield size={12} className="text-[#C9A45B]" />{feature}</span>)}</div><div className="mt-6 grid w-full gap-4"><motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={() => scrollToSection(heroTargetRef)} className="h-[58px] w-full rounded-full bg-[#C9A45B] px-5 text-sm font-bold text-white shadow-[0_18px_38px_rgba(201,164,91,0.34)] transition-all hover:bg-[#A7833A]">Pesan Sekarang</motion.button><motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={() => scrollToSection(heroTargetRef)} className="h-[58px] w-full rounded-full border border-[#C9A45B] bg-white/60 px-5 text-sm font-bold text-[#123524] shadow-[0_16px_34px_rgba(18,53,36,0.10)] backdrop-blur transition-all hover:bg-[#C9A45B]/10">Lihat Katalog</motion.button></div><div className="mt-5 flex items-center gap-2" aria-label="Pilih slide hero">{heroOrder.map((category) => <button key={category} type="button" onClick={() => goToHeroSlide(category)} aria-label={`Slide ${heroContent[category].badge}`} className={`h-2.5 rounded-full transition-all ${heroCategory === category ? "w-8 bg-[#C9A45B] shadow-[0_8px_18px_rgba(201,164,91,0.35)]" : "w-2.5 bg-[#123524]/20 hover:bg-[#C9A45B]/60"}`} />)}</div></div><div className="relative z-20 flex justify-center self-start translate-x-[10px] -translate-y-[25px] md:translate-y-[-10px] md:self-center lg:justify-end"><HeroShowcase src={activeHero.image} /></div></motion.div></AnimatePresence></section>
    <section className="relative z-10 mx-auto -mt-1 grid max-w-6xl grid-cols-2 gap-3 px-5 md:grid-cols-4"><Info icon={<Truck />} title="Pengiriman Cepat" desc="" /><Info icon={<Shield />} title="Aman" desc="" /><Info icon={<Star />} title="Premium" desc="" /><Info icon={<Headphones />} title="Support" desc="" /></section><section className="mx-auto grid max-w-6xl grid-cols-2 gap-5 px-5 py-20 md:grid-cols-5">{[["Bawang Goreng", "ON", "bawang"], ["Parcel", "GIFT", "parcel"], ["Paket Oleh-Oleh", "GIFT", "oleh"], ["Best Seller", "TOP", "bawang"], ["Produk Baru", "NEW", "bawang"]].map(([name, icon, category]) => <motion.button type="button" onClick={() => selectHeroCategory(category as HeroCategory)} whileHover={{ y: -8, scale: 1.02 }} key={name} className="luxury-card rounded-3xl p-6 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#F8F5EE] text-xl font-bold text-[#C9A45B]">{icon}</div><p className="mt-3 font-bold text-[#123524]">{name}</p></motion.button>)}</section>
    <section ref={katalogRef} id="bawang-goreng" className="mx-auto max-w-7xl px-5 py-20"><SectionTitle title="Produk Bawang Goreng" /><div className="mb-6 flex gap-3 overflow-x-auto pb-2"><select onChange={(e) => setFilter(e.target.value)} className="rounded-full border border-[#C9A45B]/25 bg-white px-4 py-2 text-sm text-[#123524] shadow-sm"><option>Semua</option><option>Original</option><option>Pedas</option><option>Daun Jeruk</option></select><select onChange={(e) => setSort(e.target.value)} className="rounded-full border border-[#C9A45B]/25 bg-white px-4 py-2 text-sm text-[#123524] shadow-sm"><option value="featured">Rating terbaik</option><option value="low">Harga termurah</option><option value="high">Harga tertinggi</option></select>{productSizes.map((s) => <span key={s} className="shrink-0 rounded-full bg-white px-4 py-2 text-sm text-[#8B6B3F] shadow-sm">{s}</span>)}</div><div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{visibleProducts.map((p) => <ProductCard key={p.id} item={p} wish={isWishlisted(p.id)} onWish={() => toggleWishlist(p)} onAdd={() => addCart(p)} onBuy={() => buyNow(p)} onPreview={() => { setPreview({ src: p.image, name: p.name }); setZoom(1); }} />)}</div></section>
    <section ref={parcelRef} id="parcel" className="mx-auto max-w-7xl px-5 py-20"><SectionTitle title="Parcel" /><div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">{parcels.map((p) => <ProductCard key={p.id} item={{ ...p, stock: 30 }} wish={isWishlisted(p.id)} onWish={() => toggleWishlist(p)} onAdd={() => addCart(p)} onBuy={() => buyNow(p)} onPreview={() => { setPreview({ src: p.image, name: p.name }); setZoom(1); }} />)}</div></section><Promo /><Testimonials /><FAQ /><Footer /><Floating onCart={() => setCartOpen(true)} /><CartDrawer open={cartOpen} cart={cart} subtotal={subtotal} onClose={() => setCartOpen(false)} onCheckout={checkoutWhatsApp} increaseQty={increaseQty} decreaseQty={decreaseQty} removeFromCart={removeFromCart} /><MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} onSelectCategory={selectHeroCategory} /><ImagePreview preview={preview} zoom={zoom} onZoomIn={() => setZoom((z) => Math.min(2.5, z + 0.25))} onZoomOut={() => setZoom((z) => Math.max(1, z - 0.25))} onClose={() => setPreview(null)} /></main >;
}

function MobileMenu({ open, onClose, onSelectCategory }: { open: boolean; onClose: () => void; onSelectCategory: (category: HeroCategory) => void }) { const handleClick = (name: string) => { if (name === "Parcel") onSelectCategory("parcel"); if (name === "Bawang Goreng") onSelectCategory("bawang"); onClose(); }; return <AnimatePresence>{open && <motion.aside initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }} className="fixed right-0 top-0 z-90 h-full w-full max-w-xs overflow-auto bg-[#F8F4EC] p-6 text-[#2E2A26] shadow-2xl md:hidden"><div className="mb-6 flex items-center justify-between"><b className="text-2xl text-[#C8A45D]">Menu</b><button onClick={onClose} aria-label="Tutup menu" className="rounded-full p-2 hover:bg-[#C8A45D]/10"><X /></button></div><nav className="grid gap-3">{nav.map((n) => <a key={n} onClick={() => handleClick(n)} href={`#${n.toLowerCase().replaceAll(" ", "-")}`} className="rounded-2xl bg-white px-4 py-3 font-bold shadow-sm hover:bg-[#C8A45D]/10 hover:text-[#C8A45D]">{n}</a>)}</nav></motion.aside>}</AnimatePresence>; }

function Info({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) { return <div className="luxury-card flex items-center gap-4 rounded-3xl p-5"><span className="text-[#C8A45D]">{icon}</span><div><b>{title}</b><p className="text-sm text-[#8B6B3F]">{desc}</p></div></div>; }
function SectionTitle({ title }: { title: string }) { return <div className="mb-6 flex items-center justify-between"><h2 className="font-display text-3xl font-bold uppercase text-[#2E2A26]">{title}</h2><a className="flex items-center gap-1 text-sm text-[#8B6B3F] hover:text-[#C8A45D]">Lihat Semua <ChevronRight size={16} /></a></div>; }
function HeroShowcase({ src }: { src: string }) { return <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} whileHover={{ scale: 1.02 }} className="relative z-20 aspect-square w-[180px] max-w-full overflow-visible border-none bg-transparent shadow-none md:w-[300px] lg:w-[420px]"><div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C9A45B] opacity-[0.22] blur-[90px]" /><OnionDecor /><HeroProduct src={src} /></motion.div>; }
function HeroProduct({ src }: { src: string }) { return <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }} className="relative z-2 aspect-square h-auto w-full overflow-visible border-none bg-transparent shadow-none"><Image src={src} alt="AFA Store produk premium" fill quality={100} sizes="(max-width: 767px) 180px, (max-width: 1023px) 300px, 420px" className="bg-transparent object-contain object-center mix-blend-multiply" priority onError={(e) => { e.currentTarget.style.display = "none"; }} /></motion.div>; }
function OnionDecor() { return <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0"><motion.span animate={{ y: [0, -10, 0], rotate: [-28, -18, -28] }} transition={{ repeat: Infinity, duration: 5.2 }} className="absolute right-[8%] top-[16%] h-5 w-8 rounded-[999px] border-2 border-[#C06D4B]/55 bg-[#F7D6C7]/70 blur-[0.2px]" /><motion.span animate={{ y: [0, 8, 0], rotate: [22, 34, 22] }} transition={{ repeat: Infinity, duration: 4.8 }} className="absolute left-[5%] top-[28%] h-3 w-6 rounded-full bg-[#C9A45B]/65 shadow-[0_10px_22px_rgba(201,164,91,0.24)]" /><motion.span animate={{ y: [0, -7, 0], rotate: [-18, -30, -18] }} transition={{ repeat: Infinity, duration: 5.8 }} className="absolute bottom-[24%] right-[2%] h-3 w-7 rounded-full bg-[#A45B35]/50" /><motion.span animate={{ y: [0, 9, 0], rotate: [31, 18, 31] }} transition={{ repeat: Infinity, duration: 4.4 }} className="absolute bottom-[12%] left-[18%] h-2.5 w-5 rounded-full bg-[#C9A45B]/70" /><motion.span animate={{ y: [0, -6, 0], rotate: [12, 26, 12] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute left-[30%] top-[6%] h-2 w-4 rounded-full bg-[#B87945]/45" /><motion.span animate={{ y: [0, 7, 0], rotate: [-10, -22, -10] }} transition={{ repeat: Infinity, duration: 4.6 }} className="absolute bottom-[38%] left-[0%] h-2 w-5 rounded-full bg-[#E3BC6B]/70" /></div>; }
function HeroDecor({ spicy }: { spicy: boolean }) { return <div aria-hidden="true" className="pointer-events-none absolute inset-0"><motion.span animate={{ y: [0, -14, 0], rotate: [18, 28, 18] }} transition={{ repeat: Infinity, duration: 6 }} className="absolute left-[6%] top-[18%] text-5xl opacity-30">✦</motion.span><motion.span animate={{ y: [0, 12, 0], rotate: [-12, -24, -12] }} transition={{ repeat: Infinity, duration: 7 }} className="absolute bottom-[13%] left-[45%] text-4xl text-[#C8A45D]/40">◆</motion.span>{spicy && <motion.span animate={{ y: [0, -16, 0], rotate: [20, 32, 20] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute right-[8%] top-[15%] text-5xl text-[#C8A45D]/45">✧</motion.span>}<div className="absolute right-[18%] top-[20%] h-64 w-64 rounded-full bg-[#C8A45D]/25 blur-3xl" /><div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-white/80 blur-3xl" /></div>; }
function WishlistToast({ message }: { message: string }) { return <AnimatePresence>{message && <motion.div initial={{ opacity: 0, y: -18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -18, scale: 0.96 }} className="fixed left-1/2 top-5 z-100 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-full border border-[#C8A45D]/30 bg-white px-5 py-3 text-center font-semibold text-[#2E2A26] shadow-[0_18px_45px_rgba(46,42,38,0.16)]">{message}</motion.div>}</AnimatePresence>; }
function ProductCard({ item, onAdd, onBuy, onWish, wish, onPreview }: { item: { id: string; name: string; price: number; reviews: number; rating?: number; stock?: number; badge?: string; image: string }; onAdd: () => void; onBuy: () => void; onWish?: () => void; wish?: boolean; onPreview: () => void }) { return <motion.article initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -6, scale: 1.01 }} className="luxury-card rounded-[24px] p-3 text-[#2E2A26] transition md:p-4"><button onClick={onPreview} className="relative block aspect-square w-full overflow-hidden rounded-[24px] bg-linear-to-br from-[#FFF8EA] via-white to-[#EFE6D5] text-left"><Image src={item.image} alt={item.name} fill sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" className="object-contain p-3 transition duration-500 hover:scale-105" />{item.badge && <b className="absolute left-3 top-3 rounded-full bg-[#C8A45D] px-3 py-1 text-xs text-white">Best Seller</b>}<span className="absolute bottom-3 left-3 rounded-full bg-[#2E2A26]/80 px-3 py-1 text-xs font-bold text-white">Lihat gambar</span></button><motion.button whileHover={{ scale: 1.14 }} whileTap={{ scale: 0.86 }} onClick={onWish} aria-label={wish ? `Hapus ${item.name} dari wishlist` : `Tambah ${item.name} ke wishlist`} className="relative -mt-[calc(100%-12px)] ml-auto mr-3 grid rounded-full bg-white p-2 shadow"><Heart fill={wish ? "#ef4444" : "none"} className={wish ? "text-red-500" : "text-[#C8A45D]"} /></motion.button><h3 className="mt-[calc(100%-2rem)] font-display text-lg font-bold leading-tight md:text-xl">{item.name}</h3><p className="text-sm text-[#C8A45D]">★★★★★ <span className="text-[#8B6B3F]">({item.reviews})</span></p><p className="mt-2 text-lg font-bold md:text-xl">{formatRupiah(item.price)}</p><p className="text-sm text-[#8B6B3F]">Stok {item.stock ?? 20} - Quick View</p><div className="mt-5 flex items-center gap-3"><motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }} onClick={onAdd} aria-label={`Tambah ${item.name} ke keranjang`} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#C8A45D] text-white shadow-[0_12px_24px_rgba(200,164,93,0.22)] hover:bg-[#A9853F] md:h-14 md:w-14"><ShoppingCart size={20} /></motion.button><motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }} onClick={onBuy} className="flex h-12 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-2xl border border-[#C8A45D] px-3 text-center text-sm font-bold text-[#8B6B3F] hover:bg-[#C8A45D]/10 md:h-14 md:px-5 md:text-base">Beli Sekarang</motion.button></div></motion.article>; }
function ImagePreview({ preview, zoom, onZoomIn, onZoomOut, onClose }: { preview: { src: string; name: string } | null; zoom: number; onZoomIn: () => void; onZoomOut: () => void; onClose: () => void }) { return <AnimatePresence>{preview && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 grid place-items-center bg-[#2E2A26]/85 p-4 backdrop-blur-md"><div className="w-full max-w-5xl overflow-hidden rounded-4xl bg-white p-4 text-[#2E2A26] shadow-2xl"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#C8A45D]">Preview Produk</p><h3 className="font-display text-2xl font-bold">{preview.name}</h3></div><div className="flex items-center gap-2"><button onClick={onZoomOut} className="rounded-full border border-[#C8A45D]/30 px-4 py-2 font-bold">-</button><span className="min-w-14 text-center font-bold">{Math.round(zoom * 100)}%</span><button onClick={onZoomIn} className="rounded-full border border-[#C8A45D]/30 px-4 py-2 font-bold">+</button><button onClick={onClose} className="rounded-full bg-[#C8A45D] p-3 text-white"><X /></button></div></div><div className="relative h-[70vh] overflow-auto rounded-3xl bg-[#FFF8EA]"><div className="relative mx-auto h-full min-h-105 w-full transition-transform duration-300" style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}><Image src={preview.src} alt={preview.name} fill sizes="100vw" className="object-contain" priority /></div></div></div></motion.div>}</AnimatePresence>; }
function Promo() { return <section id="promo" className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:grid-cols-2"><div className="rounded-4xl bg-[linear-gradient(135deg,#2E2A26,#8B6B3F)] p-10 text-white shadow-[0_24px_70px_rgba(46,42,38,0.18)]"><p className="text-[#E4C982]">FLASH SALE</p><h2 className="font-display text-5xl font-bold">Diskon 20%</h2><p>Gratis ongkir dan Beli 3 Gratis 1 untuk semua produk tertentu.</p><div className="mt-6 flex flex-wrap gap-3">{[["02", "Hari"], ["14", "Jam"], ["25", "Menit"], ["36", "Detik"]].map(([a, b]) => <div key={b} className="rounded-xl border border-[#C8A45D]/35 bg-white/10 p-4 text-center"><b className="text-2xl">{a}</b><p>{b}</p></div>)}</div></div><div className="luxury-card rounded-4xl p-10"><h3 className="font-display text-3xl font-bold">Newsletter & Instagram Feed</h3><p className="text-[#8B6B3F]">Dapatkan resep bawang goreng, promo parcel, dan inspirasi hadiah premium.</p><input className="mt-6 w-full rounded-full border border-[#C8A45D]/25 px-5 py-3 text-[#2E2A26]" placeholder="Masukkan email Anda" /></div></section>; }
function Testimonials() { return <section id="testimoni" className="overflow-hidden py-10"><div className="mx-auto max-w-7xl px-4"><SectionTitle title="Testimoni Pelanggan" /></div><div className="flex w-max gap-5 animate-marquee">{[...testimonials, ...testimonials].map((t, i) => <div key={i} className="luxury-card w-80 rounded-3xl p-6 text-[#2E2A26]"><div className="mb-3 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#C8A45D] text-white">{t[0][0]}</div><div><b>{t[0]}</b><p className="text-sm text-[#8B6B3F]">{t[1]}</p></div></div><p className="text-[#C8A45D]">★★★★★</p><p>&quot;{t[2]}&quot;</p></div>)}</div></section>; }
function FAQ() { const qs = ["Apakah tanpa tepung?", "Berapa lama tahan?", "Apakah bisa COD?", "Apakah bisa kirim seluruh Indonesia?", "Apakah bisa custom parcel?"]; return <section id="faq" className="mx-auto max-w-4xl px-4 py-10"><SectionTitle title="FAQ" />{qs.map((q) => <details key={q} className="luxury-card mb-3 rounded-2xl p-5"><summary className="cursor-pointer font-bold">{q}</summary><p className="mt-3 text-[#8B6B3F]">Ya, tim AFA STORE siap membantu kebutuhan Anda dengan kualitas premium.</p></details>)}</section>; }
function Footer() { return <footer id="kontak" className="bg-[#2E2A26] px-4 py-12 text-white"><div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-4"><div><h2 className="font-display text-4xl font-bold text-[#C8A45D]">AFA STORE</h2><p className="text-white/75">Pusat bawang goreng premium dan parcel berkualitas.</p></div><div><b>Menu</b><p className="text-white/75">Beranda<br />Bawang Goreng<br />Parcel<br />Promo</p></div><div><b>Kontak Kami</b><p className="text-white/75">WhatsApp 0877-7000-0883<br />Instagram @afa.store.id<br />TikTok @afastore<br />Facebook AFA STORE</p></div><div><b>Google Maps</b><div className="mt-3 rounded-2xl bg-white/10 p-8 text-white/75">AFA STORE, Cilegon Banten</div></div></div></footer>; }
function WhatsAppIcon() { return <svg viewBox="0 0 32 32" aria-hidden="true" className="h-8 w-8"><path fill="currentColor" d="M16 3C8.8 3 3 8.8 3 15.9c0 2.3.6 4.5 1.7 6.5L3.1 29l6.8-1.6c1.9 1 4 1.5 6.1 1.5 7.2 0 13-5.8 13-12.9S23.2 3 16 3Zm0 23.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4 .9 1-3.9-.3-.4c-1.1-1.7-1.7-3.7-1.7-5.8 0-5.9 4.8-10.7 10.7-10.7s10.7 4.8 10.7 10.7S21.9 26.7 16 26.7Zm5.9-8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.5-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.9-.8 2.1-1.5.3-.7.3-1.3.2-1.5-.1-.1-.3-.2-.6-.4Z" /></svg>; }
function Floating({ onCart }: { onCart: () => void }) { return <><a href={`https://wa.me/${waNumber}`} aria-label="Chat WhatsApp" className="fixed bottom-[90px] right-[18px] z-40 grid h-14 w-14 animate-float-luxury place-items-center rounded-full bg-linear-to-br from-[#35f17b] via-[#20c767] to-[#075e54] text-white shadow-2xl ring-4 ring-white/70 transition hover:shadow-green-500/40"><WhatsAppIcon /></a><button onClick={onCart} aria-label="Buka keranjang" className="fixed bottom-[156px] right-[18px] z-40 hidden h-14 w-14 place-items-center rounded-full bg-[#2E2A26] text-white shadow-xl transition hover:-translate-y-1 hover:bg-[#8B6B3F] md:grid"><ShoppingCart /></button><a href="#beranda" aria-label="Scroll ke atas" className="fixed bottom-5 right-[18px] z-40 grid h-14 w-14 place-items-center rounded-full bg-[#C8A45D] text-white shadow-xl transition hover:-translate-y-1 hover:bg-[#A9853F]"><ArrowUp /></a></>; }
type CartDrawerProps = { open: boolean; cart: CartItem[]; subtotal: number; onClose: () => void; onCheckout: (shipping: number, discount: number) => void; increaseQty: (id: string) => void; decreaseQty: (id: string) => void; removeFromCart: (id: string) => void };
function CartDrawer({ open, cart, subtotal, onClose, onCheckout, increaseQty, decreaseQty, removeFromCart }: CartDrawerProps) {
  const [area, setArea] = useState("Cilegon");
  const [voucher, setVoucher] = useState("");
  const [voucherError, setVoucherError] = useState("");
  const voucherCode = voucher.trim().toUpperCase();
  const voucherRate = voucherRates[voucherCode] ?? 0;
  const discount = Math.round(subtotal * voucherRate);
  const shipping = shippingOptions[area as keyof typeof shippingOptions];
  const total = subtotal + shipping - discount;
  const handleCheckout = () => { if (voucher && !voucherRate) { setVoucherError("Voucher tidak ditemukan"); return; } setVoucherError(""); onCheckout(shipping, discount); };

  return <AnimatePresence>{open && <motion.aside initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} className="fixed right-0 top-0 z-90 h-full w-full max-w-md overflow-auto bg-white p-6 text-[#102116] shadow-2xl"><div className="mb-6 flex justify-between"><h2 className="text-2xl font-bold">Keranjang Belanja</h2><button onClick={onClose}><X /></button></div>{cart.length > 0 ? cart.map((i) => <div key={i.id} className="mb-4 flex items-center gap-3 border-b pb-4"><div className="relative h-16 w-16 overflow-hidden rounded-xl bg-[#fff7df]"><Image src={i.image} alt={i.name} fill sizes="64px" className="object-cover" /></div><div className="flex-1"><b>{i.name}</b><p>{formatRupiah(i.price)}</p><div className="mt-2 inline-flex items-center overflow-hidden rounded-full border border-[#14532d]/25 bg-[#fff7df]"><button onClick={() => decreaseQty(i.id)} aria-label={`Kurangi ${i.name}`} className="grid h-9 w-9 place-items-center text-[#14532d] hover:bg-[#14532d] hover:text-white"><Minus size={14} /></button><span className="min-w-10 text-center text-sm font-bold">{i.qty}</span><button onClick={() => increaseQty(i.id)} aria-label={`Tambah ${i.name}`} className="grid h-9 w-9 place-items-center bg-[#14532d] text-white hover:bg-[#184C3A]"><Plus size={14} /></button></div><p className="mt-1 text-sm font-bold">Subtotal {formatRupiah(i.price * i.qty)}</p></div><button onClick={() => removeFromCart(i.id)} aria-label={`Hapus ${i.name}`}><Trash2 size={18} /></button></div>) : <p className="py-8 text-center opacity-70">Keranjang masih kosong</p>}<select value={area} onChange={(e) => setArea(e.target.value)} className="mb-3 w-full rounded-xl border px-4 py-3">{Object.entries(shippingOptions).map(([name, price]) => <option key={name} value={name}>{name} - {formatRupiah(price)}</option>)}</select><input value={voucher} onChange={(e) => { setVoucher(e.target.value); setVoucherError(""); }} className="mb-2 w-full rounded-xl border px-4 py-3" placeholder="Voucher" />{voucherError && <p className="mb-3 text-sm font-bold text-red-600">{voucherError}</p>}<p>Subtotal: {formatRupiah(subtotal)}</p><p>Ongkir: {formatRupiah(shipping)}</p><p>Diskon: {formatRupiah(discount)}</p><h3 className="mt-4 text-2xl font-bold">Total {formatRupiah(total)}</h3><button onClick={handleCheckout} disabled={!cart.length} className="mt-5 w-full rounded-2xl bg-[#14532d] px-6 py-4 font-bold text-white disabled:opacity-40">Checkout via WhatsApp</button></motion.aside>}</AnimatePresence>;
}




























