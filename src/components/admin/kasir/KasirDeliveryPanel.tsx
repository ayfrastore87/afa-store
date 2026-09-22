"use client";

// ---------------------------------------------------------------------------
// Kasir (POS) PENGIRIMAN panel — the cashier delivery flow.
//
// It is the SAME architecture as the customer checkout, wired to the same modules:
//   Google reverse geocoding  -> src/lib/google-geocoding.ts
//   free reverse fallback     -> src/lib/reverse-geocode-fallback.ts (our own route)
//   Biteship area matcher     -> src/lib/area-match.ts (+ /api/shipping/areas)
//   Biteship authoritative rates -> /api/shipping/rates (+ src/lib/shipping-category.ts)
//   quote signature/invalidation -> src/lib/checkout-address.ts + src/lib/kasir-delivery.ts
//
// Invariants preserved from production checkout:
//   * the confirmed map pin is authoritative; a failed lookup never moves it,
//   * no reverse geocoding while the map moves — only on "GUNAKAN LOKASI INI",
//   * the free fallback gets its ONE bounded attempt BEFORE anything is reported as
//     failed (a slow-but-successful fallback must never show "belum tersedia"),
//   * a resolved display address is separate from the Biteship area match: "alamat
//     ditemukan" is not an address failure just because the area is unmatched,
//   * only Biteship supplies destinationAreaId and prices; the server re-quotes anyway,
//   * the cashier's own address detail is never overwritten by map/area metadata.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, MapPin, PackageSearch, Search } from "lucide-react";

import type { DeliveryCoordinates } from "@/lib/coordinates";
import { isRecognizedGoogleAddress, toLocationSearchResult, reverseGeocodeWithGoogle, classifyGoogleGeocodeFailure, type GoogleGeocodeFailureKind } from "@/lib/google-geocoding";
import { loadGoogleMaps, loadGoogleMapsGeocoder } from "@/lib/google-maps-loader";
import { fallbackAddressToSearchResult, requestFallbackReverseAddress, type FallbackSearchResult } from "@/lib/reverse-geocode-fallback";
import type { LocationSearchResult } from "@/lib/geocoding-normalize";
import { addAreaCandidates, buildAreaSearchQueries, isHighConfidenceAreaMatch, pickBestAreaMatch } from "@/lib/area-match";
import {
    isValidDeliveryLocation,
    isValidRecipientName,
    isValidRecipientPhone,
    isStalePin,
    isStaleResponse,
    locationSignature,
    mustInvalidateShipping,
} from "@/lib/checkout-address";
import { formatShippingDuration, groupShippingRatesByCategory, SHIPPING_CATEGORY_LABELS, type ShipmentCategory } from "@/lib/shipping-category";
import {
    KASIR_DELIVERY_MESSAGES,
    kasirCartKey,
    kasirDeliveryReadiness,
    kasirDeliverySignature,
    type KasirDeliveryDraft,
} from "@/lib/kasir-delivery";
import { CheckoutLocationMap } from "@/components/checkout/location-map";
import KasirLocationPicker from "./KasirLocationPicker";
import { formatRupiah } from "./kasir-shared";

type Area = { id: string; name: string; type?: string; postalCode?: string; province?: string; city?: string; district?: string; village?: string };

type Rate = {
    courierCode: string;
    courierName: string;
    serviceCode: string;
    serviceName: string;
    description: string | null;
    price: number;
    duration: string | null;
    shipmentCategory?: ShipmentCategory;
    quoteRef: string | null;
};

type ReverseState = "idle" | "loading" | "done" | "error";
type AreaState = "idle" | "matching" | "matched" | "not_found";
type RateState = "idle" | "loading" | "ready" | "empty" | "unavailable" | "configuration" | "error";

const DEFAULT_KASIR_MAP_CENTER: DeliveryCoordinates = { latitude: -6.2, longitude: 106.816666 };
const ignoreMapEvent = () => undefined;

