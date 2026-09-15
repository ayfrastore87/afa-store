"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Home, Loader2, LocateFixed, MapPin, PackageOpen, Search, Truck } from "lucide-react";
import type { CheckoutItem } from "@/lib/checkout";
import { formatRupiah } from "@/lib/products";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import type { DeliveryCoordinates } from "@/lib/coordinates";
import { CheckoutLocationMap } from "@/components/checkout/location-map";
import { CheckoutLocationSearch } from "@/components/checkout/location-search";
import type { LocationSearchResult } from "@/lib/geocoding-normalize";
import { buildAreaSearchQueries, pickBestAreaMatch, type AreaAddressInput } from "@/lib/area-match";

type Session = { items: CheckoutItem[]; subtotal: number };

type ProfileAddress = {
    id: string;
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    village: string;
    postalCode: string;
    detail: string;
    note?: string | null;
    isDefault: boolean;
};

type Area = { id: string; name: string; type?: string; postalCode?: string; province?: string; city?: string; district?: string };

type Rate = { courierCode: string; courierName: string; serviceCode: string; serviceName: string; price: number; duration: string | null; quoteRef: string | null };

type AddressMode = "profile" | "dropship" | "other";

const PAYMENT_METHOD = "QRIS" as const;
const paymentMethods = [PAYMENT_METHOD] as const;
const paymentLabels: Record<(typeof paymentMethods)[number], string> = { QRIS: "QRIS" };

type RateState = "idle" | "loading" | "ready" | "empty" | "unavailable" | "configuration" | "error";

type AreaState = "idle" | "matching" | "matched" | "not_found";

type ReverseState = "idle" | "loading" | "done" | "error";

type GeoState = "idle" | "locating";

const emptyForm = {
    recipientName: "", phone: "", email: "", address: "", note: "",
    province: "", city: "", district: "", village: "", postalCode: "",
    paymentMethod: "QRIS",
};

function geoErrorMessage(err: GeolocationPositionError): string {
    switch (err.code) {
        case err.PERMISSION_DENIED:
            return "Izin lokasi tidak diberikan. Anda tetap dapat memilih titik langsung di peta.";
        case err.POSITION_UNAVAILABLE:
            return "GPS/lokasi perangkat tidak tersedia. Pilih titik langsung di peta.";
        case err.TIMEOUT:
            return "Pengambilan lokasi terlalu lama. Pilih titik langsung di peta.";
        default:
            return "Gagal mengambil lokasi. Pilih titik langsung di peta.";
    }
}

