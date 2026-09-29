"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll } from "framer-motion";
import { ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Handshake, Headphones, Heart, MapPin, Minus, Plus, Search, Shield, ShoppingCart, Sparkles, Star, Trash2, Truck, User, X } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import ThemeToggle from "@/components/theme-toggle";
import AdminButton from "@/components/AdminButton";
import PremiumFooter from "@/components/premium-footer";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import ProductImage from "@/components/product-image";
import HomeHero from "@/components/home/HomeHero";
import HomeCategories from "@/components/home/HomeCategories";
import HomeFeaturedProducts from "@/components/home/HomeFeaturedProducts";
import HomeCustomerReviews from "@/components/home/HomeCustomerReviews";
import HomeTrustBar from "@/components/home/HomeTrustBar";
import CustomOrderCta from "@/components/custom-order-cta";
import HomePromoBanners from "@/components/home/HomePromoBanners";
import { CartItem, type CartToast, useCart } from "@/context/cart-context";
import { useWishlist } from "@/context/wishlist-context";

import { hasAuthenticatedUser } from "@/lib/client-auth";
import { confirmCustomerAuth } from "@/lib/customer-auth-prompt";
import { fetchProducts, formatRupiah, type Product } from "@/lib/products";

export default function Home() {
  const [cartOpen, setCartOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("Semua"), [sort, setSort] = useState("featured");
  const [products, setProducts] = useState<Product[]>([]), [productsLoading, setProductsLoading] = useState(true), [productsError, setProductsError] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string; imageUrl: string | null }[]>([]);
  const [homeBanner, setHomeBanner] = useState<string>("");
  const [whatsappSetting, setWhatsappSetting] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [homeLogo, setHomeLogo] = useState<string>("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [addState, setAddState] = useState<Record<string, "adding" | "added">>({});
  const katalogRef = useRef<HTMLElement | null>(null);
  const productsCarouselRef = useRef<HTMLDivElement | null>(null);
  const carouselPauseRef = useRef(false);
  const router = useRouter();
  const { cart, subtotal, totalItems, itemState, addToCart, increaseQty, decreaseQty, removeFromCart, clearCart, toast: cartToast, dismissToast } = useCart();
  const { wishlistCount, toast, toggleWishlist, isWishlisted } = useWishlist();
  const { scrollYProgress } = useScroll();
  const cartItemCount = totalItems;
  const accountInitials = userName ? userName.trim().slice(0, 3).toUpperCase() : "";
  const visibleProducts = useMemo(() => products.filter((p) => { const term = query.trim().toLowerCase(); const searchable = [p.name, p.slug, p.flavor, p.size, p.category].filter(Boolean).join(" ").toLowerCase(); return (filter === "Semua" || p.category === filter) && searchable.includes(term); }).sort((a, b) => sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : b.rating - a.rating), [filter, products, query, sort]);
  const moveProducts = useCallback((direction: 1 | -1) => {
    const carousel = productsCarouselRef.current;
    if (!carousel) return;
    const card = carousel.querySelector<HTMLElement>("[data-product-slide]");
    const amount = card ? card.getBoundingClientRect().width + 16 : carousel.clientWidth * 0.8;
    if (direction > 0 && carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - amount - 4) carousel.scrollTo({ left: 0, behavior: "smooth" });
    else carousel.scrollBy({ left: amount * direction, behavior: "smooth" });
  }, []);
  useEffect(() => {
    if (visibleProducts.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => { if (!carouselPauseRef.current) moveProducts(1); }, 4500);
    return () => window.clearInterval(timer);
  }, [moveProducts, visibleProducts.length]);
  useEffect(() => { productsCarouselRef.current?.scrollTo({ left: 0, behavior: "smooth" }); }, [query, filter, sort]);
  const categoryGroups = useMemo(() => {
    const grouped = new Map<string, Product[]>();
    products.forEach((product) => {
      const category = product.category?.trim();
      if (!category || category === "Tanpa Kategori") return;
      grouped.set(category, [...(grouped.get(category) ?? []), product]);
    });
    const priority = (name: string) => name.toLowerCase() === "bawang goreng" ? 0 : name.toLowerCase() === "parcel" ? 1 : 2;
    return categories.map((category) => ({ name: category.name, imageUrl: category.imageUrl, items: grouped.get(category.name) ?? [] }))
      .sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name, "id"));
  }, [categories, products]);
  const requireAuth = async (next: string, kind: "wishlist" | "cart" = "cart") => {
    if (await hasAuthenticatedUser()) return true;
    return confirmCustomerAuth(kind, next);
  };
  const guestCheckoutAvailable = async () => ((await fetch("/api/guest-checkout/capability", { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).catch(() => ({}))) as { guestCheckoutEnabled?: boolean }).guestCheckoutEnabled === true;
  const openCart = async () => { if (await requireAuth("/cart", "cart")) setCartOpen(true); };
  const openAccount = async () => {
    if (await hasAuthenticatedUser()) router.push("/account");
    else router.push("/login");
  };
  const addCart = async (item: { id: string; name: string; slug?: string | null; price: number; image: string }) => {
    if (addState[item.id]) return;
    if (!(await requireAuth("/"))) return;
    setAddState((current) => ({ ...current, [item.id]: "adding" }));
    const added = await addToCart(item);
    if (added) {
      setAddState((current) => ({ ...current, [item.id]: "added" }));
      window.setTimeout(() => {
        setAddState((current) => { const next = { ...current }; delete next[item.id]; return next; });
      }, 1000);
    } else {
      setAddState((current) => { const next = { ...current }; delete next[item.id]; return next; });
    }
  };
  const buyNow = async (item: Product) => {
    if (!item.slug) return;
    if (!(await hasAuthenticatedUser()) && !(await guestCheckoutAvailable())) { if (!(await requireAuth("/cart", "cart"))) return; }
    setAddState((current) => ({ ...current, [item.id]: "adding" }));
    const added = await addToCart(item);
    if (added) {
      setAddState((current) => ({ ...current, [item.id]: "added" }));
      router.push("/cart");
    } else {
      setAddState((current) => { const next = { ...current }; delete next[item.id]; return next; });
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
  const selectCatalogCategory = (category: string) => {
    const selected = categoryGroups.find((group) => group.name === category);
    if (!selected) return;
    const slug = selected.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    router.push(`/produk?category=${encodeURIComponent(slug)}`);
  };

  const loadProducts = useCallback(() => {
    setProductsLoading(true);
    setProductsError("");
    fetchProducts()
      .then(setProducts)
      .catch((error: unknown) => {
        if (process.env.NODE_ENV === "development") console.error("Homepage products failed", error);
        setProductsError("Produk belum dapat dimuat.");
      })
      .finally(() => setProductsLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
    void fetch("/api/categories", { cache: "no-store" }).then(response => response.json()).then((body: { data?: { id: string; name: string; imageUrl: string | null }[] }) => setCategories(body.data ?? [])).catch(() => setCategories([]));
  }, [loadProducts]);

  useEffect(() => {
    void fetch("/api/public/settings?keys=homeBanner,whatsapp,storeName,logo", { cache: "no-store" })
      .then(r => r.json())
      .then((body: { homeBanner?: string; whatsapp?: string; storeName?: string; logo?: string }) => {
        if (body.homeBanner) setHomeBanner(body.homeBanner);
        if (body.whatsapp) setWhatsappSetting(body.whatsapp);
        if (body.storeName) setStoreName(body.storeName);
        if (body.logo) setHomeLogo(body.logo);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { user?: { name?: string } | null };
      setUserName(data.user?.name?.trim() || null);
    }).catch(() => undefined);
  }, []);

  return <main className="min-h-screen overflow-hidden bg-[#F8F5EE] text-[#123524]"><motion.div className="fixed left-0 right-0 top-0 z-80 h-1 origin-left bg-[#C9A45B]" style={{ scaleX: scrollYProgress }} />
    <WishlistToast message={toast} />
    <CartToastView toast={cartToast} onDismiss={dismissToast} />
    <header className="sticky top-0 z-50 min-h-[68px] border-b border-[#C9A45B]/15 bg-[#F8F5EE]/85 text-[#123524] shadow-[0_8px_28px_rgba(18,53,36,0.08)] backdrop-blur-xl md:min-h-[76px]"><div className="mx-auto flex min-h-[68px] max-w-[1440px] items-center justify-between gap-3 px-4 min-[393px]:px-5 md:min-h-[76px]"><Link href="/" className="group flex shrink-0 items-center gap-3 font-display text-2xl font-bold md:gap-4"><Image src={homeLogo || "/AFA LOGO.svg"} alt={storeName || "AFA STORE"} width={96} height={144} className="h-16 w-12 shrink-0 object-contain transition-transform duration-300 group-hover:scale-105 md:h-16 md:w-12" priority sizes="(max-width: 767px) 48px, 64px" unoptimized={Boolean(homeLogo)} /><span className="hidden leading-none md:inline">{storeName || "AFA STORE"}</span></Link><form onSubmit={(event) => { event.preventDefault(); const search = query.trim(); router.push(search ? `/produk?q=${encodeURIComponent(search)}` : "/produk"); }} className="hidden flex-1 items-center rounded-full border border-[#C9A45B]/20 bg-white/80 px-5 py-2.5 shadow-sm md:flex"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari bawang goreng, parcel, atau rasa favorit..." aria-label="Cari produk" className="w-full bg-transparent text-sm outline-none placeholder:text-[#8B6B3F]/70" /><button type="submit" aria-label="Cari di katalog" className="grid h-10 w-10 shrink-0 place-items-center text-[#C9A45B]"><Search size={18} /></button></form><div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => void openAccount()} aria-label="Akun" className="group flex h-10 items-center gap-1.5 px-1"><User size={20} className="shrink-0 text-[var(--dark-text)] transition-colors group-hover:text-[#C9A45B]" />{accountInitials && <span className="truncate text-[13px] font-bold uppercase leading-none text-[var(--dark-text)] transition-colors group-hover:text-[#C9A45B]">{accountInitials}</span>}</button><Link href="/wishlist" onClick={async (event) => { event.preventDefault(); if (await requireAuth("/wishlist", "wishlist")) router.push("/wishlist"); }} aria-label="Wishlist" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10"><Heart size={20} />{wishlistCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{wishlistCount}</span>}</Link><button onClick={() => void openCart()} aria-label={cartItemCount > 0 ? `Keranjang, ${cartItemCount} item` : "Keranjang"} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-[#C9A45B]/10"><ShoppingCart size={20} />{cartItemCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#C9A45B] px-1.5 text-[10px] font-bold text-white">{formatBadge(cartItemCount)}</span>}</button><ThemeToggle /></div></div></header>
    <HomeHero products={products} onProducts={() => katalogRef.current?.scrollIntoView({ behavior: "smooth" })} />
    {homeBanner && <HomePromoBanners banners={[{ id: "home-banner", title: "Promo Spesial", subtitle: "Penawaran Terbaik AFA STORE", image: homeBanner, ctaLabel: "Lihat Produk", ctaUrl: "/produk" }]} />}
    <HomeCategories groups={categoryGroups} loading={productsLoading} onSelect={selectCatalogCategory} />
    <CustomOrderCta whatsapp={whatsappSetting || undefined} />
    <HomeFeaturedProducts products={visibleProducts} loading={productsLoading} error={productsError} isWishlisted={isWishlisted} toggleWishlist={toggleWishlist} addCart={addCart} addState={addState} buyNow={buyNow} onRetry={loadProducts} carouselRef={productsCarouselRef} onPause={() => { carouselPauseRef.current = true; }} onResume={() => { carouselPauseRef.current = false; }} onPrevious={() => moveProducts(-1)} onNext={() => moveProducts(1)} />
    <HomeCustomerReviews /><HomeTrustBar /><PremiumFooter /><Floating onCart={openCart} totalItems={totalItems} whatsapp={whatsappSetting || undefined} /><CartDrawer open={cartOpen} cart={cart} subtotal={subtotal} checkoutPending={checkoutPending} checkoutError={checkoutError} itemState={itemState} onClose={() => setCartOpen(false)} onCheckout={continueToCheckout} increaseQty={increaseQty} decreaseQty={decreaseQty} removeFromCart={removeFromCart} clearCart={clearCart} />
  </main>;
}
function CategoryCluster({ groups, loading, onSelect }: { groups: { name: string; items: Product[] }[]; loading: boolean; onSelect: (category: string) => void }) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  
  // Dynamic descriptions with fallback for new categories
  const categoryDescriptions: Record<string, string> = {
    "bawang goreng": "Gurih Â· Renyah",
    "parcel": "Hadiah & bingkisan",
  };

  // Find representative product (first one with valid image or first available)
  const getRepresentativeProduct = (items: Product[]) => {
    return items.find(item => item.image && item.image.trim() !== "") ?? items[0];
  };

  if (!loading && !groups.length) return null;

  const displayGroups = showAllCategories ? groups : groups.slice(0, 4);

  return <section aria-labelledby="category-cluster-title" className="category-cluster section-shell py-7 md:py-10"><div className="mb-7"><p className="text-xs font-extrabold uppercase tracking-[0.24em] text-[#A7833A]">Menu Belanja</p><h2 id="category-cluster-title" className="mt-2 font-display text-3xl font-bold sm:text-4xl">Pilih Kebutuhan Anda</h2><p className="mt-2 text-[var(--muted)]">Temukan produk AFA STORE sesuai kebutuhan Anda.</p></div><div className="grid gap-5 lg:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">{loading ? Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton min-h-72 lg:min-h-80 rounded-[28px]" />) : displayGroups.map((group) => { const normalized = group.name.toLowerCase(); const description = categoryDescriptions[normalized] ?? `${group.items.length} pilihan produk`; const representativeProduct = getRepresentativeProduct(group.items); const effectiveSrc = representativeProduct?.image || null; return <motion.button key={group.name} type="button" onClick={() => onSelect(group.name)} whileHover={{ y: -6 }} whileTap={{ scale: .98 }} className="category-menu-card group relative min-h-72 lg:min-h-80 w-full overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-4 text-left shadow-[0_16px_45px_rgba(18,53,36,0.10)] transition sm:min-h-44 lg:p-8"><div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#C9A45B]/15 transition group-hover:scale-125" /><div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] items-start gap-4 pt-4"><div className="flex flex-col"><h3 className="text-lg sm:text-xl lg:text-2xl font-display font-black text-[#123524]"><span className="mr-2"><Sparkles size={18} aria-hidden="true" /></span>{group.name}</h3><p className="mt-1 text-sm text-[#8B6B3F]">{description}</p><div className="mt-4 flex items-center justify-between text-sm font-extrabold text-[#A7833A]"><span>Lihat Produk Ã¢â€ â€™</span><span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#123524] px-2.5 py-1 text-white">Ã¢â€ â€™</span></div></div>{effectiveSrc ? <Image src={effectiveSrc} alt={group.name} width={280} height={220} className="h-48 w-full object-contain" /> : <div className="h-48" />}</div></motion.button>; })}</div>{groups.length > 4 && <button type="button" onClick={() => setShowAllCategories((value) => !value)} className="mt-6 rounded-full border border-[#C9A45B]/40 px-5 py-2 text-sm font-bold text-[#8B6B3F]">{showAllCategories ? "Tampilkan Lebih Sedikit" : "Lihat Semua Kategori"}</button>}</section>;
}

function ProductGrid({ loading, error, products, isWishlisted, toggleWishlist, addCart, addState, buyNow, onRetry, carouselRef, onPause, onResume, onPrevious, onNext, parcel = false }: { loading: boolean; error: string; products: Product[]; parcel?: boolean; isWishlisted: (id: string) => boolean; toggleWishlist: (item: Product) => void; addCart: (item: Product) => void; addState: Record<string, "adding" | "added">; buyNow: (item: Product) => void; onRetry: () => void; carouselRef: React.RefObject<HTMLDivElement | null>; onPause: () => void; onResume: () => void; onPrevious: () => void; onNext: () => void }) {
  if (loading) return <div aria-label="Memuat produk" aria-busy="true" className="product-grid grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-5 lg:grid-cols-4 lg:gap-6 2xl:grid-cols-5">{Array.from({ length: 8 }, (_, index) => <div key={index} className="luxury-card overflow-hidden rounded-[24px]"><div className="skeleton aspect-square" /><div className="space-y-3 p-4"><div className="skeleton h-5 w-3/4 rounded-full" /><div className="skeleton h-4 w-1/2 rounded-full" /><div className="skeleton h-11 rounded-2xl" /></div></div>)}</div>;
  if (error) return <div role="alert" className="luxury-card rounded-3xl p-8 text-center md:p-12"><h3 className="font-display text-2xl font-bold">Produk sedang mengalami gangguan.</h3><p className="mt-2 text-[#8B6B3F]">Silakan coba lagi beberapa saat.</p><button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-full bg-[#123524] px-6 py-3 font-bold text-white">Coba Lagi</button></div>;
  if (!products.length) return <div className="luxury-card rounded-3xl p-8 text-center md:p-12"><h3 className="font-display text-2xl font-bold">{parcel ? "Parcel AFA" : "Belum ada produk yang sesuai."}</h3><p className="mx-auto mt-2 max-w-lg text-[#8B6B3F]">{parcel ? "Pilihan parcel akan tampil di sini saat tersedia." : "Coba kata kunci atau kategori lain untuk menemukan produk favorit Anda."}</p><a href="#katalog" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#123524]/20 px-6 py-3 font-bold">{parcel ? "Jelajahi Produk" : "Reset Filter"}</a></div>;
  return <div className="relative"><button type="button" onClick={onPrevious} aria-label="Produk sebelumnya" className="absolute -left-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-[#D4AF37]/30 bg-[#071F17] text-[#D4AF37] shadow-md md:-left-5 md:h-11 md:w-11"><ChevronLeft size={20} /></button><div ref={carouselRef} onMouseEnter={onPause} onMouseLeave={onResume} onPointerDown={onPause} onPointerUp={onResume} onFocusCapture={onPause} onBlurCapture={onResume} className="product-carousel flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 py-2 touch-pan-x scrollbar-none">{products.map((p) => <div data-product-slide key={p.id} className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-[31%] lg:w-[23%] xl:w-[19%]"><ProductCard item={p} wish={isWishlisted(p.id)} onWish={() => toggleWishlist(p)} onAdd={() => addCart(p)} addState={addState[p.id]} onBuy={() => buyNow(p)} /></div>)}</div><button type="button" onClick={onNext} aria-label="Produk berikutnya" className="absolute -right-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-[#D4AF37]/30 bg-[#071F17] text-[#D4AF37] shadow-md md:-right-5 md:h-11 md:w-11"><ChevronRight size={20} /></button></div>;
}

function Info({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) { return <div className="luxury-card flex items-center gap-4 rounded-3xl p-5"><span className="text-[#C8A45D]">{icon}</span><div><b>{title}</b><p className="text-sm text-[#8B6B3F]">{desc}</p></div></div>; }
function SectionTitle({ title, id, subtitle }: { title: string; id?: string; subtitle?: string }) { return <div className="mb-6 flex items-end justify-between gap-4"><div><h2 id={id} className="font-display text-3xl font-bold uppercase text-[#2E2A26]">{title}</h2>{subtitle && <p className="mt-2 text-sm text-[#8B6B3F] sm:text-base">{subtitle}</p>}</div><Link href="/produk" className="flex shrink-0 items-center gap-1 text-sm text-[#8B6B3F] hover:text-[#C8A45D]">Lihat Semua <ChevronRight size={16} /></Link></div>; }
function HeroDecor({ spicy }: { spicy: boolean }) { return <div aria-hidden="true" className="pointer-events-none absolute inset-0"><motion.span animate={{ y: [0, -14, 0], rotate: [18, 28, 18] }} transition={{ repeat: Infinity, duration: 6 }} className="absolute left-[6%] top-[18%] text-5xl opacity-30"><Sparkles /></motion.span><motion.span animate={{ y: [0, 12, 0], rotate: [-12, -24, -12] }} transition={{ repeat: Infinity, duration: 7 }} className="absolute bottom-[13%] left-[45%] text-4xl text-[#C8A45D]/40"><Star /></motion.span>{spicy && <motion.span animate={{ y: [0, -16, 0], rotate: [20, 32, 20] }} transition={{ repeat: Infinity, duration: 5 }} className="absolute right-[8%] top-[15%] text-5xl text-[#C8A45D]/45"><Sparkles /></motion.span>}<div className="absolute right-[18%] top-[20%] h-64 w-64 rounded-full bg-[#C8A45D]/25 blur-3xl" /><div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-white/80 blur-3xl" /></div>; }
function WishlistToast({ message }: { message: string }) { return <AnimatePresence>{message && <motion.div initial={{ opacity: 0, y: -18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -18, scale: 0.96 }} className="fixed left-1/2 top-5 z-100 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-full border border-[#C8A45D]/30 bg-white px-5 py-3 text-center font-semibold text-[#2E2A26] shadow-[0_18px_45px_rgba(46,42,38,0.16)]">{message}</motion.div>}</AnimatePresence>; }
function formatBadge(count: number) { return count > 99 ? "99+" : String(count); }
function CartToastView({ toast, onDismiss }: { toast: CartToast | null; onDismiss: () => void }) { return <AnimatePresence>{toast && <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }} role="status" aria-live="polite" className="fixed inset-x-0 bottom-5 z-100 flex justify-center px-4 md:inset-x-auto md:bottom-6 md:right-6 md:justify-end"><div className="w-full max-w-sm rounded-2xl border border-[#C8A45D]/30 bg-white p-4 text-[#2E2A26] shadow-[0_18px_45px_rgba(46,42,38,0.18)] md:w-96"><div className="flex items-start gap-3"><span aria-hidden="true" className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-bold text-white ${toast.variant === "success" ? "bg-[#2e7d32]" : "bg-[#c62828]"}`}>{toast.variant === "success" ? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ" : "!"}</span><div className="min-w-0 flex-1"><p className="font-bold leading-tight">{toast.title}</p><p className="mt-1 break-words text-sm text-[#8B6B3F]">{toast.message}</p>{toast.variant === "success" && <Link href="/cart" onClick={onDismiss} className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-[#123524] px-4 py-1.5 text-sm font-bold text-white transition hover:bg-[#1c5138]">Lihat Keranjang</Link>}</div><button type="button" onClick={onDismiss} aria-label="Tutup notifikasi" className="text-[#8B6B3F] transition hover:text-[#2E2A26]"><X size={18} /></button></div></div></motion.div>}</AnimatePresence>; }
function Floating({ onCart, totalItems, whatsapp }: { onCart: () => void; totalItems: number; whatsapp?: string }) { return <><button onClick={onCart} aria-label={totalItems > 0 ? `Buka keranjang, ${totalItems} item` : "Buka keranjang"} className="fixed bottom-[150px] right-[18px] z-40 grid h-14 w-14 place-items-center text-[var(--dark-text)] transition hover:scale-110 hover:brightness-110 active:scale-95"><span className="relative grid h-14 w-14 place-items-center"><ShoppingCart size={30} strokeWidth={2.2} className="drop-shadow-[0_3px_4px_rgba(18,53,36,0.35)]" />{totalItems > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#C9A45B] px-1.5 text-[10px] font-bold text-white">{formatBadge(totalItems)}</span>}</span></button><FloatingWhatsApp whatsapp={whatsapp} /><a href="#beranda" aria-label="Scroll ke atas" className="fixed bottom-5 right-[18px] z-40 grid h-14 w-14 place-items-center text-[#C9A45B] transition hover:scale-110 hover:brightness-110 active:scale-95"><ArrowUp size={30} strokeWidth={2.4} className="drop-shadow-[0_3px_4px_rgba(201,164,91,0.45)]" /></a></>; }
type CartDrawerProps = { open: boolean; cart: CartItem[]; subtotal: number; checkoutPending: boolean; checkoutError: string; itemState: (id: string) => { pending: boolean; error: string; notice: string }; onClose: () => void; onCheckout: () => void; increaseQty: (id: string) => void; decreaseQty: (id: string) => void; removeFromCart: (id: string) => void; clearCart: () => void };
function CartDrawer({ open, cart, subtotal, checkoutPending, checkoutError, itemState, onClose, onCheckout, increaseQty, decreaseQty, removeFromCart, clearCart }: CartDrawerProps) {
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  return <AnimatePresence>{open && <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[89] bg-[#07150F]/45 backdrop-blur-[2px]" aria-hidden="true" />
    <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} role="dialog" aria-modal="true" aria-label="Keranjang belanja" className="fixed right-0 top-0 z-[90] flex h-[100dvh] w-full max-w-[470px] flex-col border-l border-[#C9A45B]/20 bg-[#F8F5EE] text-[#123524] shadow-[-18px_0_50px_rgba(18,53,36,.16)] dark:bg-[#07150F] dark:text-[#F2EDE3]">
      <header className="flex shrink-0 items-center justify-between border-b border-[#C9A45B]/20 px-5 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#123524] text-[#D4AF37]"><ShoppingCart size={19} /></span><h2 className="font-display text-xl font-bold">Keranjang Belanja</h2></div><button type="button" onClick={onClose} aria-label="Tutup keranjang" className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#123524]/10 dark:hover:bg-white/10"><X size={21} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7"><div className="mb-5 flex gap-3 rounded-2xl bg-[#EAF1E9] p-4 text-sm dark:bg-[#0E2118]"><Truck className="shrink-0 text-[#A7833A]" size={19} /><div><p className="font-bold">Yuk, selesaikan pesanan Anda</p><p className="text-[#6D6558] dark:text-[#AAA394]">Produk pilihan Anda siap diproses dan dikirim.</p></div></div>
        {!cart.length ? <div className="grid min-h-[55vh] place-items-center text-center"><div><ShoppingCart className="mx-auto text-[#C9A45B]" size={52} /><h3 className="mt-5 font-display text-2xl font-bold">Keranjang masih kosong</h3><p className="mt-2 text-sm text-[#6D6558] dark:text-[#AAA394]">Yuk, pilih produk favorit AFA STORE.</p><Link href="/#katalog" onClick={onClose} className="mt-6 inline-flex min-h-12 items-center rounded-full bg-[#123524] px-7 font-bold text-white">Lihat Produk</Link></div></div> : <><section className="space-y-3" aria-label="Produk dalam keranjang">{cart.map((i) => { const state = itemState(i.id); const maxed = i.stock !== undefined && i.qty >= i.stock; return <article key={i.id} aria-busy={state.pending} className="rounded-2xl border border-[#123524]/10 bg-white/65 p-3 dark:border-white/10 dark:bg-[#0E2118]"><div className="flex gap-3"><div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-[#FFF9ED]"><Image src={i.image} alt={i.name} fill sizes="72px" className="object-contain p-1.5" /></div><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><h3 className="line-clamp-2 flex-1 font-semibold">{i.name}</h3><button type="button" disabled={state.pending} onClick={() => removeFromCart(i.id)} aria-label={`Hapus ${i.name} dari keranjang`} className="text-red-600 disabled:opacity-40"><Trash2 size={17} /></button></div><p className="text-sm font-bold text-[#A7833A]">{formatRupiah(i.price)}</p><div className="mt-2 inline-flex items-center rounded-full border border-[#123524]/15 bg-[#F8F5EE] dark:bg-[#10241B]"><button type="button" disabled={state.pending || i.qty <= 1} onClick={() => decreaseQty(i.id)} aria-label={`Kurangi ${i.name}`} className="grid h-9 w-9 place-items-center disabled:opacity-35"><Minus size={15} /></button><output aria-label={`Jumlah ${i.name}`} className="min-w-8 text-center font-bold">{i.qty}</output><button type="button" disabled={state.pending || maxed} onClick={() => increaseQty(i.id)} aria-label={`Tambah ${i.name}`} className="grid h-9 w-9 place-items-center disabled:opacity-35"><Plus size={15} /></button></div></div></div>{state.error && <p role="alert" className="mt-2 text-xs text-red-600">{state.error}</p>}</article>; })}</section><div className="my-5 border-t border-[#123524]/15 dark:border-white/15" /><div className="flex justify-between"><span className="text-sm text-[#6D6558] dark:text-[#AAA394]">Subtotal ({totalItems} produk)</span><strong>{formatRupiah(subtotal)}</strong></div><div className="mt-4 flex gap-3 rounded-2xl bg-[#EAF1E9] p-3 text-xs dark:bg-[#0E2118]"><Truck size={17} className="shrink-0 text-[#A7833A]" />Ongkir akan dihitung saat checkout</div>{checkoutError && <p role="alert" className="mt-3 text-sm text-red-600">{checkoutError}</p>}</>}
      </div>{cart.length > 0 && <footer className="space-y-3 border-t border-[#C9A45B]/20 bg-[#F8F5EE] px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-[#07150F] sm:px-7"><Link href="/cart" onClick={onClose} className="flex min-h-12 items-center justify-center rounded-full border border-[#123524] font-bold dark:border-[#D4AF37]">Lihat Keranjang</Link><button type="button" onClick={onCheckout} disabled={!cart.length || checkoutPending} className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-[#123524] font-bold text-white disabled:opacity-50">{checkoutPending ? "Menyiapkan…" : <>Checkout <ArrowRight size={17} /></>}</button><button type="button" onClick={clearCart} disabled={checkoutPending} className="mx-auto flex items-center gap-2 text-sm font-semibold text-red-600"><Trash2 size={15} /> Kosongkan Keranjang</button></footer>}
    </motion.aside>
  </>}</AnimatePresence>;
}

