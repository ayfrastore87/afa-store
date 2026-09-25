"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Banknote,
    Check,
    CheckCircle2,
    History,
    Loader2,
    Minus,
    PackageSearch,
    Phone,
    Plus,
    QrCode,
    Search,
    ShoppingCart,
    Smartphone,
    Store,
    Trash2,
    Truck,
    User,
} from "lucide-react";
import { fetchProducts, type Product } from "@/lib/products";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import {
    isValidDeliveryLocation,
    isValidRecipientName,
    isValidRecipientPhone,
    locationSignature,
    mustInvalidateShipping,
} from "@/lib/checkout-address";
import {
    DEFAULT_KASIR_ORDER_TYPE,
    emptyKasirDeliveryDraft,
    kasirCartKey,
    kasirDeliveryReadiness,
    kasirDeliveryRequest,
    kasirDeliverySignature,
    kasirOrderTotal,
    kasirOrderTypeLabel,
    type KasirDeliveryDraft,
    type KasirOrderType,
} from "@/lib/kasir-delivery";
import KasirDeliveryPanel from "./KasirDeliveryPanel";
import {
    PAYMENT_METHODS,
    formatRupiah,
    rupiah,
    type KasirPaymentMethod,
} from "./kasir-shared";

// ---------------------------------------------------------------------------
// TAHAP D: halaman kasir terhubung ke API transaksi. Tombol "Proses Transaksi"
// mengirim pesanan ke POST /api/admin/kasir/order, mencegah double-submit saat
// loading, menampilkan error lewat SweetAlert2, dan mengarahkan ke detail
// transaksi setelah berhasil.
// ---------------------------------------------------------------------------

type Category = { id: string; name: string };

type CartLine = {
    productId: string | null;
    itemType: "PRODUCT" | "CUSTOM_PRODUCT" | "SERVICE";
    name: string;
    price: number;
    size: string | null;
    stock: number;
    image: string | null;
    quantity: number;
    description?: string;
    notes?: string;
};

type KasirOrderResponse = {
    success: boolean;
    orderId: string;
    invoice: string;
    subtotal: number;
    shipping: number;
    total: number;
    orderType: KasirOrderType;
    courier?: string | null;
    service?: string | null;
    paymentMethod: KasirPaymentMethod;
    source: string;
    cashReceived: number | null;
    change: number | null;
    status: string;
    paymentStatus: string;
};