export default function CheckoutPage() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [paying, setPaying] = useState(false);
    const [processing, setProcessing] = useState(false);

    const [mode, setMode] = useState<AddressMode>("other");
    const [profileAddresses, setProfileAddresses] = useState<ProfileAddress[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);

    const [senderName, setSenderName] = useState("");
    const [senderPhone, setSenderPhone] = useState("");
    const [hidePrice, setHidePrice] = useState(true);

    // Map-first location.
    const [deliveryLocation, setDeliveryLocation] = useState<DeliveryCoordinates | null>(null);
    const [reverseState, setReverseState] = useState<ReverseState>("idle");
    const [geoState, setGeoState] = useState<GeoState>("idle");
    const [locationMessage, setLocationMessage] = useState("");
    const reverseRef = useRef(0);

    // Biteship area auto-match + fallback search.
    const [areaState, setAreaState] = useState<AreaState>("idle");
    const [destinationArea, setDestinationArea] = useState<Area | null>(null);
    const [areaQuery, setAreaQuery] = useState("");
    const [areaOptions, setAreaOptions] = useState<Area[]>([]);
    const [areaSearching, setAreaSearching] = useState(false);
    const areaRequestRef = useRef(0);

    const [rates, setRates] = useState<Rate[]>([]);
    const [rateState, setRateState] = useState<RateState>("idle");
    const [rateError, setRateError] = useState("");
    const [selected, setSelected] = useState<{ courierCode: string; serviceCode: string } | null>(null);
    const rateRequestRef = useRef(0);
    const [rateReload, setRateReload] = useState(0);

    const submittingRef = useRef(false);
    const keyRef = useRef<string | null>(null);
    const fingerprintRef = useRef("");

    const setAreaField = (patch: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...patch }));

    const resetAll = () => {
        setDestinationArea(null);
        setAreaState("idle");
        setAreaQuery("");
        setAreaOptions([]);
        setAreaSearching(false);
        setSelected(null);
        setRates([]);
        setRateState("idle");
        setRateError("");
    };

    useEffect(() => {
        fetch("/api/checkout/session")
            .then(async (r) => {
                const d = await r.json().catch(() => ({}));
                if (r.status === 401) { window.location.href = d.redirectTo || "/login"; return; }
                if (!r.ok || !d.items?.length) throw new Error();
                setSession(d);
            })
            .catch(() => setError("Checkout sudah tidak tersedia."))
            .finally(() => setLoading(false));

        fetch("/api/account/addresses")
            .then((r) => (r.ok ? r.json() : { addresses: [] }))
            .then((d: { addresses?: ProfileAddress[] }) => {
                const list = d.addresses || [];
                setProfileAddresses(list);
                const chosen = list.find((a) => a.isDefault) || list[0];
                if (chosen) { setMode("profile"); selectProfile(chosen); }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectProfile = (a: ProfileAddress) => {
        setSelectedProfileId(a.id);
        setForm({
            ...emptyForm,
            recipientName: a.recipientName,
            phone: a.phone,
            province: a.province,
            city: a.city,
            district: a.district,
            village: a.village,
            postalCode: a.postalCode,
            address: a.detail,
            note: a.note || "",
            paymentMethod: "QRIS",
        });
        resetAll();
    };

    const update = (name: keyof typeof emptyForm, value: string) => setForm((f) => ({ ...f, [name]: value }));

    const switchMode = (next: AddressMode) => {
        setMode(next);
        resetAll();
    };

    // Reverse-geocode a coordinate and auto-fill the address + auto-match Biteship area.
    const reverseGeocodeAndFill = async (coords: DeliveryCoordinates) => {
        const requestId = ++reverseRef.current;
        setReverseState("loading");
        setLocationMessage("Mengenali alamat...");
        try {
            const r = await fetch(`/api/location/reverse?lat=${coords.latitude}&lng=${coords.longitude}`);
            const d = await r.json().catch(() => ({}));
            if (requestId !== reverseRef.current) return;
            if (!r.ok || !d.result) {
                setReverseState("error");
                setLocationMessage("Gagal mengenali alamat. Anda tetap dapat mengisi manual.");
                return;
            }
            const result = d.result as LocationSearchResult;
            const a = result.address;
            const nextForm = {
                ...form,
                address: [a.road, a.houseNumber].filter(Boolean).join(" ") || result.displayName,
                province: a.province || "",
                city: a.city || a.regency || "",
                district: a.district || "",
                village: a.village || "",
                postalCode: a.postcode || "",
            };
            setForm(nextForm);
            setReverseState("done");
            setLocationMessage("");
            void matchArea({
                province: nextForm.province,
                city: nextForm.city,
                district: nextForm.district,
                village: nextForm.village,
                postcode: nextForm.postalCode,
            });
        } catch {
            if (requestId === reverseRef.current) {
                setReverseState("error");
                setLocationMessage("Gagal mengenali alamat. Silakan coba lagi.");
            }
        }
    };

    // Auto-match reverse-geocoded address to an OFFICIAL Biteship area result.
    const matchArea = async (address: AreaAddressInput) => {
        if (!Object.values(address).some(Boolean)) { setAreaState("not_found"); return; }
        setAreaState("matching");
        const queries = buildAreaSearchQueries(address);
        for (const q of queries) {
            try {
                const r = await fetch(`/api/shipping/areas?input=${encodeURIComponent(q)}`);
                const d = await r.json().catch(() => ({}));
                if (!r.ok) continue;
                const areas: Area[] = d.areas || [];
                if (!areas.length) continue;
                const best = pickBestAreaMatch(areas, address);
                if (best) {
                    setDestinationArea(best);
                    setAreaQuery(best.name);
                    setAreaState("matched");
                    return;
                }
                // No strong match: do NOT fall back to areas[0]. Requiring the
                // customer to pick the official Biteship area manually is safer
                // than auto-selecting a possibly-wrong kelurahan/kecamatan.
            } catch {
                // try next query
            }
        }
        setDestinationArea(null);
        setSelected(null);
        setAreaState("not_found");
    };

    const handleMapSelect = (coords: DeliveryCoordinates) => {
        setDeliveryLocation(coords);
        void reverseGeocodeAndFill(coords);
    };

    const handleSearchSelect = (result: LocationSearchResult) => {
        const coords = { latitude: result.latitude, longitude: result.longitude };
        setDeliveryLocation(coords);
        void reverseGeocodeAndFill(coords);
    };

    const useMyLocation = () => {
        if (!("geolocation" in navigator)) {
            setLocationMessage("Perangkat ini tidak mendukung lokasi. Pilih titik di peta.");
            return;
        }
        setGeoState("locating");
        setLocationMessage("Mencari lokasi Anda...");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setGeoState("idle");
                const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
                setDeliveryLocation(coords);
                setLocationMessage("");
                void reverseGeocodeAndFill(coords);
            },
            (err) => {
                setGeoState("idle");
                setLocationMessage(geoErrorMessage(err));
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
        );
    };

    // Fallback area search (debounced) when auto-match fails.
    useEffect(() => {
        const q = areaQuery.trim();
        setAreaOptions([]);
        if (destinationArea && q !== destinationArea.name) setDestinationArea(null);
        if (q.length < 3) { setAreaSearching(false); return; }
        const requestId = ++areaRequestRef.current;
        const timer = setTimeout(async () => {
            setAreaSearching(true);
            try {
                const r = await fetch(`/api/shipping/areas?input=${encodeURIComponent(q)}`);
                const d = await r.json().catch(() => ({}));
                if (requestId !== areaRequestRef.current) return;
                if (!r.ok) { setAreaOptions([]); setAreaSearching(false); return; }
                setAreaOptions(d.areas || []);
            } catch {
                if (requestId === areaRequestRef.current) setAreaOptions([]);
            } finally {
                if (requestId === areaRequestRef.current) setAreaSearching(false);
            }
        }, 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [areaQuery]);

    const chooseArea = (a: Area) => {
        setDestinationArea(a);
        setAreaQuery(a.name);
        setAreaOptions([]);
        setAreaState("matched");
        setSelected(null);
        setAreaField({ province: a.province || "", city: a.city || "", district: a.district || a.name, postalCode: a.postalCode || "" });
    };

    // Auto-fetch rates once a valid destinationAreaId is selected.
    useEffect(() => {
        if (!session?.items?.length || !destinationArea) { setRates([]); setRateState("idle"); setSelected(null); return; }
        const requestId = ++rateRequestRef.current;
        setRateState("loading");
        setRateError("");
        setSelected(null);
        fetch("/api/shipping/rates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destinationAreaId: destinationArea.id, items: session.items.map(({ id, qty }) => ({ id, qty })) }),
        })
            .then(async (r) => {
                const d = await r.json().catch(() => ({}));
                if (requestId !== rateRequestRef.current) return;
                if (r.status === 503) {
                    if (d.code === "CONFIGURATION") { setRateState("configuration"); setRateError("Layanan pengiriman belum dapat digunakan."); }
                    else { setRateState("unavailable"); setRateError("Layanan pengiriman sedang mengalami gangguan. Silakan coba lagi."); }
                    return;
                }
                if (r.status === 404) { setRateState("empty"); setRateError(""); return; }
                if (!r.ok) { setRateState("error"); setRateError("Gagal memuat ongkir. Silakan coba lagi."); return; }
                const list = d.rates || [];
                if (!list.length) { setRateState("empty"); return; }
                setRates(list);
                setRateState("ready");
            })
            .catch(() => { if (requestId === rateRequestRef.current) { setRateState("unavailable"); setRateError("Layanan pengiriman sedang mengalami gangguan. Silakan coba lagi."); } });
    }, [destinationArea, session?.items, rateReload]);

    const selectRate = (rate: Rate) => setSelected({ courierCode: rate.courierCode, serviceCode: rate.serviceCode });
    const selectedRate = selected ? rates.find((r) => r.courierCode === selected.courierCode && r.serviceCode === selected.serviceCode) ?? null : null;
    const shipping = selectedRate?.price ?? 0;
    const total = (session?.subtotal ?? 0) + shipping;
    const groupedRates = groupByCourier(rates);

    const destinationValid = Boolean(destinationArea?.id);
    const shippingReady = Boolean(selectedRate);
    const dropshipValid = mode !== "dropship" || senderName.trim().length > 0;
    const canSubmit = destinationValid && shippingReady && dropshipValid && !paying && !processing;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submittingRef.current || !session) return;
        if (!destinationArea || !selectedRate) { setError("Pilih jasa kurir sebelum melanjutkan."); return; }
        if (mode === "dropship" && !senderName.trim()) { setError("Nama pengirim (dropshipper) wajib diisi."); return; }
        submittingRef.current = true;
        setPaying(true);
        setError("");

        const payload = {
            recipientName: form.recipientName,
            phone: form.phone,
            email: form.email || undefined,
            address: form.address,
            note: form.note || undefined,
            province: form.province,
            city: form.city,
            district: form.district,
            postalCode: form.postalCode,
            paymentMethod: form.paymentMethod,
            senderName: mode === "dropship" ? (senderName || undefined) : undefined,
            senderPhone: mode === "dropship" ? (senderPhone || undefined) : undefined,
            hidePrice: mode === "dropship" ? hidePrice : undefined,
            destinationAreaId: destinationArea.id,
            courierCode: selectedRate.courierCode,
            courierName: selectedRate.courierName,
            serviceCode: selectedRate.serviceCode,
            serviceName: selectedRate.serviceName,
            quoteRef: selectedRate.quoteRef,
            destinationLatitude: deliveryLocation?.latitude,
            destinationLongitude: deliveryLocation?.longitude,
            destinationProvince: form.province,
            destinationCity: form.city,
            destinationDistrict: form.district,
            destinationVillage: form.village,
            destinationPostalCode: form.postalCode,
        };

        const fingerprint = JSON.stringify({ payload, items: session.items.map(({ id, qty }) => ({ id, qty })) });
        if (fingerprint !== fingerprintRef.current) { fingerprintRef.current = fingerprint; keyRef.current = crypto.randomUUID(); }

        try {
            const r = await fetch("/api/checkout/order", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current! }, body: JSON.stringify(payload) });
            const d = await r.json().catch(() => ({}));
            if (r.status === 409 && d.status === "PROCESSING") { setProcessing(true); return; }
            if (!r.ok || !d.redirectTo) throw new Error(d.message || d.error || "Order belum berhasil dibuat.");
            window.location.href = d.redirectTo;
        } catch (e) {
            setError(getUserFacingMessage(e, "Order belum berhasil dibuat. Silakan coba lagi."));
        } finally {
            submittingRef.current = false;
            setPaying(false);
        }
    };

    if (loading) return <main aria-busy="true" className="min-h-screen bg-[#F8F5EE] p-6"><div className="skeleton mx-auto h-96 max-w-5xl rounded-[28px]" /></main>;
    if (!session) return <main className="grid min-h-screen place-items-center bg-[#F8F5EE] p-6 text-center"><div><h1 className="font-display text-4xl font-bold text-[#123524]">{error || "Checkout sudah tidak tersedia."}</h1><Link href="/cart" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-[#123524] px-6 font-bold text-white">Kembali ke Keranjang</Link></div></main>;

    return (
        <main className="min-h-screen bg-[#F8F5EE] px-4 py-8 pb-28 text-[#2E2A26] md:px-8 lg:pb-8">
            <div className="mx-auto max-w-[1240px]">
                <Link href="/cart" className="font-semibold text-[#8B6B3F]">&larr; Kembali ke Keranjang</Link>
                <h1 className="mt-6 font-display text-3xl font-bold text-[#123524] md:text-5xl">Selesaikan Pesanan</h1>

                <form onSubmit={submit} className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
                    {/* LEFT COLUMN — map-first address flow */}
                    <div className="space-y-6">
                        <Panel title="Alamat Pengiriman">
                            <div className="grid grid-cols-3 gap-2">
                                <ModeButton icon={<Home size={16} />} label="Alamat Saya" active={mode === "profile"} onClick={() => switchMode("profile")} />
                                <ModeButton icon={<PackageOpen size={16} />} label="Dropshipper" active={mode === "dropship"} onClick={() => switchMode("dropship")} />
                                <ModeButton icon={<MapPin size={16} />} label="Alamat Lain" active={mode === "other"} onClick={() => switchMode("other")} />
                            </div>

                            {mode === "profile" && (
                                <div className="mt-4 space-y-2">
                                    {profileAddresses.length === 0 && <p className="text-sm text-[#6D6558]">Belum ada alamat tersimpan. Gunakan mode Lain.</p>}
                                    {profileAddresses.map((a) => (
                                        <button type="button" key={a.id} onClick={() => selectProfile(a)} className={`w-full rounded-xl border p-3 text-left ${selectedProfileId === a.id ? "border-[#184D47] bg-[#EAF1ED]" : "border-[#C9A45B]/30"}`}>
                                            <span className="flex items-center justify-between gap-2">
                                                <b className="text-sm">{a.isDefault ? "Alamat Utama · " : ""}{a.recipientName}</b>
                                                {selectedProfileId === a.id && <Check size={16} className="shrink-0 text-[#184D47]" />}
                                            </span>
                                            <span className="block text-sm text-[#6D6558]">{a.phone} · {a.detail}, {a.district}, {a.city}, {a.province} {a.postalCode}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </Panel>

                        <Panel title="1 · Pilih Lokasi di Peta">
                            <p className="mb-3 text-sm text-[#6D6558]">Cari alamat atau klik langsung di peta untuk memilih lokasi.</p>
                            <div className="mb-3 space-y-2">
                                <CheckoutLocationSearch onSelect={handleSearchSelect} />
                                <button type="button" onClick={useMyLocation} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#184D47] px-4 text-sm font-bold text-[#184D47] hover:bg-[#EAF1ED]">
                                    {geoState === "locating" ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                                    {geoState === "locating" ? "Mencari lokasi Anda..." : "Gunakan Lokasi Saya"}
                                </button>
                            </div>
                            <CheckoutLocationMap value={deliveryLocation} onChange={handleMapSelect} />
                            {reverseState === "loading" && <p className="mt-2 text-sm text-[#6D6558]"><Loader2 size={14} className="mr-1 inline animate-spin" />Mengenali alamat...</p>}
                            {locationMessage && <p className="mt-2 text-sm text-[#8B6B3F]">{locationMessage}</p>}
                            {reverseState === "done" && deliveryLocation && (
                                <div className="mt-3 rounded-xl border border-[#184D47]/30 bg-[#EAF1ED] p-3 text-sm">
                                    <p className="flex items-center gap-2 font-bold text-[#184D47]"><Check size={16} /> Lokasi berhasil dipilih</p>
                                    <p className="mt-1 text-[#2E2A26]">{form.address}</p>
                                    <p className="text-xs text-[#6D6558]">{[form.village, form.district, form.city, form.province, form.postalCode].filter(Boolean).join(", ")}</p>
                                </div>
                            )}
                        </Panel>

                        <Panel title="Data Penerima">
                            <div className="grid gap-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Nama Penerima *" value={form.recipientName} onChange={(v) => update("recipientName", v)} placeholder="Contoh: Siti Nurhaliza" />
                                    <Field label="Nomor HP *" value={form.phone} onChange={(v) => update("phone", v)} placeholder="Contoh: 0812 3456 7890" />
                                </div>
                                <Field label="Alamat Lengkap *" value={form.address} onChange={(v) => update("address", v)} placeholder="Contoh: Jl. Melati No. 12 RT 03/RW 05" />

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Provinsi" value={form.province} onChange={(v) => update("province", v)} placeholder="Provinsi" />
                                    <Field label="Kota / Kabupaten" value={form.city} onChange={(v) => update("city", v)} placeholder="Kota / Kabupaten" />
                                    <Field label="Kecamatan" value={form.district} onChange={(v) => update("district", v)} placeholder="Kecamatan" />
                                    <Field label="Kelurahan / Desa" value={form.village} onChange={(v) => update("village", v)} placeholder="Kelurahan / Desa" />
                                    <Field label="Kode Pos" value={form.postalCode} onChange={(v) => update("postalCode", v)} placeholder="Kode Pos" />
                                </div>

                                {areaState === "matched" && destinationArea && (
                                    <p className="flex items-center gap-2 rounded-xl bg-[#EAF1ED] p-3 text-sm font-bold text-[#184D47]"><Check size={16} /> Area pengiriman ditemukan: {[destinationArea.name, destinationArea.district, destinationArea.city, destinationArea.province, destinationArea.postalCode].filter(Boolean).join(", ")}</p>
                                )}
                                {areaState === "matching" && <p className="text-sm text-[#6D6558]"><Loader2 size={14} className="mr-1 inline animate-spin" />Mencocokkan area pengiriman...</p>}
                                {areaState === "not_found" && (
                                    <div className="rounded-xl bg-[#FFF2D6] p-3">
                                        <p className="text-sm font-bold text-[#123524]">Kami belum dapat mencocokkan area pengiriman secara otomatis.</p>
                                        <p className="mt-1 text-xs text-[#6D6558]">Cari kecamatan / kelurahan tujuan di bawah ini.</p>
                                        <div className="mt-3">
                                            <AreaAutocomplete
                                                query={areaQuery}
                                                searching={areaSearching}
                                                options={areaOptions}
                                                destination={destinationArea}
                                                onQueryChange={setAreaQuery}
                                                onChoose={chooseArea}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {mode === "dropship" && (
                                <div className="mt-4 grid gap-3 rounded-2xl bg-[#FFF2D6] p-4">
                                    <p className="text-sm font-bold text-[#123524]">Data Pengirim / Dropshipper</p>
                                    <Field label="Nama Pengirim *" value={senderName} onChange={setSenderName} placeholder="Contoh: AFA Gift" />
                                    <Field label="Nomor HP Pengirim" value={senderPhone} onChange={setSenderPhone} placeholder="Contoh: 0812 0000 0000" />
                                    <label className="flex items-start gap-3 text-sm text-[#2E2A26]">
                                        <input type="checkbox" checked={hidePrice} onChange={(e) => setHidePrice(e.target.checked)} className="mt-1 h-4 w-4 accent-[#184D47]" />
                                        <span>Sembunyikan harga dari penerima</span>
                                    </label>
                                    <p className="text-xs text-[#6D6558]">Pesanan dikirim dari gudang AFA STORE. Nama pengirim digunakan sebagai identitas dropshipper.</p>
                                </div>
                            )}

                            {(mode === "profile" || mode === "other") && (
                                <div className="mt-4">
                                    <Field label="Catatan (opsional)" value={form.note} onChange={(v) => update("note", v)} placeholder="Catatan pengiriman" />
                                </div>
                            )}
                        </Panel>
                    </div>

                    {/* RIGHT COLUMN — order summary + shipping + payment */}
                    <aside className="space-y-6 lg:sticky lg:top-6">
                        <div className="luxury-card rounded-[28px] p-5 md:p-6">
                            <h2 className="mb-4 font-display text-2xl font-bold text-[#123524]">Ringkasan Order</h2>
                            {session.items.map((i) => (
                                <div key={i.id} className="flex gap-3 border-b py-3">
                                    <Image src={i.image} alt={i.name} width={56} height={56} className="rounded-xl object-contain" />
                                    <span className="min-w-0 flex-1 break-words">{i.name}<small className="block">{i.qty} &times; {formatRupiah(i.price)}</small></span>
                                </div>
                            ))}
                            <p className="mt-4 flex justify-between">Subtotal <b>{formatRupiah(session.subtotal)}</b></p>
                            <p className="flex justify-between">Pengiriman <b>{shippingReady ? formatRupiah(shipping) : "-"}</b></p>
                            {shippingReady && selectedRate?.duration && <p className="flex justify-between text-xs text-[#6D6558]">Estimasi <b>{selectedRate.duration} hari</b></p>}
                            <p className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">Total <b>{formatRupiah(total)}</b></p>
                            <p className="mt-1 text-xs text-[#6D6558]">Total final divalidasi ulang oleh server saat checkout.</p>
                        </div>

                        <div className="luxury-card rounded-[28px] p-5 md:p-6">
                            <h2 className="mb-3 font-display text-2xl font-bold text-[#123524]">Pilih Metode Pengiriman</h2>
                            <ShippingRates state={rateState} error={rateError} grouped={groupedRates} selected={selected} onSelect={selectRate} onRetry={() => setRateReload((n) => n + 1)} />
                        </div>

                        <div className="luxury-card rounded-[28px] p-5 md:p-6">
                            <h2 className="mb-3 font-display text-2xl font-bold text-[#123524]">Metode Pembayaran</h2>
                            <fieldset>
                                <legend className="sr-only">Metode pembayaran</legend>
                                <div className="space-y-2">
                                    {paymentMethods.map((m) => (
                                        <label key={m} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 ${form.paymentMethod === m ? "border-[#184D47] bg-[#EAF1ED]" : "border-[#C9A45B]/30"}`}>
                                            <input type="radio" name="paymentMethod" checked={form.paymentMethod === m} onChange={() => update("paymentMethod", m)} />
                                            <span className="text-sm font-bold">{paymentLabels[m]}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>

                            {processing && <p role="status" className="mt-3 rounded-xl bg-[#FFF2D6] p-3 text-sm font-bold">Checkout sedang diproses. Silakan tunggu sebentar sebelum mencoba lagi.</p>}
                            {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                            <button type="submit" disabled={!canSubmit} aria-busy={paying} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#123524] font-bold text-white disabled:opacity-60">
                                {paying && <Loader2 size={18} className="animate-spin" />}
                                Buat Pesanan &rarr;
                            </button>
                        </div>
                    </aside>
                </form>
            </div>
        </main>
    );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return <section className="luxury-card rounded-[28px] p-5 md:p-6"><h2 className="mb-4 font-display text-xl font-bold text-[#123524] md:text-2xl">{title}</h2>{children}</section>;
}

function ModeButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold ${active ? "border-[#184D47] bg-[#EAF1ED] text-[#184D47]" : "border-[#C9A45B]/30 text-[#6D6558]"}`}>
            {icon}
            {label}
        </button>
    );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
    return <label className="grid gap-1 text-sm font-semibold text-[#123524]"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-11 rounded-xl border border-[#C9A45B]/30 bg-white px-3 font-normal" /></label>;
}

function AreaAutocomplete({ query, searching, options, destination, onQueryChange, onChoose }: { query: string; searching: boolean; options: Area[]; destination: Area | null; onQueryChange: (value: string) => void; onChoose: (area: Area) => void }) {
    return (
        <div className="space-y-2">
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6D6558]" />
                <input
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Cari kecamatan / kelurahan tujuan"
                    className="min-h-11 w-full rounded-xl border border-[#C9A45B]/30 bg-white pl-9 pr-3"
                    aria-label="Cari kecamatan atau kelurahan tujuan"
                    role="combobox"
                    aria-expanded={options.length > 0}
                    aria-controls="area-options"
                    aria-autocomplete="list"
                />
            </div>
            {searching && <div className="flex items-center gap-2 text-sm text-[#6D6558]"><Loader2 size={14} className="animate-spin" />Mencari area...</div>}
            {!searching && options.length > 0 && (
                <ul id="area-options" className="max-h-52 overflow-auto rounded-xl border border-[#C9A45B]/30" role="listbox">
                    {options.map((a) => (
                        <li key={a.id}>
                            <button type="button" onClick={() => onChoose(a)} className="w-full px-3 py-2 text-left text-sm hover:bg-[#F0E7D8]">
                                <span className="block font-semibold">{a.name}</span>
                                {a.district && <span className="block text-xs text-[#6D6558]">{[a.city, a.province, a.postalCode].filter(Boolean).join(", ")}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {!searching && query.trim().length >= 3 && options.length === 0 && <p className="text-sm text-[#6D6558]">Tidak ada hasil. Coba kata kunci lain.</p>}
            {destination && <p className="text-sm font-bold text-[#184D47]"><MapPin size={14} className="mr-1 inline" />Tujuan: {destination.name}</p>}
        </div>
    );
}

function groupByCourier(rates: Rate[]) {
    const map = new Map<string, Rate[]>();
    for (const rate of rates) { const list = map.get(rate.courierCode) || []; list.push(rate); map.set(rate.courierCode, list); }
    return Array.from(map.entries()).map(([code, list]) => ({ code, name: list[0].courierName, rates: list }));
}

function ShippingRates({ state, error, grouped, selected, onSelect, onRetry }: { state: RateState; error: string; grouped: { code: string; name: string; rates: Rate[] }[]; selected: { courierCode: string; serviceCode: string } | null; onSelect: (rate: Rate) => void; onRetry: () => void }) {
    if (state === "idle") return <p className="text-sm text-[#6D6558]">Silakan pilih kecamatan/kelurahan tujuan terlebih dahulu.</p>;
    if (state === "loading") return <div className="flex items-center gap-2 text-sm font-bold text-[#123524]"><Loader2 size={16} className="animate-spin" />Mencari layanan pengiriman...</div>;
    if (state === "configuration") return <p role="alert" className="rounded-xl bg-[#FFF2D6] p-3 text-sm font-bold">Layanan pengiriman belum dapat digunakan.</p>;
    if (state === "unavailable") {
        return (
            <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <p>{error || "Layanan pengiriman sedang mengalami gangguan. Silakan coba lagi."}</p>
                <button type="button" onClick={onRetry} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-red-300 px-4 text-sm font-bold text-red-700 hover:bg-red-100">Coba Lagi</button>
            </div>
        );
    }
    if (state === "error") {
        return (
            <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <p>{error || "Gagal memuat ongkir."}</p>
                <button type="button" onClick={onRetry} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-red-300 px-4 text-sm font-bold text-red-700 hover:bg-red-100">Coba Lagi</button>
            </div>
        );
    }
    if (state === "empty") return <p className="rounded-xl bg-[#FFF2D6] p-3 text-sm font-bold">Belum ada layanan pengiriman untuk tujuan ini.</p>;
    return (
        <fieldset>
            <legend className="sr-only">Pilih kurir dan layanan</legend>
            <div className="space-y-3">
                {grouped.map((group) => (
                    <div key={group.code}>
                        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#123524]"><Truck size={16} />{group.name}</p>
                        <div className="grid gap-2">
                            {group.rates.map((rate) => (
                                <label key={`${group.code}-${rate.serviceCode}`} className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${selected?.courierCode === rate.courierCode && selected?.serviceCode === rate.serviceCode ? "border-[#184D47] bg-[#EAF1ED]" : "border-[#C9A45B]/30"}`}>
                                    <span className="flex min-w-0 items-center gap-3">
                                        <input type="radio" name="shipping-rate" checked={selected?.courierCode === rate.courierCode && selected?.serviceCode === rate.serviceCode} onChange={() => onSelect(rate)} />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-bold">{rate.serviceName}</span>
                                            {rate.duration && <span className="block text-xs text-[#6D6558]">Estimasi {rate.duration} hari</span>}
                                        </span>
                                    </span>
                                    <b className="shrink-0 whitespace-nowrap">{formatRupiah(rate.price)}</b>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </fieldset>
    );
}