export type KasirDeliveryPanelProps = {
    draft: KasirDeliveryDraft;
    onPatch: (patch: Partial<KasirDeliveryDraft>) => void;
    /** Cart lines (server still re-authorizes products, prices and weights). */
    items: { productId: string; quantity: number }[];
    recipientName: string;
    recipientPhone: string;
};

/** Mirror of the checkout rule: only the components the official area really carries. */
function areaComponentPatch(area: Area) {
    const patch: Partial<KasirDeliveryDraft> = { areaId: area.id, areaLabel: area.name };
    if (area.province) patch.province = area.province;
    if (area.city) patch.city = area.city;
    patch.district = area.district || area.name;
    if (area.village) patch.village = area.village;
    if (area.postalCode) patch.postalCode = area.postalCode;
    return patch;
}


export default function KasirDeliveryPanel({
    draft,
    onPatch,
    items,
    recipientName,
    recipientPhone,
}: KasirDeliveryPanelProps) {
    const [mapOpen, setMapOpen] = useState(false);
    const [reverseState, setReverseState] = useState<ReverseState>("idle");
    const [reverseFailure, setReverseFailure] = useState<"none" | GoogleGeocodeFailureKind>("none");

    const [areaState, setAreaState] = useState<AreaState>("idle");
    const [areaQuery, setAreaQuery] = useState("");
    const [areaOptions, setAreaOptions] = useState<Area[]>([]);
    const [areaSearching, setAreaSearching] = useState(false);

    const [rates, setRates] = useState<Rate[]>([]);
    const [rateState, setRateState] = useState<RateState>("idle");
    const [rateError, setRateError] = useState("");
    const [rateReload, setRateReload] = useState(0);

    // Latest-request-wins guards (identical to the checkout).
    const reverseRef = useRef(0);
    const reverseAbortRef = useRef<AbortController | null>(null);
    const confirmedPinRef = useRef<DeliveryCoordinates | null>(null);
    const areaMatchRef = useRef(0);
    const areaAbortRef = useRef<AbortController | null>(null);
    const areaRequestRef = useRef(0);
    const rateRequestRef = useRef(0);
    // Latest patch handler so the effects never capture a stale `onPatch` identity.
    const patchRef = useRef(onPatch);
    useEffect(() => {
        patchRef.current = onPatch;
    }, [onPatch]);

    useEffect(() => {
        return () => {
            reverseAbortRef.current?.abort();
            areaAbortRef.current?.abort();
        };
    }, []);

    const cartKey = kasirCartKey(items);
    const locationKey = locationSignature({
        latitude: draft.latitude,
        longitude: draft.longitude,
        destinationAreaId: draft.areaId,
        formattedAddress: draft.address,
    });
    const destinationSignature = kasirDeliverySignature(cartKey, locationKey);
    const quoteMatchesDestination = !mustInvalidateShipping(draft.quoteSignature, destinationSignature);

    const recipientValid = isValidRecipientName(recipientName) && isValidRecipientPhone(recipientPhone);
    const locationValid =
        isValidDeliveryLocation({
            formattedAddress: draft.address,
            latitude: draft.latitude,
            longitude: draft.longitude,
            destinationAreaId: draft.areaId,
        }) && draft.areaId.trim().length > 0;
    const readiness = kasirDeliveryReadiness({
        recipientValid,
        locationValid,
        quoteSelected: Boolean(draft.courierCode && draft.serviceCode),
        quoteMatchesDestination,
    });

    /**
     * Commit an address that was really recognized — by Google or by the free fallback.
     * Both sources hand over the SAME internal shape, so the card and the Biteship area
     * matcher behave identically whichever one answered. A new address invalidates the
     * previous area + quote; the cashier's own detail is never touched.
     */
    const applyResolvedAddress = useCallback((result: LocationSearchResult | FallbackSearchResult) => {
        const a = result.address;
        patchRef.current({
            address: result.displayName || [a.road, a.houseNumber].filter(Boolean).join(" "),
            province: a.province || "",
            city: a.city || a.regency || "",
            district: a.district || "",
            village: a.village || "",
            postalCode: a.postcode || "",
            areaId: "",
            areaLabel: "",
            courierCode: "",
            courierName: "",
            serviceCode: "",
            serviceName: "",
            shipping: 0,
            quoteSignature: "",
        });
        // The address is known. From here nothing below may turn that into an address failure:
        // whether Biteship can match an area is a SEPARATE step and only changes the area state.
        setReverseState("done");
        void matchArea({
            province: a.province || "",
            city: a.city || a.regency || "",
            district: a.district || "",
            village: a.village || "",
            postcode: a.postcode || "",
        });
        // Close the picker only now that the address was recognized.
        setMapOpen(false);
    }, []);

    /**
     * The free, server-side FALLBACK: ONE bounded attempt per confirmation, only when Google
     * could not name the point. Resolves `true` when the location was named, so the caller stops
     * instead of reporting a failure — declaring that failure up front is exactly what once
     * showed "Cadangan alamat otomatis juga belum tersedia" while the answer was still arriving.
     */
    const reverseFallbackAndFill = async (pin: DeliveryCoordinates, requestId: number): Promise<boolean> => {
        reverseAbortRef.current?.abort();
        const controller = new AbortController();
        reverseAbortRef.current = controller;
        const fallback = await requestFallbackReverseAddress(pin.latitude, pin.longitude, { signal: controller.signal });
        if (isStaleResponse(reverseRef.current, requestId) || isStalePin(pin, confirmedPinRef.current)) return false;
        if (fallback.status !== "ok") return false;
        applyResolvedAddress(fallbackAddressToSearchResult(fallback.address));
        return true;
    };

    /** Reverse-geocode a CONFIRMED pin. Never called while the map is being panned. */
    const reverseGeocodeAndFill = async (coords: DeliveryCoordinates) => {
        const requestId = ++reverseRef.current;
        const requestedPin = { latitude: coords.latitude, longitude: coords.longitude };
        setReverseState("loading");
        setReverseFailure("none");
        try {
            await loadGoogleMaps();
            const geocoder = await loadGoogleMapsGeocoder();
            const address = await reverseGeocodeWithGoogle(requestedPin, geocoder);
            if (isStaleResponse(reverseRef.current, requestId) || isStalePin(requestedPin, confirmedPinRef.current)) return;
            const result: LocationSearchResult | null = toLocationSearchResult(address);
            // A valid formatted address is enough even when structured components are empty
            // (normal in Indonesia). Only "no address text AND no component" is unrecognized.
            if (!result || !isRecognizedGoogleAddress(address)) {
                if (await reverseFallbackAndFill(requestedPin, requestId)) return;
                setReverseState("error");
                setReverseFailure("no_address");
                setAreaState("not_found");
                return;
            }
            applyResolvedAddress(result);
        } catch (error) {
            // A Google failure is NOT the end: the free fallback is asked first, so a Google
            // outage still leaves a named location and a successful fallback is never undone.
            const failure = classifyGoogleGeocodeFailure(error);
            if (await reverseFallbackAndFill(requestedPin, requestId)) return;
            setReverseState("error");
            setReverseFailure(failure);
            setAreaState("not_found");
        }
    };

    /**
     * Auto-match the reverse-geocoded address to an OFFICIAL Biteship area. Bounded and
     * de-duplicated by design (MAX_AREA_SEARCH_QUERIES), and a newer pin aborts the in-flight
     * lookups so a stale response can never replace the current area. A resolved display
     * address is NEVER required for this step and this step can never fail the address.
     */
    const matchArea = async (address: { province: string; city: string; district: string; village: string; postcode: string }) => {
        if (!Object.values(address).some(Boolean)) {
            setAreaState("not_found");
            return;
        }
        areaAbortRef.current?.abort();
        const controller = new AbortController();
        areaAbortRef.current = controller;
        const requestId = ++areaMatchRef.current;
        setAreaState("matching");
        const queries = buildAreaSearchQueries(address);
        const candidates: Area[] = [];
        const seenIds = new Set<string>();
        let best: Area | null = null;
        for (const query of queries) {
            if (controller.signal.aborted || isStaleResponse(areaMatchRef.current, requestId)) return;
            try {
                const response = await fetch(`/api/shipping/areas?input=${encodeURIComponent(query)}`, { signal: controller.signal });
                const payload = await response.json().catch(() => ({}));
                if (response.ok) addAreaCandidates(candidates, seenIds, payload.areas || []);
            } catch {
                if (controller.signal.aborted) return;
            }
            best = pickBestAreaMatch(candidates, address);
            if (best && isHighConfidenceAreaMatch(best, address)) break;
        }
        if (controller.signal.aborted || isStaleResponse(areaMatchRef.current, requestId)) return;
        if (best) {
            // Official Biteship area found. Only the area identity + the components it really
            // carries are applied; the geocoded street line and the cashier's detail survive.
            patchRef.current({ ...areaComponentPatch(best), courierCode: "", courierName: "", serviceCode: "", serviceName: "", shipping: 0, quoteSignature: "" });
            setAreaState("matched");
            setAreaQuery("");
            setAreaOptions([]);
            return;
        }
        // Genuinely no official candidate: reveal the manual Biteship search. This is NOT an
        // address failure — the address stays displayed as found.
        patchRef.current({ areaId: "", areaLabel: "" });
        setAreaState("not_found");
    };

    // Manual Biteship area search (debounced) — only used when the automatic match failed.
    useEffect(() => {
        const query = areaQuery.trim();
        setAreaOptions([]);
        if (query.length < 3) {
            setAreaSearching(false);
            return;
        }
        const requestId = ++areaRequestRef.current;
        const timer = setTimeout(async () => {
            setAreaSearching(true);
            try {
                const response = await fetch(`/api/shipping/areas?input=${encodeURIComponent(query)}`);
                const payload = await response.json().catch(() => ({}));
                if (requestId !== areaRequestRef.current) return;
                setAreaOptions(response.ok ? payload.areas || [] : []);
            } catch {
                if (requestId === areaRequestRef.current) setAreaOptions([]);
            } finally {
                if (requestId === areaRequestRef.current) setAreaSearching(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [areaQuery]);

    const chooseArea = (area: Area) => {
        setAreaState("matched");
        setAreaQuery(area.name);
        setAreaOptions([]);
        // A manual pick replaces the destination, so no previous quote may survive.
        patchRef.current({ ...areaComponentPatch(area), courierCode: "", courierName: "", serviceCode: "", serviceName: "", shipping: 0, quoteSignature: "" });
    };

    /**
     * Authoritative rates for the selected destination. The server re-reads products,
     * prices and weights and asks Biteship live — the browser never computes a price, and
     * only services Biteship really returned are shown. Any cart/destination change alters
     * `destinationSignature` and therefore re-runs this quote.
     */
    useEffect(() => {
        if (!draft.areaId || items.length === 0) {
            setRates([]);
            setRateState("idle");
            setRateError("");
            return;
        }
        const requestId = ++rateRequestRef.current;
        setRateState("loading");
        setRateError("");
        fetch("/api/shipping/rates", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                destinationAreaId: draft.areaId,
                items: items.map((item) => ({ id: item.productId, qty: item.quantity })),
            }),
        })
            .then(async (response) => {
                const payload = await response.json().catch(() => ({}));
                if (requestId !== rateRequestRef.current) return;
                if (response.status === 503) {
                    setRateState(payload.code === "CONFIGURATION" ? "configuration" : "unavailable");
                    setRateError(
                        payload.code === "CONFIGURATION"
                            ? "Layanan pengiriman belum dapat digunakan."
                            : "Tarif pengiriman belum dapat dimuat. Silakan coba lagi.",
                    );
                    return;
                }
                if (response.status === 404) {
                    setRateState("empty");
                    return;
                }
                if (!response.ok) {
                    setRateState("error");
                    setRateError("Gagal memuat ongkir. Silakan coba lagi.");
                    return;
                }
                const list: Rate[] = payload.rates || [];
                if (!list.length) {
                    setRateState("empty");
                    return;
                }
                setRates(list);
                setRateState("ready");
                // These rates (and their quote) now belong to THIS destination only. A courier
                // chosen for a previous destination is dropped with it.
                patchRef.current({ quoteSignature: destinationSignature, courierCode: "", courierName: "", serviceCode: "", serviceName: "", shipping: 0 });
            })
            .catch(() => {
                if (requestId !== rateRequestRef.current) return;
                setRateState("unavailable");
                setRateError("Layanan pengiriman sedang mengalami gangguan. Silakan coba lagi.");
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft.areaId, destinationSignature, rateReload]);

    const selectRate = (rate: Rate) => {
        patchRef.current({
            courierCode: rate.courierCode,
            courierName: rate.courierName,
            serviceCode: rate.serviceCode,
            serviceName: rate.serviceName,
            shipping: rate.price,
            quoteSignature: destinationSignature,
        });
    };

    // The single confirmation point: freeze the draft pin as the CONFIRMED pin, drop the
    // previous area + quote, then reverse geocode -> Biteship area match -> rates.
    const confirmLocation = (coords: DeliveryCoordinates) => {
        if (reverseState === "loading" || areaState === "matching") return;
        confirmedPinRef.current = coords;
        patchRef.current({
            latitude: coords.latitude,
            longitude: coords.longitude,
            areaId: "",
            areaLabel: "",
            courierCode: "",
            courierName: "",
            serviceCode: "",
            serviceName: "",
            shipping: 0,
            quoteSignature: "",
        });
        setAreaState("idle");
        setAreaQuery("");
        setAreaOptions([]);
        setRates([]);
        setRateState("idle");
        void reverseGeocodeAndFill(coords);
    };

    const groupedRates = groupShippingRatesByCategory(rates);

    const areaFieldPatch = (patch: Partial<KasirDeliveryDraft>) => patchRef.current(patch);

    return (
        <div className="space-y-4">
            {/* ALAMAT */}
            <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Alamat Pengiriman</p>
                <button
                    type="button"
                    onClick={() => setMapOpen(true)}
                    className="group relative block h-[170px] w-full overflow-hidden rounded-[1.25rem] border border-[#184D47]/20 bg-[#e7e4da] text-left shadow-sm transition hover:border-[#C9A45B] hover:shadow-md sm:h-[185px]"
                    aria-label="Pilih lokasi pengiriman di peta"
                >
                    <CheckoutLocationMap
                        center={draft.latitude != null && draft.longitude != null ? { latitude: draft.latitude, longitude: draft.longitude } : DEFAULT_KASIR_MAP_CENTER}
                        zoom={draft.latitude != null ? 17 : 12}
                        onCenterChange={ignoreMapEvent}
                        onZoomChange={ignoreMapEvent}
                        onInteractionStart={ignoreMapEvent}
                        onInteractionEnd={ignoreMapEvent}
                        thumbnail
                    />
                    <span className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl bg-[#123524]/90 px-3 py-2 text-xs font-black text-white shadow-lg">
                        <span>{draft.address ? "Ubah Lokasi Pengiriman" : "Pilih Lokasi Pengiriman"}</span>
                        <span className="font-semibold text-[#F3D58A]">Klik peta untuk memperbesar</span>
                    </span>
                </button>

                {reverseState === "loading" ? (
                    <p className="flex items-center gap-2 rounded-2xl bg-[#f8f6f0] px-3 py-2 text-xs font-bold text-[#184D47]/70">
                        <Loader2 size={14} className="animate-spin" /> Mengenali alamat...
                    </p>
                ) : null}

                {reverseState === "done" && draft.address ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                        <p className="flex items-center gap-2 text-xs font-black text-emerald-800">
                            <Check size={14} /> Alamat ditemukan
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-snug text-emerald-900/80">{draft.address}</p>
                    </div>
                ) : null}

                {reverseState === "error" ? (
                    <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>
                            {reverseFailure === "unavailable"
                                ? "Alamat dari peta sedang tidak dapat diambil. Pilih kecamatan/kelurahan pengiriman untuk melanjutkan pengecekan ongkir."
                                : "Alamat lokasi belum dapat dikenali. Geser titik sedikit lalu tentukan ulang, atau pilih kecamatan/kelurahan pengiriman."}
                        </span>
                    </div>
                ) : null}

                <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-[#184D47]/60">Detail alamat (nomor rumah / blok / RT-RW / patokan)</span>
                    <textarea
                        value={draft.detail}
                        onChange={(event) => areaFieldPatch({ detail: event.target.value })}
                        rows={2}
                        placeholder="Contoh: Blok C2 No. 14, RT 03/RW 05, pagar hitam sebelah warung"
                        className="w-full rounded-2xl border border-[#184D47]/15 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#C9A45B]"
                    />
                </label>

                {/* Escape hatch: when NEITHER Google NOR the free fallback could name the pin,
                    the cashier types the street address and picks the area manually. The map
                    remains authoritative whenever it does resolve an address. */}
                {reverseState === "error" ? (
                    <label className="block space-y-1.5">
                        <span className="text-xs font-bold text-[#184D47]/60">Alamat pengiriman (isi manual bila peta tidak mengenali lokasi)</span>
                        <input
                            value={draft.address}
                            onChange={(event) => areaFieldPatch({ address: event.target.value })}
                            placeholder="Contoh: Jl. Melati No. 10, Kalitimbang, Cibeber"
                            className="min-h-12 w-full rounded-2xl border border-[#184D47]/15 bg-white px-3 text-sm font-semibold outline-none focus:border-[#C9A45B]"
                        />
                    </label>
                ) : null}
            </div>

            {/* AREA PENGIRIMAN (Biteship) — a SEPARATE step from the address */}
            <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Area Pengiriman</p>

                {areaState === "matching" ? (
                    <p className="flex items-center gap-2 rounded-2xl bg-[#f8f6f0] px-3 py-2 text-xs font-bold text-[#184D47]/70">
                        <Loader2 size={14} className="animate-spin" /> Mencocokkan area Biteship...
                    </p>
                ) : null}

                {areaState === "matched" && draft.areaId ? (
                    <p className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-black text-emerald-800">
                        <Check size={14} className="mt-0.5 shrink-0" />
                        <span>Area pengiriman tersedia — {draft.areaLabel || draft.district || draft.city}</span>
                    </p>
                ) : null}

                {areaState === "not_found" ? (
                    <div className="space-y-2 rounded-2xl border border-[#C9A45B]/30 bg-white px-3 py-2">
                        <p className="text-xs font-bold leading-snug text-[#8B6B3F]">
                            {draft.address
                                ? "Alamat ditemukan. Pilih kecamatan/kelurahan pengiriman untuk melanjutkan pengecekan ongkir."
                                : "Area pengiriman belum ditentukan. Cari kecamatan/kelurahan tujuan."}
                        </p>
                        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#184D47]/15 px-3">
                            <Search size={14} className="shrink-0 text-[#C9A45B]" />
                            <input
                                value={areaQuery}
                                onChange={(event) => setAreaQuery(event.target.value)}
                                placeholder="Cari kecamatan / kelurahan Biteship"
                                className="h-11 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#184D47]/40"
                            />
                            {areaSearching ? <Loader2 size={14} className="animate-spin text-[#C9A45B]" /> : null}
                        </label>
                        {areaOptions.length > 0 ? (
                            <ul className="max-h-40 space-y-1 overflow-y-auto">
                                {areaOptions.map((area) => (
                                    <li key={area.id}>
                                        <button
                                            type="button"
                                            onClick={() => chooseArea(area)}
                                            className="w-full rounded-xl border border-[#184D47]/10 bg-[#f8f6f0] px-3 py-2 text-left text-xs font-semibold text-[#184D47] transition hover:bg-[#EAF1ED]"
                                        >
                                            {area.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {/* PENGIRIMAN — rates come ONLY from Biteship via /api/shipping/rates */}
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-[#184D47]/50">Pengiriman</p>
                    <button
                        type="button"
                        onClick={() => setRateReload((value) => value + 1)}
                        disabled={!draft.areaId || rateState === "loading"}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#D4AF37] px-3 text-xs font-black text-[#184D47] transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {rateState === "loading" ? <Loader2 size={14} className="animate-spin" /> : <PackageSearch size={14} />}
                        CEK ONGKIR
                    </button>
                </div>

                {!draft.areaId ? (
                    <p className="text-xs font-semibold text-[#184D47]/60">
                        Pilih area pengiriman terlebih dahulu untuk mengecek ongkir.
                    </p>
                ) : null}

                {rateState === "loading" ? (
                    <p className="flex items-center gap-2 text-xs font-bold text-[#184D47]/70">
                        <Loader2 size={14} className="animate-spin" /> Memuat tarif Biteship...
                    </p>
                ) : null}

                {rateError ? (
                    <p role="alert" className="flex items-start gap-2 text-xs font-semibold text-[#8B6B3F]">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" /> {rateError}
                    </p>
                ) : null}

                {rateState === "empty" ? (
                    <p className="text-xs font-semibold text-[#184D47]/60">
                        Belum ada layanan kurir yang tersedia untuk area ini. Coba area lain atau hubungi admin.
                    </p>
                ) : null}

                {groupedRates.map((group) => {
                    const meta = SHIPPING_CATEGORY_LABELS[group.category];
                    return (
                        <div key={group.category} className="space-y-1">
                            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#184D47]/70">
                                {meta.icon} {meta.title}
                            </p>
                            {group.rates.map((rate) => {
                                const selectedRate = draft.courierCode === rate.courierCode && draft.serviceCode === rate.serviceCode;
                                const estimate = formatShippingDuration(rate.duration);
                                return (
                                    <button
                                        key={`${rate.courierCode}-${rate.serviceCode}`}
                                        type="button"
                                        onClick={() => selectRate(rate)}
                                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition ${selectedRate ? "border-[#184D47] bg-[#184D47] text-white" : "border-[#184D47]/15 bg-white text-[#184D47] hover:border-[#184D47]/40"}`}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-black">
                                                {rate.courierName} — {rate.serviceName}
                                            </span>
                                            {estimate ? (
                                                <span className={`block text-[11px] font-semibold ${selectedRate ? "text-white/80" : "text-[#184D47]/60"}`}>
                                                    {estimate}
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="shrink-0 text-xs font-black">{formatRupiah(rate.price)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {!readiness.ready ? (
                <p className="flex items-start gap-2 rounded-2xl bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{readiness.reason ?? KASIR_DELIVERY_MESSAGES.address}</span>
                </p>
            ) : null}

            <KasirLocationPicker
                open={mapOpen}
                initialLatitude={draft.latitude}
                initialLongitude={draft.longitude}
                onCancel={() => setMapOpen(false)}
                onConfirm={confirmLocation}
            />
        </div>
    );
}