export default function KasirPOS() {
    const router = useRouter();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("");

    const [cart, setCart] = useState<CartLine[]>([]);
    const [manualOpen, setManualOpen] = useState(false);
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [manualType, setManualType] = useState<"CUSTOM_PRODUCT" | "SERVICE">("CUSTOM_PRODUCT");
    const [manualName, setManualName] = useState("");
    const [manualDescription, setManualDescription] = useState("");
    const [manualPrice, setManualPrice] = useState("");
    const [manualQuantity, setManualQuantity] = useState("1");
    const [manualNotes, setManualNotes] = useState("");

    const [paymentMethod, setPaymentMethod] = useState<KasirPaymentMethod>("TUNAI");
    const [cashReceived, setCashReceived] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [customerWhatsapp, setCustomerWhatsapp] = useState("");
    const [source, setSource] = useState<"TATAP_MUKA" | "WHATSAPP" | "MARKETPLACE" | "OTHER">("TATAP_MUKA");
    // JENIS PESANAN. Pickup keeps the existing cashier flow; Kirim enables the delivery block.
    const [orderType, setOrderType] = useState<KasirOrderType>(DEFAULT_KASIR_ORDER_TYPE);
    const [deliveryDraft, setDeliveryDraft] = useState<KasirDeliveryDraft>(() => emptyKasirDeliveryDraft());

    // Canonical source for kasir kirim: always use TATAP_MUKA (COD) to avoid confusing COD
    // with transaction source. This preserves existing backend behavior while hiding source
    // selection from users for delivery orders.
    useEffect(() => {
        if (orderType === "DELIVERY") {
            setSource("TATAP_MUKA");
        }
    }, [orderType]);

    const patchDelivery = useCallback((patch: Partial<KasirDeliveryDraft>) => {
        setDeliveryDraft((current) => ({ ...current, ...patch }));
    }, []);

    // STEP-BY-STEP CHECKOUT STATE MANAGEMENT
    const [currentStep, setCurrentStep] = useState(1);

    useEffect(() => {
        if (orderType === "PICKUP") {
            setCurrentStep(1);
            setDeliveryDraft(emptyKasirDeliveryDraft());
        } else {
            setCurrentStep((prev) => Math.min(prev, 1));
        }
    }, [orderType]);

    // Validates that user can proceed to next step based on current state
    function canNextStep(step: number, ot: KasirOrderType, dr: { ready: boolean; reason: string | null }, dd: KasirDeliveryDraft): boolean {
        if (cart.length === 0) return false;
        switch (step) {
            case 1: return true;                                    // Order -> Address/ Payment
            case 2: return Boolean(ot === "PICKUP" || dr.ready);    // Address -> Ongkir (or Payment for PICKUP)
            case 3: return Boolean(ot === "PICKUP" || (ot === "DELIVERY" && dd.courierCode && dd.serviceCode)); // Ongkir -> Payment
            case 4: return true;                                    // Payment -> Shipping (but actually creates order)
            default: return false;
        }
    }

    // Validates that ALL requirements for final submission are met (cart + delivery readiness + TUNAI cash sufficiency)
    function allRequirementsMet(): boolean {
        if (cart.length === 0) return false;
        if (orderType === "DELIVERY" && !deliveryReadiness.ready) return false;
        if (paymentMethod === "TUNAI" && (Number(cashReceived) || 0) < orderTotal) return false;
        return true;
    }

    const loadCatalog = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const [productList, categoryRes] = await Promise.all([
                fetchProducts(),
                fetch("/api/categories", { headers: { Accept: "application/json" } })
                    .then((response) => response.json() as Promise<{ data?: Category[] }>)
                    .catch(() => ({ data: [] }) as { data?: Category[] }),
            ]);
            setProducts(productList);
            setCategories(categoryRes.data ?? []);
        } catch (error) {
            setLoadError(getUserFacingMessage(error, "Produk belum dapat dimuat."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadCatalog();
    }, [loadCatalog]);

    useEffect(() => {
        document.documentElement.classList.toggle("kasir-checkout-open", checkoutOpen);
        return () => document.documentElement.classList.remove("kasir-checkout-open");
    }, [checkoutOpen]);

    async function submitOrder() {
        if (submitting || cart.length === 0) return;
        if (orderType === "DELIVERY" && !deliveryReadiness.ready) {
            await Swal.fire({
                title: "Pengiriman Belum Lengkap",
                text: deliveryReadiness.reason || "Lengkapi data pengiriman terlebih dahulu.",
                icon: "warning",
                confirmButtonColor: "#184D47",
            });
            return;
        }
        if (paymentMethod === "TUNAI" && (Number(cashReceived) || 0) < orderTotal) {
            await Swal.fire({
                title: "Uang Kurang",
                text: "Uang yang diterima kurang dari total belanja.",
                icon: "warning",
                confirmButtonColor: "#184D47",
            });
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch("/api/admin/kasir/order", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    customerName: customerName.trim(),
                    customerWhatsapp: customerWhatsapp.trim(),
                    source,
                    paymentMethod,
                    orderType,
                    // The delivery object is sent ONLY for Kirim: a pickup order keeps the
                    // exact previous payload. The client price/weight is never sent — the
                    // server re-quotes Biteship with authoritative product data.
                    delivery: orderType === "DELIVERY" ? kasirDeliveryRequest(deliveryDraft) : undefined,
                    ...(paymentMethod === "TUNAI" && orderType !== "DELIVERY" ? { cashReceived: Number(cashReceived) || 0 } : {}),
                    items: cart.map((line) => line.productId ? { productId: line.productId, quantity: line.quantity } : { itemType: line.itemType, name: line.name, description: line.description, notes: line.notes, quantity: line.quantity, unitPrice: line.price }),
                }),
            });

            const payload = (await response.json().catch(() => null)) as
                | (KasirOrderResponse & { message?: string })
                | null;

            if (!response.ok || !payload?.success) {
                throw new Error(payload?.message || "Transaksi gagal diproses.");
            }

            const changeLabel = payload.paymentMethod === "TUNAI" && payload.change != null
                ? `<div><b>Kembalian</b><br/>${formatRupiah(payload.change)}</div>`
                : "";
            const shippingLabel =
                payload.orderType === "DELIVERY"
                    ? `<div><b>Ongkir</b><br/>${formatRupiah(payload.shipping)}${payload.courier ? ` (${payload.courier}${payload.service ? ` — ${payload.service}` : ""})` : ""}</div>`
                    : "";

            // For QRIS, do NOT show "Transaksi Berhasil" since payment is not yet complete.
            // Instead, redirect directly to the detail page which shows Menunggu Pembayaran QRIS.
            const isQrisPending = payload.paymentMethod === "QRIS" && payload.paymentStatus !== "PAID";
            if (isQrisPending) {
                // Show minimal info message then redirect to detail page where QR code + status displays
                await Swal.fire({
                    title: "Pesanan Dibuat",
                    text: "Menunggu Pembayaran QRIS",
                    icon: "info",
                    confirmButtonColor: "#184D47",
                    confirmButtonText: "Selesaikan Pembayaran",
                });
            } else {
                await Swal.fire({
                    title: "Transaksi Berhasil",
                    html: `<div style="text-align:left;display:grid;gap:8px"><div><b>Invoice</b><br/>${payload.invoice}</div><div><b>Jenis Pesanan</b><br/>${kasirOrderTypeLabel(payload.orderType)}</div><div><b>Total</b><br/>${formatRupiah(payload.total)}</div>${shippingLabel}${changeLabel}</div>`,
                    icon: "success",
                    confirmButtonColor: "#184D47",
                });
            }

            clearCart();
            router.push(`/admin/kasir/${payload.orderId}`);
        } catch (error) {
            await Swal.fire({
                title: "Transaksi Gagal",
                text: getUserFacingMessage(error, "Terjadi kesalahan."),
                icon: "error",
                confirmButtonColor: "#184D47",
            });
        } finally {
            setSubmitting(false);
        }
    }

    const filteredProducts = useMemo(() => {
        const term = query.trim().toLowerCase();
        return products.filter((product) => {
            const matchesCategory = !activeCategory || product.categoryId === activeCategory || product.category === activeCategory;
            const matchesQuery = !term
                || product.name.toLowerCase().includes(term)
                || (product.flavor ?? "").toLowerCase().includes(term)
                || (product.size ?? "").toLowerCase().includes(term);
            return matchesCategory && matchesQuery;
        });
    }, [products, query, activeCategory]);

    function addToCart(product: Product) {
        setCart((current) => {
            const existing = current.find((line) => line.productId === product.id);
            if (existing) {
                if (existing.quantity >= Math.max(1, product.stock)) return current;
                return current.map((line) =>
                    line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line
                );
            }
            return [
                ...current,
                {
                    productId: product.id,
                    itemType: "PRODUCT",
                    name: product.name,
                    price: product.price,
                    size: product.size,
                    stock: product.stock,
                    image: product.image,
                    quantity: 1,
                },
            ];
        });
    }

    function setQuantity(productId: string | null, quantity: number) {
        setCart((current) =>
            current
                .map((line) => {
                    if (line.productId !== productId) return line;
                    const clamped = Math.max(0, Math.min(quantity, Math.max(1, line.stock)));
                    return { ...line, quantity: clamped };
                })
                .filter((line) => line.quantity > 0)
        );
    }

    function removeLine(productId: string | null) {
        setCart((current) => current.filter((line) => line.productId !== productId));
    }

    function addManualItem() {
        const name = manualName.trim();
        const price = Number(manualPrice);
        const quantity = Number(manualQuantity);
        if (!name || !Number.isInteger(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) {
            void Swal.fire({ title: "Data belum lengkap", text: "Nama, jumlah, dan harga satuan harus valid.", icon: "warning", confirmButtonColor: "#184D47" });
            return;
        }
        setCart((current) => [...current, { productId: null, itemType: manualType, name, price, size: null, stock: 999, image: null, quantity, description: manualDescription.trim(), notes: manualNotes.trim() }]);
        setManualName(""); setManualDescription(""); setManualPrice(""); setManualQuantity("1"); setManualNotes(""); setManualOpen(false);
    }

    const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.quantity, 0), [cart]);
    const totalItems = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);
    const cashValue = Number(cashReceived) || 0;

    // ---- DELIVERY (Kirim) ---------------------------------------------------
    // The same shared helpers as the customer checkout. These client checks only gate the
    // button: POST /api/admin/kasir/order re-validates everything (products, weights, pin,
    // area id, courier selection) and re-quotes Biteship server-side.
    const deliveryItems = useMemo(
        () => cart.filter((line) => line.productId).map((line) => ({ productId: line.productId as string, quantity: line.quantity })),
        [cart],
    );
    const deliverySignature = kasirDeliverySignature(
        kasirCartKey(deliveryItems),
        locationSignature({
            latitude: deliveryDraft.latitude,
            longitude: deliveryDraft.longitude,
            destinationAreaId: deliveryDraft.areaId,
            formattedAddress: deliveryDraft.address,
        }),
    );
    const deliveryLocationValid =
        isValidDeliveryLocation({
            formattedAddress: deliveryDraft.address,
            latitude: deliveryDraft.latitude,
            longitude: deliveryDraft.longitude,
            destinationAreaId: deliveryDraft.areaId,
        }) && deliveryDraft.areaId.trim().length > 0;
    const deliveryReadiness =
        orderType === "DELIVERY"
            ? kasirDeliveryReadiness({
                  recipientValid: isValidRecipientName(customerName) && isValidRecipientPhone(customerWhatsapp),
                  locationValid: deliveryLocationValid,
                  quoteSelected: Boolean(deliveryDraft.courierCode && deliveryDraft.serviceCode),
                  quoteMatchesDestination: !mustInvalidateShipping(deliveryDraft.quoteSignature, deliverySignature),
              })
            : { ready: true, reason: null };

    // Ongkir is only ever charged when the delivery is fully validated, and a pickup
    // order never carries shipping at all.
    const deliveryShipping = orderType === "DELIVERY" && deliveryReadiness.ready ? deliveryDraft.shipping : 0;
    const orderTotal = kasirOrderTotal({ subtotal, orderType, shipping: deliveryShipping });
    const change = Math.max(0, cashValue - orderTotal);

    function clearCart() {
        setCart([]);
        setCashReceived("");
        // An emptied cart owns no destination or quote: the next order starts clean.
        setDeliveryDraft(emptyKasirDeliveryDraft());
    }

    return (
        <div className="kasir-pos min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,#fff8df_0,#f7efd9_34%,#edf4ef_68%,#e4dcc7_100%)] text-[#184D47]">
            <header className="sticky top-0 z-30 border-b border-[#C9A45B]/20 bg-[#F8F5EE]/90 shadow-[0_8px_28px_rgba(18,53,36,0.06)] backdrop-blur-xl">
                <div className="flex min-h-20 flex-wrap items-center gap-2 px-3 py-2 sm:px-5 lg:flex-nowrap lg:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#184D47] text-[#D4AF37] sm:grid">
                            <ShoppingCart size={22} />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-black uppercase tracking-[0.28em] text-[#C9A45B]">AFA STORE</p>
                            <h1 className="truncate text-xl font-black leading-tight sm:text-2xl">Kasir AFA STORE</h1>
                            <p className="truncate text-xs text-[#184D47]/60">Transaksi Penjualan</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link
                            href="/kasir/riwayat"
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D4AF37] px-3 text-sm font-black text-[#184D47] transition hover:brightness-105 active:scale-95"
                        >
                            <History size={18} />
                            <span className="hidden sm:inline">Riwayat Transaksi</span>
                            <span className="sm:hidden">Riwayat</span>
                        </Link>
                        <Link
                            href="/admin/kasir/monitoring"
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#184D47]/15 bg-white/80 px-3 text-sm font-bold text-[#184D47] transition hover:bg-white active:scale-95"
                        >
                            <Truck size={18} />
                            <span>Monitoring</span>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="kasir-pos-main grid min-w-0 grid-cols-1 gap-4 px-3 py-4 sm:px-5 lg:gap-5 lg:px-6">
                <section className="min-w-0">
                    <label className="mb-4 flex h-12 items-center gap-3 rounded-2xl border border-[#C9A45B]/20 bg-white/90 px-4 shadow-sm focus-within:border-[#C9A45B]">
                        <Search size={18} className="shrink-0 text-[#C9A45B]" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Cari produk, rasa, atau ukuran..."
                            className="h-full w-full bg-transparent text-sm font-medium outline-none placeholder:text-[#184D47]/40"
                        />
                    </label>
                    <button type="button" onClick={() => setManualOpen(true)} className="mb-4 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#D4AF37] px-5 font-black text-[#184D47]">
                        <Plus size={18} /> Tambah Item Manual / Jasa
                    </button>

                    <div className="mb-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveCategory("")}
                            className={`rounded-full px-4 py-2 text-sm font-bold transition ${activeCategory === "" ? "bg-[#184D47] text-white" : "bg-white/80 text-[#184D47]/70 hover:bg-white"}`}
                        >
                            Semua
                        </button>
                        {categories.map((category) => (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => setActiveCategory(activeCategory === category.id ? "" : category.id)}
                                className={`rounded-full px-4 py-2 text-sm font-bold transition ${activeCategory === category.id ? "bg-[#184D47] text-white" : "bg-white/80 text-[#184D47]/70 hover:bg-white"}`}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                            {Array.from({ length: 8 }).map((_, index) => (
                                <div key={index} className="relative h-44 overflow-hidden rounded-[1.5rem] bg-white/70 shadow-sm">
                                    <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                                </div>
                            ))}
                        </div>
                    ) : loadError ? (
                        <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-red-200 bg-red-50/70 p-10 text-center">
                            <AlertCircle size={28} className="text-red-600" />
                            <p className="mt-3 font-black text-red-700">{loadError}</p>
                            <button onClick={() => void loadCatalog()} className="mt-4 min-h-12 rounded-2xl bg-[#184D47] px-5 font-black text-white">
                                Coba Lagi
                            </button>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[#184D47]/15 bg-white/60 p-12 text-center">
                            <PackageSearch size={36} className="text-[#C9A45B]" />
                            <p className="mt-3 font-black">Tidak ada produk</p>
                            <p className="text-sm text-[#184D47]/60">Coba ubah kata kunci atau filter kategori.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                            {filteredProducts.map((product) => {
                                const inCart = cart.find((line) => line.productId === product.id);
                                const outOfStock = product.stock <= 0;
                                const maxed = inCart && inCart.quantity >= Math.max(1, product.stock);
                                return (
                                    <article
                                        key={product.id}
                                        className="group flex flex-col overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/90 shadow-md shadow-[#184D47]/5 transition hover:-translate-y-0.5 hover:shadow-lg"
                                    >
                                        <div className="relative aspect-[4/3] overflow-hidden bg-[#f8f0dd]">
                                            {product.image ? (
                                                <Image
                                                    src={product.image}
                                                    alt={product.name}
                                                    fill
                                                    sizes="(max-width: 640px) 50vw, 25vw"
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                            ) : (
                                                <div className="grid h-full place-items-center text-[#C9A45B]">
                                                    <PackageSearch size={32} />
                                                </div>
                                            )}
                                            {outOfStock && (
                                                <span className="absolute left-2 top-2 rounded-full bg-black/80 px-2 py-1 text-[10px] font-black uppercase text-white">
                                                    Stok Habis
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-1 flex-col p-3">
                                            <h3 className="line-clamp-2 text-sm font-black leading-tight">{product.name}</h3>
                                            {product.size && <p className="mt-1 text-xs text-[#184D47]/55">Ukuran {product.size}</p>}
                                            <div className="mt-auto flex items-end justify-between pt-3">
                                                <div>
                                                    <p className="text-sm font-black text-[#0F4C45]">{formatRupiah(product.price)}</p>
                                                    <p className="text-[11px] font-semibold text-[#184D47]/50">Stok {product.stock}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => addToCart(product)}
                                                    disabled={outOfStock || !!maxed}
                                                     className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#184D47] text-white transition active:scale-90 disabled:cursor-not-allowed disabled:bg-[#184D47]/30"
                                                    aria-label={`Tambah ${product.name} ke keranjang`}
                                                >
                                                    <Plus size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                <aside className={`kasir-cart-panel ${mobileCartOpen || checkoutOpen ? "kasir-cart-open" : ""} ${checkoutOpen ? "kasir-mobile-checkout" : ""}`}>
                    <div className="kasir-cart-shell overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/90 shadow-xl shadow-[#184D47]/10">
                        <div className="flex items-center justify-between border-b border-[#184D47]/10 p-5">
                            {checkoutOpen ? <button type="button" onClick={() => setCheckoutOpen(false)} className="mr-2 rounded-xl p-2 lg:hidden" aria-label="Kembali ke keranjang"><ArrowLeft size={20} /></button> : null}
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C9A45B]">{checkoutOpen ? "Checkout" : "Keranjang"}</p>
                                <h2 className="text-2xl font-black">{checkoutOpen ? "Checkout" : "Pesanan Saat Ini"}</h2>
                            </div>
                            {totalItems > 0 && (
                                <span className="rounded-full bg-[#184D47] px-3 py-1.5 text-sm font-black text-white">{totalItems}</span>
                            )}
                            {!checkoutOpen && <button type="button" onClick={() => setMobileCartOpen(false)} className="ml-2 rounded-xl px-2 py-1 text-xl font-black lg:hidden" aria-label="Tutup keranjang">×</button>}
                        </div>

                        {cart.length === 0 ? (
                            /* EMPTY STATE — no checkout form, no totals, no payment: only this block renders. */
                            <div className="kasir-cart-empty">
                                <span className="kasir-cart-empty-icon" aria-hidden="true">
                                    <ShoppingCart size={26} strokeWidth={1.8} />
                                </span>
                                <p className="kasir-cart-empty-title">Keranjang masih kosong</p>
                                <p className="kasir-cart-empty-text">Tambahkan produk dari katalog untuk memulai transaksi.</p>
                            </div>
                        ) : (
                        <>
                        <div className={`kasir-checkout-body ${checkoutOpen ? "kasir-checkout-content" : ""}`}>
                        <div className="kasir-cart-items space-y-3 p-5">
                            {
                                cart.map((line, index) => (
                                    <div key={line.productId ?? `manual-${index}`} className="kasir-cart-item flex min-w-0 items-start gap-3 rounded-2xl bg-[#f8f6f0] p-3">
                                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#f8f0dd]">
                                            {line.image ? (
                                                <Image src={line.image} alt={line.name} fill sizes="56px" className="object-cover" unoptimized />
                                            ) : (
                                                <div className="grid h-full place-items-center text-[#C9A45B]"><PackageSearch size={18} /></div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="kasir-cart-item-name line-clamp-2 text-sm font-black leading-snug">{line.name}</p>
                                            {line.size && <p className="text-[11px] text-[#184D47]/50">Ukuran {line.size}</p>}
                                            <p className="text-xs font-bold text-[#0F4C45]">{formatRupiah(line.price * line.quantity)}</p>
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="kasir-quantity-control flex shrink-0 items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                                                        className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[#184D47] shadow-sm active:scale-90"
                                                        aria-label="Kurangi"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={Math.max(1, line.stock)}
                                                        value={line.quantity}
                                                        onChange={(event) => setQuantity(line.productId, Number(event.target.value))}
                                                        className="h-10 w-12 rounded-lg border border-[#184D47]/10 bg-white text-center text-sm font-black outline-none"
                                                        aria-label="Jumlah"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuantity(line.productId, line.quantity + 1)}
                                                        disabled={line.quantity >= Math.max(1, line.stock)}
                                                        className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[#184D47] shadow-sm active:scale-90 disabled:opacity-40"
                                                        aria-label="Tambah"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeLine(line.productId)}
                                                    className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 transition active:scale-90"
                                                    aria-label="Hapus"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>

                        <div className="kasir-checkout-scroll space-y-4 border-t border-[#184D47]/10 p-5">
                            {/* STEP-BY-STEP PROGRESS INDICATOR */}
                            <div className="border-b border-[#184D47]/10 pb-3">
                                <p className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/60">Langkah Transaksi</p>
                                <div className="flex items-center gap-2">
                                    {[1, 2, 3, 4, 5].filter((s) => s <= (orderType === "PICKUP" ? 2 : 5)).map((step, idx, arr) => {
                                        const isActive = currentStep === step;
                                        const isCompleted = currentStep > step;
                                        return (
                                            <Fragment key={`transaction-step-${step}`}>
                                                <div
                                                    className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                                                        isActive
                                                            ? "bg-[#184D47] text-white"
                                                            : isCompleted
                                                                ? "bg-emerald-600 text-white"
                                                                : "bg-[#184D47]/15 text-[#184D47]/40"
                                                    }`}
                                                >
                                                    {isCompleted ? <Check size={14} /> : step}
                                                </div>
                                                {idx < arr.length - 1 && <div className="h-0.5 w-6 flex-1 bg-[#184D47]/15" />}
                                            </Fragment>
                                        );
                                    })}
                                </div>
                                <p className="mt-1 text-xs font-semibold text-[#184D47]">
                                    {currentStep === 1 && "Tambahkan produk ke keranjang"}
                                    {currentStep === 2 && (orderType === "PICKUP" ? "Pilih metode pembayaran" : "Lengkapi alamat penerima")}
                                    {currentStep === 3 && "Pilih layanan ongkir"}
                                    {currentStep === 4 && "Konfirmasi pembayaran"}
                                    {currentStep === 5 && "Siapkan untuk pengiriman"}
                                </p>
                            </div>

                            {/* JENIS PESANAN — Ambil Sendiri (default) or Kirim */}
                            <div>
                                <p className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Jenis Pesanan</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["PICKUP", "DELIVERY"] as KasirOrderType[]).map((type) => {
                                        const Icon = type === "PICKUP" ? Store : Truck;
                                        return (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setOrderType(type)}
                                                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-bold transition ${orderType === type ? "border-[#184D47] bg-[#184D47] text-white" : "border-[#184D47]/15 bg-white text-[#184D47]/70 hover:border-[#184D47]/40"}`}
                                            >
                                                <Icon size={18} />
                                                {kasirOrderTypeLabel(type)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* PENERIMA — required for Kirim */}
                            <div className="space-y-3">
                                <p className="text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">
                                    {orderType === "DELIVERY" ? "Penerima" : "Pelanggan"}
                                </p>
                                <label className="flex items-center gap-2 rounded-2xl border border-[#184D47]/15 bg-white px-3">
                                    <User size={16} className="shrink-0 text-[#C9A45B]" />
                                    <input
                                        value={customerName}
                                        onChange={(event) => setCustomerName(event.target.value)}
                                        placeholder={orderType === "DELIVERY" ? "Nama penerima (wajib)" : "Nama pelanggan"}
                                        className="h-12 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#184D47]/40"
                                    />
                                </label>
                                <label className="flex items-center gap-2 rounded-2xl border border-[#184D47]/15 bg-white px-3">
                                    <Phone size={16} className="shrink-0 text-[#C9A45B]" />
                                    <input
                                        value={customerWhatsapp}
                                        onChange={(event) => setCustomerWhatsapp(event.target.value)}
                                        placeholder={orderType === "DELIVERY" ? "Nomor WhatsApp penerima (wajib)" : "Nomor WhatsApp (opsional)"}
                                        inputMode="tel"
                                        className="h-12 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#184D47]/40"
                                    />
                                </label>
                            </div>

                            {/* ALAMAT + PENGIRIMAN — only for Kirim */}
                            {orderType === "DELIVERY" ? (
                                <KasirDeliveryPanel
                                    draft={deliveryDraft}
                                    onPatch={patchDelivery}
                                    items={deliveryItems}
                                    recipientName={customerName}
                                    recipientPhone={customerWhatsapp}
                                />
                            ) : null}
                        </div>

                        <div className="space-y-4 border-t border-[#184D47]/10 p-5">
                            <div className="flex justify-between text-sm font-semibold">
                                <span className="text-[#184D47]/60">Subtotal Produk</span>
                                <span className="font-black">{rupiah.format(subtotal)}</span>
                            </div>
                            {orderType === "DELIVERY" ? (
                                <div className="flex justify-between text-sm font-semibold">
                                    <span className="text-[#184D47]/60">Ongkir</span>
                                    <span className="font-black">
                                        {deliveryShipping > 0 ? rupiah.format(deliveryShipping) : "Belum dipilih"}
                                    </span>
                                </div>
                            ) : null}
                            <div className="flex justify-between border-t border-[#184D47]/10 pt-3 text-lg font-black">
                                <span>Total</span>
                                <span className="text-[#0F4C45]">{rupiah.format(orderTotal)}</span>
                            </div>

                            <div>
                                <p className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Metode Pembayaran</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {PAYMENT_METHODS.map((method) => {
                                        const Icon = method.id === "TUNAI" ? Banknote : method.id === "QRIS" ? QrCode : Smartphone;
                                        return (
                                            <button
                                                key={method.id}
                                                type="button"
                                                onClick={() => setPaymentMethod(method.id)}
                                                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-bold transition ${paymentMethod === method.id ? "border-[#184D47] bg-[#184D47] text-white" : "border-[#184D47]/15 bg-white text-[#184D47]/70 hover:border-[#184D47]/40"}`}
                                            >
                                                <Icon size={18} />
                                                {method.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {paymentMethod === "TUNAI" && (
                                <div className="space-y-3 rounded-2xl bg-[#f8f6f0] p-4">
                                    <label className="block space-y-1.5">
                                        <span className="text-xs font-bold text-[#184D47]/60">Uang Diterima</span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={cashReceived}
                                            onChange={(event) => setCashReceived(event.target.value)}
                                            placeholder="Masukkan nominal uang"
                                            className="min-h-12 w-full rounded-2xl border border-[#184D47]/15 bg-white px-4 font-black outline-none focus:border-[#C9A45B]"
                                        />
                                    </label>
                                    <div className="flex justify-between text-sm font-semibold">
                                        <span className="text-[#184D47]/60">Kembalian</span>
                                        <span className={`font-black ${change > 0 ? "text-emerald-700" : ""}`}>{rupiah.format(change)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Sumber Transaksi — only shown for PICKUP orders; DELIVERY uses canonical TATAP_MUKA internally */}
                            {orderType === "PICKUP" && (
                                <div>
                                    <p className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Sumber Transaksi</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(["TATAP_MUKA", "WHATSAPP", "MARKETPLACE", "OTHER"] as const).map((item) => (
                                            <button
                                                key={item}
                                                type="button"
                                                onClick={() => setSource(item)}
                                                className={`min-h-12 rounded-2xl border px-3 text-xs font-bold transition ${source === item ? "border-[#184D47] bg-[#184D47] text-white" : "border-[#184D47]/15 bg-white text-[#184D47]/70 hover:border-[#184D47]/40"}`}
                                            >
                                                {item === "TATAP_MUKA" ? "Kasir / Toko" : item === "WHATSAPP" ? "WhatsApp" : item === "MARKETPLACE" ? "Marketplace" : "Lainnya"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Penerima/pelanggan inputs live in the PENERIMA section above. */}
                        </div>
                        </div>

                        {/* STICKY CHECKOUT FOOTER — presentation only. Total = existing orderTotal; CTA = existing step flow / submitOrder(). */}
                        <div className="kasir-checkout-footer">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-[#184D47]/60">Total</span>
                                <span className="text-xl font-black text-[#0F4C45]">{rupiah.format(orderTotal)}</span>
                            </div>

                            {/* STEP NAVIGATION BUTTONS */}
                            {currentStep < (orderType === "PICKUP" ? 2 : 5) ? (
                                // NEXT BUTTON for intermediate steps
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!checkoutOpen) {
                                            setCheckoutOpen(true);
                                            return;
                                        }
                                        // ONE-CLICK UX: If ALL data complete, submit immediately without requiring step-by-step clicks.
                                        if (allRequirementsMet()) {
                                            void submitOrder();
                                        } else {
                                            setCurrentStep(prev => Math.min(prev + 1, orderType === "PICKUP" ? 2 : 5));
                                        }
                                    }}
                                    disabled={!canNextStep(currentStep, orderType, deliveryReadiness, deliveryDraft) || submitting}
                                    className="kasir-checkout-cta"
                                    title={
                                        cart.length === 0
                                            ? "Tambahkan produk terlebih dahulu"
                                            : currentStep === 1 && !allRequirementsMet()
                                                ? "Lengkapi alamat, ongkir (jika kirim), dan uang diterima (jika TUNAI)"
                                                : currentStep === 2 && orderType === "DELIVERY"
                                                    ? deliveryReadiness.reason ?? "Alamat belum valid"
                                                    : currentStep === 3 && orderType === "DELIVERY"
                                                        ? "Pilih ongkir terlebih dahulu"
                                                        : "Selesaikan transaksi sekali klik"
                                    }
                                >
                                    {submitting ? (
                                        <><Loader2 size={18} className="animate-spin" /> Memproses...</>
                                    ) : checkoutOpen && allRequirementsMet() ? (
                                        <><CheckCircle2 size={18} /> Buat Pesanan • {rupiah.format(orderTotal)}</>
                                    ) : (
                                        <>Lanjutkan Checkout <ArrowRight size={18} /></>
                                    )}
                                </button>
                            ) : (
                                // FINAL SUBMIT BUTTON after payment (step 5)
                                <button
                                    type="button"
                                    onClick={() => void submitOrder()}
                                    disabled={submitting || totalItems === 0 || (orderType === "DELIVERY" && !deliveryReadiness.ready)}
                                    className="kasir-checkout-cta"
                                    title={
                                        totalItems === 0
                                            ? "Tambahkan produk terlebih dahulu"
                                            : orderType === "DELIVERY" && !deliveryReadiness.ready
                                                ? deliveryReadiness.reason ?? "Lengkapi data pengiriman"
                                                : "Selesaikan transaksi"
                                    }
                                >
                                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                    {submitting ? "Memproses..." : `Buat Pesanan • ${rupiah.format(orderTotal)}`}
                                </button>
                            )}

                            {cart.length > 0 && currentStep > 1 && (
                                // BACK BUTTON appears for steps > 1
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(prev => prev - 1)}
                                    disabled={submitting}
                                    className="kasir-checkout-back"
                                >
                                    <ArrowLeft size={16} />
                                    Kembali
                                </button>
                            )}
                        </div>
                        </>
                        )}
                    </div>
                </aside>
            </main>
            {cart.length > 0 && !checkoutOpen ? <button type="button" onClick={() => setMobileCartOpen(true)} className="kasir-mobile-cart-bar lg:hidden"><span><b>{totalItems} Item</b><small>Lihat Keranjang</small></span><strong>{rupiah.format(orderTotal)}</strong></button> : null}
            {manualOpen ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
                    <div className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[#F8F5EE] p-5 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">Tambah Item Manual</h2><button type="button" onClick={() => setManualOpen(false)} className="rounded-xl px-3 py-2 font-black">×</button></div>
                        <div className="space-y-3">
                            <select value={manualType} onChange={(e) => setManualType(e.target.value as "CUSTOM_PRODUCT" | "SERVICE")} className="min-h-12 w-full rounded-xl border border-[#184D47]/15 bg-white px-3 font-bold"><option value="CUSTOM_PRODUCT">Barang Custom</option><option value="SERVICE">Jasa</option></select>
                            <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Nama barang/jasa *" className="min-h-12 w-full rounded-xl border border-[#184D47]/15 bg-white px-3" />
                            <textarea value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="Deskripsi" className="min-h-20 w-full rounded-xl border border-[#184D47]/15 bg-white px-3 py-3" />
                            <div className="grid grid-cols-2 gap-3"><input type="number" min="1" value={manualQuantity} onChange={(e) => setManualQuantity(e.target.value)} placeholder="Qty" className="min-h-12 rounded-xl border border-[#184D47]/15 bg-white px-3" /><input type="number" min="0" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Harga satuan *" className="min-h-12 rounded-xl border border-[#184D47]/15 bg-white px-3" /></div>
                            <textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="Catatan" className="min-h-20 w-full rounded-xl border border-[#184D47]/15 bg-white px-3 py-3" />
                            <div className="flex gap-3"><button type="button" onClick={() => setManualOpen(false)} className="min-h-12 flex-1 rounded-xl border border-[#184D47]/20 bg-white font-black">Batal</button><button type="button" onClick={addManualItem} className="min-h-12 flex-1 rounded-xl bg-[#184D47] font-black text-white">Tambahkan</button></div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
