"use client";

// ---------------------------------------------------------------------------
// Guest Pre-Order form (no login). The browser only sends
// { customer, phone, pickupDate, note, items:[{productId, quantity}], startedAt, website }.
// Prices shown here are previews from the public catalog; the server resolves
// the real price from the DB and recomputes every total.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchProducts, type Product } from "@/lib/products";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import GuestProductPicker from "./GuestProductPicker";
import GuestPreOrderSummary from "./GuestPreOrderSummary";
import { buildGuestPayload, canSubmitGuest, clampQty, GUEST_FORM_MAX_ITEMS, type GuestLine } from "./guest-pre-order-shared";

export default function GuestPreOrderForm() {
    const router = useRouter();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [lines, setLines] = useState<GuestLine[]>([]);
    const [customer, setCustomer] = useState("");
    const [phone, setPhone] = useState("");
    const [pickupDate, setPickupDate] = useState("");
    const [note, setNote] = useState("");
    const [website, setWebsite] = useState(""); // honeypot
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    // Form open time (for the server-side minimum fill-time bot check). Set on mount, not during render.
    const startedAt = useRef(0);
    const preselectedProductId = useRef<string | null>(null);
    useEffect(() => { startedAt.current = Date.now(); }, []);
    useEffect(() => {
        preselectedProductId.current = new URLSearchParams(window.location.search).get("productId");
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        setLoadError("");
        fetchProducts()
            .then((rows) => {
                const activeRows = rows.filter((p) => p.isActive !== false);
                setProducts(activeRows);
                const selected = preselectedProductId.current;
                if (selected && activeRows.some((p) => p.id === selected)) {
                    setLines([{ productId: selected, quantity: 1, notes: "" }]);
                }
            })
            .catch(() => setLoadError("Produk belum dapat dimuat. Silakan coba lagi."))
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => { load(); }, [load]);

    const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
    const subtotal = useMemo(() => lines.reduce((sum, l) => sum + (byId.get(l.productId)?.price ?? 0) * l.quantity, 0), [lines, byId]);

    const setQty = (productId: string, qty: number) => setLines((rows) => rows.map((r) => (r.productId === productId ? { ...r, quantity: clampQty(qty) } : r)));
    const add = (productId: string) =>
        setLines((rows) => {
            if (rows.some((r) => r.productId === productId)) return rows.map((r) => (r.productId === productId ? { ...r, quantity: clampQty(r.quantity + 1) } : r));
            return rows.length >= GUEST_FORM_MAX_ITEMS ? rows : [...rows, { productId, quantity: 1, notes: "" }];
        });
    const remove = (productId: string) => setLines((rows) => rows.filter((r) => r.productId !== productId));
    const canSubmit = canSubmitGuest({ busy, lines, customer, phone });

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/pre-orders/guest", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(buildGuestPayload({ customer, phone, pickupDate, note, lines, startedAt: startedAt.current, website })),
            });
            const data = (await response.json().catch(() => ({}))) as { message?: string; publicToken?: string };
            if (!response.ok) throw new Error(data.message || "Pengajuan pre-order gagal.");
            if (!data.publicToken) throw new Error("Pengajuan tersimpan tetapi tautan pelacakan tidak tersedia.");
            router.push(`/pre-order/${encodeURIComponent(data.publicToken)}?baru=1`);
        } catch (e) {
            setError(getUserFacingMessage(e, "Pengajuan pre-order gagal. Coba lagi."));
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="relative grid gap-6 lg:grid-cols-[1fr_380px]" data-testid="guest-pre-order-form">
            <GuestProductPicker products={products} loading={loading} loadError={loadError} onRetry={load} lines={lines} add={add} remove={remove} setQty={setQty} />
            <GuestPreOrderSummary {...{ lines, byId, subtotal, customer, setCustomer, phone, setPhone, pickupDate, setPickupDate, note, setNote, website, setWebsite, remove, setQty, busy, error, canSubmit }} />
        </form>
    );
}
