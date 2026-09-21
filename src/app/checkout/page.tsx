"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Home, Loader2, LocateFixed, MapPin, PackageOpen, Search, TriangleAlert, X } from "lucide-react";
import type { CheckoutItem } from "@/lib/checkout";
import { formatRupiah } from "@/lib/products";
import { getUserFacingMessage } from "@/lib/user-facing-error";
import type { DeliveryCoordinates } from "@/lib/coordinates";
import { CheckoutLocationMap } from "@/components/checkout/location-map";
import { CheckoutLocationSearch } from "@/components/checkout/location-search";
import type { LocationSearchResult } from "@/lib/geocoding-normalize";
import { reverseGeocodeWithGoogle, toLocationSearchResult, isRecognizedGoogleAddress, classifyGoogleGeocodeFailure, type GoogleGeocodeFailureKind } from "@/lib/google-geocoding";
import { loadGoogleMaps, loadGoogleMapsGeocoder } from "@/lib/google-maps-loader";
import { fallbackAddressToSearchResult, requestFallbackReverseAddress, type FallbackSearchResult } from "@/lib/reverse-geocode-fallback";
import { addAreaCandidates, buildAreaSearchQueries, isHighConfidenceAreaMatch, pickBestAreaMatch, scoreAreaCandidate, type AreaAddressInput } from "@/lib/area-match";
import {
    addressFieldsForMode,
    cleanFieldValue,
    formatDeliveryAddress,
    isDistinctDropshipSender,
    isStalePin,
    isStaleResponse,
    isValidDeliveryLocation,
    isValidRecipientName,
    isValidRecipientPhone,
    joinAddressParts,
    locationSignature,
    mustInvalidateShipping,
    resolvePickerCenter,
    savedAddressPin,
    streetLevelAddress,
    ADDRESS_DETAIL_PLACEHOLDER,
    ADDRESS_MODE_HINTS,
    ADDRESS_MODE_LABELS,
    ADDRESS_NOTE_PLACEHOLDER,
    DEFAULT_ADDRESS_MODE,
    RECIPIENT_NAME_PLACEHOLDER,
    RECIPIENT_PHONE_PLACEHOLDER,
    SENDER_NAME_PLACEHOLDER,
    SENDER_PHONE_PLACEHOLDER,
    type AddressFields,
    type AddressMode,
    type DeliveryAddressParts,
} from "@/lib/checkout-address";
import {
    formatShippingDuration,
    groupShippingRatesByCategory,
    SHIPPING_CATEGORY_LABELS,
    type ShipmentCategory,
} from "@/lib/shipping-category";

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
    // Optional: a saved address only ever has coordinates when the API really
    // returns them. Missing coordinates are NEVER fabricated (no 0,0 fallback).
    latitude?: number | null;
    longitude?: number | null;
};

/** Track if Google Maps failed due to billing or other load errors */
type MapsStatus = "loading" | "ready" | "unavailable";

/**
 * Address derived from the CONFIRMED map point (reverse geocode) or from an
 * official Biteship area the customer picked manually. This is the single
 * authoritative address for the destination; the manual "detail" (blok/RT/RW)
 * lives in the form and is only recombined with this at submit time.
 */
type DestinationAddress = {
    streetLine: string;
    displayName: string;
    province: string;
    city: string;
    district: string;
    village: string;
    postalCode: string;
};

/** Neutral value used when a map/area patch lands before any address was resolved. */
const EMPTY_DESTINATION_ADDRESS: DestinationAddress = {
    streetLine: "",
    displayName: "",
    province: "",
    city: "",
    district: "",
    village: "",
    postalCode: "",
};

type Area = { id: string; name: string; type?: string; postalCode?: string; province?: string; city?: string; district?: string; village?: string };

/**
 * Authoritative Biteship area components as an address patch. Only components the area
 * really carries are returned, so applying it can never blank a known value, never
 * invent one, and never touch the geocoded street line or the customer's own detail.
 */
function areaAddressPatch(a: Area): Partial<DestinationAddress> {
    const patch: Partial<DestinationAddress> = {};
    if (a.province) patch.province = a.province;
    if (a.city) patch.city = a.city;
    if (a.district || a.name) patch.district = a.district || a.name;
    if (a.village) patch.village = a.village;
    if (a.postalCode) patch.postalCode = a.postalCode;
    return patch;
}

type Rate = {
    courierCode: string;
    courierName: string;
    serviceCode: string;
    serviceName: string;
    description?: string | null;
    price: number;
    duration: string | null;
    // Server-derived Biteship classification (⚡ instant / ☀ same day / 📦 regular).
    // Optional so an older cached payload still classifies locally instead of vanishing.
    shipmentCategory?: ShipmentCategory;
    quoteRef: string | null;
};

const PAYMENT_METHOD = "QRIS" as const;
const paymentMethods = [PAYMENT_METHOD] as const;
const paymentLabels: Record<(typeof paymentMethods)[number], string> = { QRIS: "QRIS" };

const DEFAULT_MAP_CENTER: DeliveryCoordinates = { latitude: -6.2, longitude: 106.816666 };
const DEFAULT_MAP_ZOOM = 16;

type RateState = "idle" | "loading" | "ready" | "empty" | "unavailable" | "configuration" | "error";

type AreaState = "idle" | "matching" | "matched" | "not_found";

/**
 * Development-only area-match diagnostics (rendered/logged when NODE_ENV is not
 * "production"). It only ever carries administrative names and counters — never the
 * customer's name/phone, credentials, cookies or the checkout payload.
 */
type AreaDiagnostics = {
    input: { village: string; district: string; city: string; province: string; postcode: string };
    queries: number;
    completed: number;
    candidates: number;
    score: number | null;
    reasons: string[];
    conflicts: string[];
    resolved: boolean;
};

/** Shown to the customer while the fallback area search is the only path. */
const AREA_FALLBACK_TITLE = "Area pengiriman belum ditemukan otomatis.";
const AREA_FALLBACK_HINT = "Cari kelurahan atau kecamatan.";
/**
 * Google DID recognize the address and only the Biteship area match is still open. The customer
 * must see the address as a success and be asked for the area — never an address error.
 */
const AREA_FALLBACK_TITLE_AFTER_ADDRESS = "Alamat ditemukan. Pilih kecamatan/kelurahan pengiriman untuk melanjutkan pengecekan ongkir.";
const AREA_FALLBACK_HINT_AFTER_ADDRESS = "Cari kelurahan atau kecamatan tujuan pengiriman.";

/** Success markers for the confirmed destination (Google address vs Biteship area). */
const ADDRESS_FOUND_LABEL = "Alamat ditemukan";

type ReverseState = "idle" | "loading" | "done" | "error";

/**
 * WHY a reverse geocode failed, kept apart from the state itself:
 *   - `no_address`  Google answered honestly: this exact point has no address (plus-code-only,
 *     water, a brand-new road). Accurate copy: move the pin / pick the area manually.
 *   - `unavailable` the address SERVICE failed (quota, authorization, network, API not
 *     loadable). The location is not at fault, so the customer must never be told their address
 *     could not be recognized — the Biteship picker is the honest fallback.
 *
 * Either kind is only reported AFTER both automatic sources had their one bounded attempt:
 * Google first, then the free same-origin fallback. A reported failure therefore really means
 * "nothing could name this point automatically right now" — the pin itself is never the suspect.
 */
type ReverseFailure = "none" | GoogleGeocodeFailureKind;

const REVERSE_NO_ADDRESS_MESSAGE = "Alamat lokasi belum dapat dikenali. Geser titik sedikit lalu coba kembali.";
const REVERSE_UNAVAILABLE_MESSAGE = "Layanan alamat Google sedang tidak dapat dihubungi. Cadangan alamat otomatis juga belum tersedia. Coba lagi, atau pilih kecamatan/kelurahan pengiriman secara manual.";
/** Same split, worded for the confirmed-location card (no retry button there). */
const REVERSE_NO_ADDRESS_CARD = "Alamat lokasi belum dapat dikenali. Silakan coba titik lain atau pilih area pengiriman secara manual.";
const REVERSE_UNAVAILABLE_CARD = "Alamat dari peta sedang tidak dapat diambil. Pilih kecamatan/kelurahan pengiriman untuk melanjutkan pengecekan ongkir.";

type GeoState = "idle" | "locating";

// Real field VALUES start empty. Example texts live in the `placeholder`
// attribute only, so a hint can never be submitted as customer data.
const emptyForm = {
    recipientName: "", phone: "", email: "", addressDetail: "", note: "",
    paymentMethod: "QRIS",
};

function geoErrorMessage(err: GeolocationPositionError): string {
    switch (err.code) {
        case err.PERMISSION_DENIED:
            return "Izin lokasi tidak diberikan. Cari alamat atau tentukan titik langsung di peta.";
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

    const [mode, setMode] = useState<AddressMode>(DEFAULT_ADDRESS_MODE);
    const [profileAddresses, setProfileAddresses] = useState<ProfileAddress[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    // Destination address resolved from the confirmed map point / Biteship area.
    // It never carries the manually typed detail, so a map change cannot erase it.
    const [destinationAddress, setDestinationAddress] = useState<DestinationAddress | null>(null);

    const [senderName, setSenderName] = useState("");
    const [senderPhone, setSenderPhone] = useState("");
    const [hidePrice, setHidePrice] = useState(true);

    // Map-first location. `draftLocation` tracks the live map center (the pin) and is
    // updated freely while panning/searching/geolocating. `confirmedLocation` is only
    // set when the customer presses "GUNAKAN LOKASI INI", which is the single trigger for
    // reverse geocoding + Biteship area matching + shipping rates.
    const [draftLocation, setDraftLocation] = useState<DeliveryCoordinates>(DEFAULT_MAP_CENTER);
    const [confirmedLocation, setConfirmedLocation] = useState<DeliveryCoordinates | null>(null);
    const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);
    const [interacting, setInteracting] = useState(false);
    const [settled, setSettled] = useState(true);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [reverseState, setReverseState] = useState<ReverseState>("idle");
    // Why it failed — keeps "Google found nothing here" apart from "the address service is down".
    const [reverseFailure, setReverseFailure] = useState<ReverseFailure>("none");
    const [geoState, setGeoState] = useState<GeoState>("idle");
    const [locationMessage, setLocationMessage] = useState("");
    const reverseRef = useRef(0);
    // The free fallback request belonging to the CURRENT confirmation. A newer confirmation
    // aborts the previous one (latest request wins) and unmounting aborts whatever is in flight.
    const reverseAbortRef = useRef<AbortController | null>(null);
    // Mirror of the latest CONFIRMED pin so a stale reverse-geocode response can be
    // detected even before React re-renders with the new state.
    const confirmedPinRef = useRef<DeliveryCoordinates | null>(null);
    const [mapOpen, setMapOpen] = useState(false);
    
    /** Track if Google Maps failed (billing error or other) */
    const [mapsStatus, setMapsStatus] = useState<MapsStatus>("loading");

    // Biteship area auto-match + fallback search.
    const [areaState, setAreaState] = useState<AreaState>("idle");
    const [destinationArea, setDestinationArea] = useState<Area | null>(null);
    const [areaQuery, setAreaQuery] = useState("");
    const [areaOptions, setAreaOptions] = useState<Area[]>([]);
    const [areaSearching, setAreaSearching] = useState(false);
    // Development-only match diagnostics (never populated in production).
    const [areaDiagnostics, setAreaDiagnostics] = useState<AreaDiagnostics | null>(null);
    const areaRequestRef = useRef(0);
    // Separate sequence for the automatic reverse-geocode → Biteship area match, so a
    // newer match always wins over an older one (the manual fallback search keeps
    // using `areaRequestRef`). The in-flight auto-match requests are also aborted as
    // soon as a newer pin supersedes them, so no stale lookup can win the race.
    const areaMatchRef = useRef(0);
    const areaAbortRef = useRef<AbortController | null>(null);

    const [rates, setRates] = useState<Rate[]>([]);
    const [rateState, setRateState] = useState<RateState>("idle");
    const [rateError, setRateError] = useState("");
    const [selected, setSelected] = useState<{ courierCode: string; serviceCode: string } | null>(null);
    const rateRequestRef = useRef(0);
    // Destination signature the current rate list (and its quoteRef) belongs to. A quote
    // whose signature no longer matches the live destination is never usable. It is kept
    // in STATE (not a ref) so render-time checks read a plain value and the UI re-renders
    // the moment a quote stops matching the destination.
    const [quoteSignature, setQuoteSignature] = useState("");
    const [rateReload, setRateReload] = useState(0);

    const submittingRef = useRef(false);
    const keyRef = useRef<string | null>(null);
    const fingerprintRef = useRef("");

    /** Apply a deterministic recipient/address patch (real values only, never hints). */
    const applyAddressFields = (fields: AddressFields) => {
        setForm((f) => ({
            ...f,
            recipientName: fields.recipientName,
            phone: fields.phone,
            addressDetail: fields.addressDetail,
            note: fields.note,
        }));
    };

    /**
     * Patch the map/area-derived destination address. Only the supplied components are
     * replaced, so a map or area update can never blank a known value and can never
     * touch the customer's own detail (blok / RT / RW / patokan) which lives in the form.
     */
    const patchDestinationAddress = (patch: Partial<DestinationAddress>) => {
        setDestinationAddress((current) => ({ ...EMPTY_DESTINATION_ADDRESS, ...(current ?? {}), ...patch }));
    };

    // Saved address currently chosen in "Alamat Saya" (null when none is selected).
    const selectedProfile = profileAddresses.find((a) => a.id === selectedProfileId) ?? null;

    const resetAll = () => {
        setDestinationArea(null);
        setAreaState("idle");
        setAreaQuery("");
        setAreaOptions([]);
        setAreaSearching(false);
        setAreaDiagnostics(null);
        setReverseFailure("none");
        setSelected(null);
        setRates([]);
        setRateState("idle");
        setRateError("");
        // No quote belongs to the destination being replaced.
        setQuoteSignature("");
    };

    useEffect(() => {
        return () => {
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            areaAbortRef.current?.abort();
            reverseAbortRef.current?.abort();
        };
    }, []);

    /** Detect when Google Maps fails due to billing or other errors */
    useEffect(() => {
        let unmounted = false;
        
        // Strategy 1: Listen for global errors including Google Maps API errors
        const handleError = (event: ErrorEvent) => {
            console.log('[Checkout] Detected error event:', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
            
            // Check for BillingNotEnabledMapError or similar Google Maps billing errors
            if (event.message && (
                event.message.includes("BillingNotEnabled") || 
                event.message.includes("google.maps") ||
                event.message.includes("API key not valid")
            )) {
                console.log('[Checkout] Google Maps billing error detected');
                if (!unmounted) setMapsStatus("unavailable");
            }
        };
        
        // Strategy 2: Check if google.maps exists but has billing issues
        const checkGoogleMapsAvailability = () => {
            if (typeof window !== "undefined" && !window.google?.maps) {
                console.log('[Checkout] Google Maps API not available in window');
                if (!unmounted) setMapsStatus("unavailable");
            }
        };
        
        // Strategy 3: Timeout-based detection
        // Checkout requires both Maps core and Places library for full functionality
        // If either is missing after timeout, assume unavailable
        const checkTimer = setTimeout(() => {
            if (!unmounted) {
                const hasMaps = typeof window !== "undefined" && !!window.google?.maps;
                const hasPlaces = typeof window !== "undefined" && !!window.google?.maps?.places;
                const hasImportLibrary = typeof window.google?.maps?.importLibrary === 'function';
                
                console.log('[Checkout] Timeout check results:', {
                    hasMaps,
                    hasPlaces,
                    hasImportLibrary
                });
                
                // Fallback conditions:
                // 1. No google.maps object at all → definitely unavailable
                // 2. Has google.maps but no places and no importLibrary → Places won't load → unavailable
                // 3. Billing error detected → unavailable
                
                const isMapsMissing = !hasMaps;
                const isPlacesAndImportLibraryMissing = hasMaps && !hasPlaces && !hasImportLibrary;
                const billingFailed = mapsStatus === "unavailable";
                
                if (isMapsMissing || isPlacesAndImportLibraryMissing || billingFailed) {
                    console.log('[Checkout] Setting mapsStatus to unavailable based on timeout check');
                    setMapsStatus("unavailable");
                } else {
                    console.log('[Checkout] Maps seems functional, continuing...');
                }
            }
        }, 8000); // 8 second timeout
        
        window.addEventListener("error", handleError);
        checkGoogleMapsAvailability();
        
        return () => {
            unmounted = true;
            clearTimeout(checkTimer);
            window.removeEventListener("error", handleError);
        };
    }, []);

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
                if (chosen) { setMode("saved"); selectProfile(chosen); }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // "Alamat Saya": the recipient block is replaced wholesale from the saved record.
    // The map draft only moves when that record really has coordinates — missing
    // coordinates are never fabricated from the address text.
    const selectProfile = (a: ProfileAddress) => {
        setSelectedProfileId(a.id);
        applyAddressFields(addressFieldsForMode("saved", a));
        const storedPin = savedAddressPin(a);
        if (storedPin) { setDraftLocation(storedPin); setMapZoom(17); }
    };

    const update = (name: keyof typeof emptyForm, value: string) => setForm((f) => ({ ...f, [name]: value }));

    /**
     * Mode switching is deterministic and resetless-by-design:
     * - `dropship` / `other` -> the recipient block becomes EMPTY, so the account
     *   holder's saved recipient can never leak into a dropship/other order;
     * - `saved`              -> the recipient block is reloaded from the selected
     *   (or default) saved address, or stays EMPTY when there is none.
     * The map-confirmed destination is independent of the recipient identity, so an
     * already confirmed ongkir is not thrown away by switching tabs.
     */
    const switchMode = (next: AddressMode) => {
        if (next === mode) return;
        setMode(next);
        if (next === "saved") {
            const saved = profileAddresses.find((a) => a.id === selectedProfileId) ?? profileAddresses.find((a) => a.isDefault) ?? profileAddresses[0] ?? null;
            setSelectedProfileId(saved?.id ?? null);
            applyAddressFields(addressFieldsForMode("saved", saved));
            const storedPin = savedAddressPin(saved);
            if (storedPin) { setDraftLocation(storedPin); setMapZoom(17); }
            return;
        }
        setSelectedProfileId(null);
        applyAddressFields(addressFieldsForMode(next, null));
    };

    // Reverse-geocode a CONFIRMED coordinate with the Google Maps JS API and auto-fill the
    // address + auto-match the Biteship area. Only called from `confirmLocation` (after
    // "GUNAKAN LOKASI INI"), never while the map is being panned: no Google request is ever
    // spent on a moving pin.
    const reverseGeocodeAndFill = async (coords: DeliveryCoordinates) => {
        const requestId = ++reverseRef.current;
        // Full-precision pin this request belongs to: a response that comes back
        // after the customer confirmed a different point must be discarded.
        const requestedPin = { latitude: coords.latitude, longitude: coords.longitude };
        setReverseState("loading");
        setReverseFailure("none");
        try {
            // The Maps JS API is loaded lazily; the picker normally already triggered it,
            // so this resolves immediately. The Geocoder class itself arrives with its own
            // library, so it is awaited too — reading it straight off the loaded API was the
            // same race that once broke the Places widget. Google stays the geocoder; Biteship
            // stays authoritative for the area match and the shipping rates.
            await loadGoogleMaps();
            const geocoder = await loadGoogleMapsGeocoder();
            const address = await reverseGeocodeWithGoogle(requestedPin, geocoder);
            // Stale-response guard: a superseded request, or a response for a pin that
            // is no longer the confirmed one, must NEVER overwrite the latest pin.
            if (isStaleResponse(reverseRef.current, requestId) || isStalePin(requestedPin, confirmedPinRef.current)) return;
            const result: LocationSearchResult | null = toLocationSearchResult(address);
            // "Recognized" is Google's own answer: a valid formatted address is enough even
            // when the structured components are empty (normal in Indonesia). Only an answer
            // with no address text AND no component at all is unrecognized.
            //
            // Unrecognized is not the end: the free server-side fallback gets its ONE bounded
            // attempt first, and only if that finds nothing here either is the manual
            // Kecamatan/Kelurahan picker revealed.
            if (!result || !isRecognizedGoogleAddress(address)) {
                // Google answered, but nothing here is recognizable as an address. The free,
                // server-side fallback gets its ONE bounded attempt BEFORE anything is reported as
                // failed: `reverseState` stays "loading" (the UI keeps saying "Mengenali alamat...")
                // so the customer is never told the fallback is unavailable WHILE it is still being
                // asked. Declaring the failure up front is what once showed "Cadangan alamat otomatis
                // juga belum tersedia" for a fallback answer that was arriving successfully.
                if (await reverseFallbackAndFill(requestedPin, requestId)) return;
                setReverseState("error");
                setReverseFailure("no_address");
                setAreaState("not_found");
                return;
            }
            applyResolvedAddress(result);
        } catch (error) {
            if (isStaleResponse(reverseRef.current, requestId)) return;
            // The address SERVICE failed. That is not "this location cannot be recognized", so it is
            // classified and reported honestly — but only AFTER the free fallback had its one
            // bounded attempt, so a Google outage still leaves a named location and a successful
            // fallback is never undone by Google's failure.
            const failure = classifyGoogleGeocodeFailure(error);
            if (await reverseFallbackAndFill(requestedPin, requestId)) return;
            setReverseState("error");
            setReverseFailure(failure);
            setAreaState("not_found");
        }
    };

    /**
     * Commit an address that was really recognized — by Google or by the free fallback — and start
     * the SEPARATE Biteship area match. Both callers reach this only after the same two stale
     * guards, so it can never resurrect a superseded pin.
     *
     * Both sources hand over the SAME internal shape, so the address fields, the card and the
     * Biteship matcher behave identically whichever one answered. The source itself is deliberately
     * NOT forwarded to the matcher: one place named twice is not two independent confirmations, and
     * a false area match is worse than asking the customer.
     */
    const applyResolvedAddress = (result: LocationSearchResult | FallbackSearchResult) => {
        const a = result.address;
        const nextAddress: DestinationAddress = {
            streetLine: [a.road, a.houseNumber].filter(Boolean).join(" ") || result.displayName,
            displayName: result.displayName || "",
            province: a.province || "",
            city: a.city || a.regency || "",
            district: a.district || "",
            village: a.village || "",
            postalCode: a.postcode || "",
        };
        // Only the geocoded parts are replaced. The manually typed detail
        // (blok / RT / RW / patokan) lives in the form and is left untouched.
        setDestinationAddress(nextAddress);
        // The address is known. From here nothing below may turn that into an address failure:
        // whether Biteship can match an area is a SEPARATE step, and it only changes the area state.
        setReverseState("done");
        void matchArea({
            province: nextAddress.province,
            city: nextAddress.city,
            district: nextAddress.district,
            village: nextAddress.village,
            postcode: nextAddress.postalCode,
        });
        // Close the fullscreen picker only now that the address was recognized.
        setMapOpen(false);
    };

    /**
     * The free, server-side FALLBACK for a confirmed pin: asked at most ONCE per confirmation, and
     * only when Google could not name the point (the service was unavailable, or it answered with
     * nothing recognizable).
     *
     * The browser asks OUR OWN same-origin route, which performs the single provider call on the
     * server. No provider key or user agent exists client-side, and no raw provider payload reaches
     * the UI: the route answers in the same internal shape the Google path produces. The route never
     * caches an unavailability, so trying again really does try again.
     *
     * Resolves `true` when the location was named, so the caller stops instead of reporting a
     * failure. The guards match the Google path: a newer confirmation aborts this request, and an
     * answer for a pin that is no longer confirmed can never write anything.
     */
    const reverseFallbackAndFill = async (pin: DeliveryCoordinates, requestId: number): Promise<boolean> => {
        reverseAbortRef.current?.abort();
        const fallbackController = new AbortController();
        reverseAbortRef.current = fallbackController;
        const fallback = await requestFallbackReverseAddress(pin.latitude, pin.longitude, {
            signal: fallbackController.signal,
        });
        if (isStaleResponse(reverseRef.current, requestId) || isStalePin(pin, confirmedPinRef.current)) return false;
        if (fallback.status !== "ok") return false;
        applyResolvedAddress(fallbackAddressToSearchResult(fallback.address));
        return true;
    };

    /**
     * Development-only diagnostics for the area auto-match. It reports the normalized
     * reverse-geocode input, how many of the bounded queries ran, how many official
     * candidates Biteship returned, the winning score with the fields that matched /
     * conflicted, and whether a destinationAreaId was resolved. No customer identity,
     * no credentials, no checkout payload — and nothing at all in production.
     */
    const publishAreaDiagnostics = (
        input: AreaAddressInput,
        info: { queries: number; completed: number; candidates: number; best: Area | null },
    ) => {
        if (process.env.NODE_ENV === "production") return;
        const score = info.best ? scoreAreaCandidate(info.best, input) : null;
        const snapshot: AreaDiagnostics = {
            input: {
                village: input.village ?? "",
                district: input.district ?? "",
                city: input.city ?? "",
                province: input.province ?? "",
                postcode: input.postcode ?? "",
            },
            queries: info.queries,
            completed: info.completed,
            candidates: info.candidates,
            score: score ? score.total : null,
            reasons: score ? score.reasons : [],
            conflicts: score ? score.conflicts : [],
            resolved: Boolean(info.best),
        };
        console.info("[checkout] area-match", snapshot);
        setAreaDiagnostics(snapshot);
    };

    /**
     * Auto-match the reverse-geocoded address to an OFFICIAL Biteship area result.
     *
     * Bounded + de-duplicated by design: at most MAX_AREA_SEARCH_QUERIES specific
     * lookups, no repeated query, and the loop stops as soon as a high-confidence
     * official candidate exists. A newer pin aborts the in-flight requests, and a
     * response that is no longer the newest may never replace the current area.
     */
    const matchArea = async (address: AreaAddressInput) => {
        if (!Object.values(address).some(Boolean)) { setAreaState("not_found"); return; }
        // Latest-request-wins: stop the previous lookups before starting new ones.
        areaAbortRef.current?.abort();
        const controller = new AbortController();
        areaAbortRef.current = controller;
        const requestId = ++areaMatchRef.current;
        setAreaState("matching");
        const queries = buildAreaSearchQueries(address);
        const candidates: Area[] = [];
        const seenIds = new Set<string>();
        let best: Area | null = null;
        let completed = 0;
        for (const q of queries) {
            if (controller.signal.aborted || isStaleResponse(areaMatchRef.current, requestId)) return;
            try {
                const r = await fetch(`/api/shipping/areas?input=${encodeURIComponent(q)}`, { signal: controller.signal });
                const d = await r.json().catch(() => ({}));
                // Official Biteship candidates only, de-duplicated by area id so the same
                // area returned by several queries is scored once.
                if (r.ok) addAreaCandidates(candidates, seenIds, d.areas || []);
            } catch {
                // Aborted because a newer location won: leave everything to that match.
                if (controller.signal.aborted) return;
                // Otherwise just try the next query.
            }
            completed += 1;
            // A HTTP 200 response does NOT mean the area matched: rank the best STRONG
            // candidate across every query collected so far, and stop early only once the
            // evidence is strong enough that no later query can change the outcome.
            best = pickBestAreaMatch(candidates, address);
            if (best && isHighConfidenceAreaMatch(best, address)) break;
        }
        // Never apply a match that a newer location already superseded.
        if (controller.signal.aborted || isStaleResponse(areaMatchRef.current, requestId)) return;
        publishAreaDiagnostics(address, { queries: queries.length, completed, candidates: candidates.length, best });
        if (best) {
            setDestinationArea(best);
            setAreaQuery(best.name);
            setAreaState("matched");
            // The matched Biteship area is authoritative for the administrative
            // components (province/city/district/village/postalCode) that the quote is
            // based on. The geocoded street line and the customer's own detail survive.
            patchDestinationAddress(areaAddressPatch(best));
            return;
        }
        // Genuinely no official candidate: reveal the manual search as the fallback.
        setDestinationArea(null);
        setSelected(null);
        setAreaState("not_found");
    };

    // Panning the map only updates the DRAFT center. It never reverse-geocodes, never
    // touches destinationAreaId, and never fetches shipping rates.
    const handleCenterChange = (coords: DeliveryCoordinates) => {
        setDraftLocation(coords);
    };

    const handleInteractionStart = () => {
        setInteracting(true);
        setSettled(false);
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };

    const handleInteractionEnd = () => {
        setInteracting(false);
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(() => setSettled(true), 600);
    };

    // Search only navigates the map to a suggestion; it is NOT final.
    const handleSearchSelect = (result: LocationSearchResult) => {
        const coords = { latitude: result.latitude, longitude: result.longitude };
        setDraftLocation(coords);
        setMapZoom(16);
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
                setDraftLocation(coords);
                setMapZoom(17);
                setLocationMessage("");
            },
            (err) => {
                setGeoState("idle");
                setLocationMessage(geoErrorMessage(err));
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
        );
    };

    // The single confirmation point: freeze the draft as the confirmed location, drop the
    // previous destination (area + rates + quoteRef) and resolved address, then
    // reverse-geocode → Biteship area match → rates.
    const confirmLocation = () => {
        if (!draftLocation || reverseState === "loading" || areaState === "matching") return;
        resetAll();
        setDestinationAddress(null);
        confirmedPinRef.current = draftLocation;
        setConfirmedLocation(draftLocation);
        void reverseGeocodeAndFill(draftLocation);
    };

    // Opening the picker (first time or "Ubah Lokasi") never resets shipping and never
    // clears the previously confirmed location. The old address/ongkir are only replaced
    // once a NEW location is successfully confirmed via `confirmLocation`.
    const openLocationPicker = () => {
        // Confirmed pin wins; a saved address only contributes when it really has stored
        // coordinates. Missing coordinates fall back to the default center (never fabricated).
        setDraftLocation(resolvePickerCenter(confirmedLocation, mode === "saved" ? selectedProfile : null, DEFAULT_MAP_CENTER));
        setInteracting(false);
        setSettled(true);
        setMapOpen(true);
    };

    const closeLocationPicker = () => {
        setMapOpen(false);
        setInteracting(false);
        setSettled(true);
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
        // A manual pick replaces the destination, so no previous quote may survive: the
        // rates effect below immediately re-quotes the newly selected OFFICIAL area.
        setRates([]);
        setRateState("idle");
        setRateError("");
        setQuoteSignature("");
        // Manual area pick: sync ONLY the official Biteship area components into the
        // destination address. The geocoded street line and any component the area does
        // not carry are left untouched — nothing is blanked and nothing is invented.
        patchDestinationAddress(areaAddressPatch(a));
    };

    // Everything the shipping quote depends on: the confirmed pin, the authoritative
    // Biteship destinationAreaId, and the resolved (geocoded / area) address. Any change
    // here invalidates the previous rates list, its quoteRef and the chosen courier.
    const destinationSignature = locationSignature({
        latitude: confirmedLocation?.latitude,
        longitude: confirmedLocation?.longitude,
        destinationAreaId: destinationArea?.id ?? "",
        formattedAddress: destinationAddress?.displayName ?? "",
    });

    // Auto-fetch rates once a valid destinationAreaId is selected.
    useEffect(() => {
        // No quote belongs to the new destination yet: any previous signature is dropped
        // immediately, so a stale ongkir/quoteRef can never be submitted in the window
        // between the destination change and the fresh quote arriving.
        setQuoteSignature("");
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
                    else if (d.code === "PROVIDER") { setRateState("unavailable"); setRateError("Tarif pengiriman belum dapat dimuat. Silakan coba lagi."); }
                    else { setRateState("unavailable"); setRateError("Layanan pengiriman sedang mengalami gangguan. Silakan coba lagi."); }
                    return;
                }
                if (r.status === 404) { setRateState("empty"); setRateError(""); return; }
                if (!r.ok) { setRateState("error"); setRateError("Gagal memuat ongkir. Silakan coba lagi."); return; }
                const list = d.rates || [];
                if (!list.length) { setRateState("empty"); return; }
                setRates(list);
                setRateState("ready");
                // These rates (and their quoteRef) now belong to THIS destination only.
                setQuoteSignature(destinationSignature);
            })
            .catch(() => { if (requestId === rateRequestRef.current) { setRateState("unavailable"); setRateError("Layanan pengiriman sedang mengalami gangguan. Silakan coba lagi."); } });
        // `destinationSignature` re-runs the quote whenever the pin, the Biteship area or
        // the resolved address changes, so an old ongkir can never survive a new location.
    }, [destinationArea, destinationSignature, session?.items, rateReload]);

    const selectRate = (rate: Rate) => setSelected({ courierCode: rate.courierCode, serviceCode: rate.serviceCode });
    const selectedRate = selected ? rates.find((r) => r.courierCode === selected.courierCode && r.serviceCode === selected.serviceCode) ?? null : null;
    const shipping = selectedRate?.price ?? 0;
    const groupedRates = groupShippingRatesByCategory(rates);

    // ---- Destination address: map/area components (auto-filled) + the customer's own detail ----
    const destinationFieldValues = {
        streetLine: destinationAddress ? destinationAddress.streetLine || destinationAddress.displayName : "",
        village: destinationAddress?.village ?? "",
        district: destinationAddress?.district ?? "",
        city: destinationAddress?.city ?? "",
        province: destinationAddress?.province ?? "",
        postalCode: destinationAddress?.postalCode ?? "",
    };
    // The manual detail (blok / RT / RW / patokan) is only recombined here; it never
    // replaces a map component, and a map update never erases it.
    const destinationParts: DeliveryAddressParts = { ...destinationFieldValues, detail: form.addressDetail };
    const destinationStreet = streetLevelAddress(destinationParts);
    const destinationLocality = joinAddressParts([destinationParts.village, destinationParts.district]);
    const destinationRegion = joinAddressParts([destinationParts.city, destinationParts.province, destinationParts.postalCode]);

    // A destination is only deliverable with a confirmed full-precision pin, an
    // authoritative Biteship destinationAreaId and a real formatted address.
    const destinationValid = isValidDeliveryLocation({
        formattedAddress: formatDeliveryAddress(destinationParts),
        latitude: confirmedLocation?.latitude,
        longitude: confirmedLocation?.longitude,
        destinationAreaId: destinationArea?.id,
    });
    // A quote is only usable while it still belongs to the CURRENT destination signature.
    const shippingReady = Boolean(selectedRate) && !mustInvalidateShipping(quoteSignature, destinationSignature);
    const recipientValid = isValidRecipientName(form.recipientName) && isValidRecipientPhone(form.phone);
    const dropshipValid = mode !== "dropship" || isDistinctDropshipSender(senderName, form.recipientName);
    const canSubmit = destinationValid && shippingReady && recipientValid && dropshipValid && !paying && !processing;
    // Only a quote that still belongs to the CURRENT destination may be added to the total.
    const total = (session?.subtotal ?? 0) + (shippingReady ? shipping : 0);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submittingRef.current || !session) return;
        if (!isValidRecipientName(form.recipientName)) { setError("Nama penerima wajib diisi."); return; }
        if (!isValidRecipientPhone(form.phone)) { setError("Nomor HP penerima wajib diisi."); return; }
        if (mode === "dropship" && !isDistinctDropshipSender(senderName, form.recipientName)) { setError("Nama pengirim (dropshipper) wajib diisi."); return; }
        if (!destinationValid) { setError("Tentukan titik lokasi pengiriman di peta sebelum melanjutkan."); return; }
        if (!destinationArea) { setError("Pilih kecamatan / kelurahan tujuan pengiriman."); return; }
        // The quote must still belong to the CURRENT destination, otherwise the ongkir
        // (and its quoteRef) was issued for another location and cannot be submitted.
        if (!shippingReady) { setError("Ongkir sudah tidak berlaku untuk lokasi ini. Pilih ulang jasa kurir."); return; }
        if (!selectedRate) { setError("Pilih jasa kurir sebelum melanjutkan."); return; }
        submittingRef.current = true;
        setPaying(true);
        setError("");

        const payload = {
            recipientName: cleanFieldValue(form.recipientName),
            phone: cleanFieldValue(form.phone),
            email: cleanFieldValue(form.email) || undefined,
            // Street address = map/area street line + the customer's OWN detail.
            address: destinationStreet,
            note: cleanFieldValue(form.note) || undefined,
            province: destinationFieldValues.province,
            city: destinationFieldValues.city,
            district: destinationFieldValues.district,
            postalCode: destinationFieldValues.postalCode,
            paymentMethod: form.paymentMethod,
            senderName: mode === "dropship" ? cleanFieldValue(senderName) || undefined : undefined,
            senderPhone: mode === "dropship" ? cleanFieldValue(senderPhone) || undefined : undefined,
            hidePrice: mode === "dropship" ? hidePrice : undefined,
            destinationAreaId: destinationArea.id,
            courierCode: selectedRate.courierCode,
            courierName: selectedRate.courierName,
            serviceCode: selectedRate.serviceCode,
            serviceName: selectedRate.serviceName,
            quoteRef: selectedRate.quoteRef,
            destinationLatitude: confirmedLocation?.latitude,
            destinationLongitude: confirmedLocation?.longitude,
            destinationProvince: destinationFieldValues.province,
            destinationCity: destinationFieldValues.city,
            destinationDistrict: destinationFieldValues.district,
            destinationVillage: destinationFieldValues.village,
            destinationPostalCode: destinationFieldValues.postalCode,
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

                <form onSubmit={submit} className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:items-start">
                    {/* LEFT COLUMN — map-first address flow */}
                    <div className="space-y-6">
                        <Panel title="Alamat Pengiriman">
                            <div className="grid grid-cols-3 gap-2">
                                <ModeButton icon={<Home size={16} />} label={ADDRESS_MODE_LABELS.saved} active={mode === "saved"} onClick={() => switchMode("saved")} />
                                <ModeButton icon={<PackageOpen size={16} />} label={ADDRESS_MODE_LABELS.dropship} active={mode === "dropship"} onClick={() => switchMode("dropship")} />
                                <ModeButton icon={<MapPin size={16} />} label={ADDRESS_MODE_LABELS.other} active={mode === "other"} onClick={() => switchMode("other")} />
                            </div>

                            <p className="mt-3 text-xs text-[#6D6558]">{ADDRESS_MODE_HINTS[mode]}</p>

                            {mode === "saved" && (
                                <div className="mt-4 space-y-2">
                                    {profileAddresses.length === 0 && <p className="text-sm text-[#6D6558]">Belum ada alamat tersimpan. Gunakan mode {ADDRESS_MODE_LABELS.other}.</p>}
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

                        <Panel title={mapsStatus === "unavailable" ? "1 · Isi Alamat Manual" : "1 · Pilih Lokasi di Peta"}>
                            {mapsStatus === "unavailable" ? (
                                <div className="rounded-2xl border border-[#8B6B3F]/30 bg-[#FFF2D6] p-5 text-center">
                                    <TriangleAlert size={28} className="mx-auto text-[#8B6B3F]" />
                                    <h3 className="mt-2 font-display text-lg font-bold text-[#123524]">Peta Google Tidak Tersedia</h3>
                                    <p className="mt-1 text-sm text-[#6D6558]">Layanan peta sedang tidak aktif. Silakan isi alamat pengiriman secara manual.</p>
                                    <button 
                                        type="button" 
                                        onClick={() => switchMode("other")}
                                        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#184D47] px-5 text-sm font-bold text-white hover:bg-[#123524] sm:w-auto sm:px-8"
                                    >
                                        <MapPin size={16} /> Mulai Isi Alamat Manual
                                    </button>
                                </div>
                            ) : confirmedLocation === null ? (
                                <div className="rounded-2xl border border-[#C9A45B]/30 bg-white p-5 text-center">
                                    <MapPin size={28} className="mx-auto text-[#184D47]" />
                                    <h3 className="mt-2 font-display text-lg font-bold text-[#123524]">Pilih Lokasi Pengiriman</h3>
                                    <p className="mt-1 text-sm text-[#6D6558]">Tentukan titik rumah atau lokasi tujuan melalui peta.</p>
                                    <button type="button" onClick={openLocationPicker} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#184D47] px-5 text-sm font-bold text-white hover:bg-[#123524] sm:w-auto sm:px-8">
                                        <MapPin size={16} /> Buka Peta
                                    </button>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-[#184D47]/30 bg-[#EAF1ED] p-5">
                                    <p className="flex items-center gap-2 text-sm font-bold text-[#184D47]"><Check size={16} /> Lokasi pengiriman dipilih</p>
                                    <p className="mt-2 break-words text-[#2E2A26]">{destinationStreet || "Alamat belum terisi"}</p>
                                    {destinationLocality && <p className="text-sm text-[#2E2A26]">{destinationLocality}</p>}
                                    <p className="text-sm text-[#6D6558]">{destinationRegion}</p>
                                    {/* Google's own answer, shown as the success it is — independent of
                                        whether Biteship could already match an area. */}
                                    {reverseState === "done" && destinationAddress?.displayName && (
                                        <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-[#184D47]">
                                            <Check size={16} className="mt-0.5 shrink-0" />
                                            <span>{ADDRESS_FOUND_LABEL}: <span className="font-normal break-words">{destinationAddress.displayName}</span></span>
                                        </p>
                                    )}
                                    {/* Only a REAL Google failure is reported, and an unavailability is
                                        never dressed up as an unrecognizable address. Once an official
                                        Biteship area is matched, the delivery address is complete. */}
                                    {reverseState === "error" && areaState !== "matched" && (
                                        <p className={`mt-2 text-sm font-semibold ${reverseFailure === "no_address" ? "text-red-700" : "text-[#8B6B3F]"}`}>
                                            {reverseFailure === "no_address" ? REVERSE_NO_ADDRESS_CARD : REVERSE_UNAVAILABLE_CARD}
                                        </p>
                                    )}
                                    <button type="button" onClick={openLocationPicker} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#184D47] px-4 text-sm font-bold text-[#184D47] hover:bg-white">
                                        <MapPin size={14} /> Ubah Lokasi
                                    </button>
                                </div>
                            )}
                        </Panel>

                        <Panel title="Data Penerima">
                            {/* REMOVED: Google Maps warning - not applicable for Biteship-only checkout */}
                            /**
                             {mapsStatus === "unavailable" && (
                                <div className="mb-4 rounded-xl border border-[#C9A45B]/30 bg-[#FFF2D6] p-3">
                                    <p className="text-xs font-bold text-[#8B6B3F]">⚠️ PETA GOOGLE TIDAK TERSEDIA</p>
                                    <p className="mt-1 text-xs text-[#6D6558]">Karena API kunci Google Maps tidak aktif, silakan isi alamat manual secara lengkap.</p>
                                </div>
                             )}
                            **/
                            // Manual address field for when map is unavailable - now always shown as fallback
                            
                            <div className="grid gap-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Nama Penerima *" value={form.recipientName} onChange={(v) => update("recipientName", v)} placeholder={RECIPIENT_NAME_PLACEHOLDER} />
                                    <Field label="Nomor HP *" value={form.phone} onChange={(v) => update("phone", v)} placeholder={RECIPIENT_PHONE_PLACEHOLDER} />
                                </div>
                                
                                {/* Address Detail field - now always visible */}
                                {/* The street line and administrative components come from confirmed map pin / Biteship area. Only the customer's own detail (blok/RT-RW/patokan) is typed here. */}
                                <Field label="Detail Alamat (Blok / No. / RT-RW / Patokan)" value={form.addressDetail} onChange={(v) => update("addressDetail", v)} placeholder={ADDRESS_DETAIL_PLACEHOLDER} />

                                <div className="rounded-xl border border-[#C9A45B]/30 bg-[#F8F5EE] p-3">
                                    <p className="text-xs font-bold tracking-wide text-[#6D6558]">ALAMAT DARI PETA / AREA</p>
                                    <p className="mt-1 break-words text-sm text-[#2E2A26]">{destinationStreet || "Belum ada alamat dari peta."}</p>
                                    {destinationLocality && <p className="text-sm text-[#2E2A26]">{destinationLocality}</p>}
                                    <p className="text-sm text-[#6D6558]">{destinationRegion}</p>
                                </div>

                                {areaState === "matched" && destinationArea && (
                                    <p className="flex items-center gap-2 rounded-xl bg-[#EAF1ED] p-3 text-sm font-bold text-[#184D47]"><Check size={16} /> Area pengiriman tersedia: {[destinationArea.name, destinationArea.district, destinationArea.city, destinationArea.province, destinationArea.postalCode].filter(Boolean).join(", ")}</p>
                                )}
                                {areaState === "matching" && <p className="text-sm text-[#6D6558]"><Loader2 size={14} className="mr-1 inline animate-spin" />Mencocokkan area pengiriman...</p>}
                                {/*
                                    The address Google recognized and the Biteship area match are TWO
                                    separate successes. When Google answered but no official area was
                                    matched yet, the customer is asked for the area — never told the
                                    address failed.
                                */}
                                {areaState === "not_found" && (
                                    <div className="rounded-xl bg-[#FFF2D6] p-3">
                                        <p className="text-sm font-bold text-[#123524]">{reverseState === "done" ? AREA_FALLBACK_TITLE_AFTER_ADDRESS : AREA_FALLBACK_TITLE}</p>
                                        <p className="mt-1 text-xs text-[#6D6558]">{reverseState === "done" ? AREA_FALLBACK_HINT_AFTER_ADDRESS : AREA_FALLBACK_HINT}</p>
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
                                {/* Development diagnostics only — never rendered for customers. */}
                                {process.env.NODE_ENV !== "production" && areaDiagnostics && (
                                    <details className="rounded-xl border border-dashed border-[#C9A45B]/40 bg-white/60 p-3 text-xs text-[#6D6558]">
                                        <summary className="cursor-pointer font-bold">Diagnostik area (dev)</summary>
                                        <p className="mt-2">Kueri: {areaDiagnostics.completed}/{areaDiagnostics.queries} · Kandidat: {areaDiagnostics.candidates} · Skor: {areaDiagnostics.score ?? "-"} · Resolved: {areaDiagnostics.resolved ? "ya" : "tidak"}</p>
                                        <p>Input: {[areaDiagnostics.input.village, areaDiagnostics.input.district, areaDiagnostics.input.city, areaDiagnostics.input.province, areaDiagnostics.input.postcode].filter(Boolean).join(", ") || "-"}</p>
                                        <p>Alasan: {areaDiagnostics.reasons.join(", ") || "-"}</p>
                                        <p>Konflik: {areaDiagnostics.conflicts.join(", ") || "-"}</p>
                                    </details>
                                )}
                            </div>

                            {mode === "dropship" && (
                                <div className="mt-4 grid gap-3 rounded-2xl bg-[#FFF2D6] p-4">
                                    <p className="text-sm font-bold text-[#123524]">Data Pengirim / Dropshipper</p>
                                    <Field label="Nama Pengirim *" value={senderName} onChange={setSenderName} placeholder={SENDER_NAME_PLACEHOLDER} />
                                    <Field label="Nomor HP Pengirim" value={senderPhone} onChange={setSenderPhone} placeholder={SENDER_PHONE_PLACEHOLDER} />
                                    <label className="flex items-start gap-3 text-sm text-[#2E2A26]">
                                        <input type="checkbox" checked={hidePrice} onChange={(e) => setHidePrice(e.target.checked)} className="mt-1 h-4 w-4 accent-[#184D47]" />
                                        <span>Sembunyikan harga dari penerima</span>
                                    </label>
                                    <p className="text-xs text-[#6D6558]">Pesanan dikirim dari gudang AFA STORE. Nama pengirim digunakan sebagai identitas dropshipper.</p>
                                </div>
                            )}

                            {mode !== "dropship" && (
                                <div className="mt-4">
                                    <Field label="Catatan (opsional)" value={form.note} onChange={(v) => update("note", v)} placeholder={ADDRESS_NOTE_PLACEHOLDER} />
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
                            {shippingReady && selectedRate?.duration && <p className="flex justify-between text-xs text-[#6D6558]">Estimasi <b>{formatShippingDuration(selectedRate.duration)}</b></p>}
                            <p className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">Total <b>{formatRupiah(total)}</b></p>
                            <p className="mt-1 text-xs text-[#6D6558]">Total final divalidasi ulang oleh server saat checkout.</p>
                        </div>

                        <div className="luxury-card rounded-[28px] p-5 md:p-6">
                            <h2 className="mb-3 font-display text-2xl font-bold text-[#123524]">Pilih Metode Pengiriman</h2>
                            <ShippingRates state={rateState} error={rateError} groups={groupedRates} selected={selected} onSelect={selectRate} onRetry={() => setRateReload((n) => n + 1)} />
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

            {mapOpen && (
                <div className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F8F5EE]" role="dialog" aria-modal="true" aria-label="Tentukan Lokasi Pengiriman">
                    {/* Header */}
                    <header className="flex shrink-0 items-center gap-2 border-b border-[#C9A45B]/30 bg-white px-3 py-3">
                        <button type="button" onClick={closeLocationPicker} aria-label="Tutup peta" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#123524] hover:bg-[#F0E7D8]">
                            <ArrowLeft size={20} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate font-display text-base font-bold text-[#123524] sm:text-lg">Tentukan Lokasi Pengiriman</h2>
                            <p className="truncate text-xs text-[#6D6558]">Geser peta sampai pin tepat di rumah/lokasi tujuan.</p>
                        </div>
                        <button type="button" onClick={useMyLocation} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-[#184D47] px-3 text-xs font-bold text-[#184D47] hover:bg-[#EAF1ED]">
                            {geoState === "locating" ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
                            <span className="hidden sm:inline">Gunakan Lokasi Saya</span>
                            <span className="sm:hidden">GPS</span>
                        </button>
                        <button type="button" onClick={closeLocationPicker} aria-label="Tutup" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#123524] hover:bg-[#F0E7D8]">
                            <X size={20} />
                        </button>
                    </header>

                    {/*
                        Body. On a phone the whole block scrolls with ONE finger (the map is in
                        cooperative mode, so a single finger never pans it) and the CTA below stays
                        outside the scroll area. On desktop the map simply fills the free height.
                        Gestures are never globally cancelled: no `touch-action: none`, no
                        preventDefault on touchmove/wheel.
                    */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">

                        {/* Search */}
                        <div className="relative z-30 shrink-0 border-b border-[#C9A45B]/30 bg-white px-4 py-3">
                            <CheckoutLocationSearch onSelect={handleSearchSelect} />
                            {locationMessage && <p className="mt-2 text-xs text-[#8B6B3F]">{locationMessage}</p>}
                        </div>

                        {/* Map — the majority of the viewport on desktop, a comfortable fixed height
                            on a phone so the confirmation button below can never be covered. */}
                        <div className="relative h-[44dvh] min-h-[240px] shrink-0 sm:h-auto sm:min-h-0 sm:flex-1">
                            <CheckoutLocationMap
                                fullscreen
                                center={draftLocation}
                                zoom={mapZoom}
                                onCenterChange={handleCenterChange}
                                onZoomChange={setMapZoom}
                                onInteractionStart={handleInteractionStart}
                                onInteractionEnd={handleInteractionEnd}
                            />
                        </div>
                    </div>

                    {/* Bottom confirmation panel — OUTSIDE the scrolling area, so
                        "GUNAKAN LOKASI INI" always stays visible and easy to tap. */}
                    <div
                        className="shrink-0 border-t border-[#C9A45B]/30 bg-white px-4 pb-3 pt-3"
                        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
                    >
                        {reverseState === "loading" ? (
                            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-[#6D6558]"><Loader2 size={16} className="animate-spin" /> Mengenali alamat...</p>
                        ) : (
                            <p className={`text-center text-sm font-semibold ${settled ? "text-[#184D47]" : "text-[#8B6B3F]"}`}>
                                {interacting ? "Menggeser peta..." : settled ? "Lokasi siap dipilih" : "Menentukan titik..."}
                            </p>
                        )}

                        {/* Only a REAL address failure is an error. A failed address service is reported
                            in amber as a service problem, never as an unrecognizable location. */}
                        {reverseState === "error" && (
                            <div
                                role="alert"
                                className={
                                    reverseFailure === "no_address"
                                        ? "mt-2 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700"
                                        : "mt-2 rounded-xl bg-[#FFF2D6] p-3 text-center text-sm text-[#8B6B3F]"
                                }
                            >
                                <p>{reverseFailure === "no_address" ? REVERSE_NO_ADDRESS_MESSAGE : REVERSE_UNAVAILABLE_MESSAGE}</p>
                                <button
                                    type="button"
                                    onClick={confirmLocation}
                                    className={
                                        reverseFailure === "no_address"
                                            ? "mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-red-300 px-4 text-sm font-bold text-red-700 hover:bg-red-100"
                                            : "mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-[#C9A45B] px-4 text-sm font-bold text-[#8B6B3F] hover:bg-[#FFF2D6]"
                                    }
                                >
                                    Coba Lagi
                                </button>
                            </div>
                        )}

                        <button type="button" onClick={confirmLocation} disabled={reverseState === "loading" || areaState === "matching"} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#184D47] px-5 text-sm font-bold text-white hover:bg-[#123524] disabled:opacity-60">
                            {reverseState === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            GUNAKAN LOKASI INI
                        </button>
                    </div>
                </div>
            )}
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

function ShippingRates({ state, error, groups, selected, onSelect, onRetry }: { state: RateState; error: string; groups: { category: ShipmentCategory; rates: Rate[] }[]; selected: { courierCode: string; serviceCode: string } | null; onSelect: (rate: Rate) => void; onRetry: () => void }) {
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
            <div className="space-y-5">
                {groups.map((group) => {
                    const meta = SHIPPING_CATEGORY_LABELS[group.category];
                    return (
                        <section key={group.category} aria-label={meta.title}>
                            <div className="mb-2 border-t border-[#C9A45B]/30 pt-3">
                                <p className="text-sm font-bold tracking-wide text-[#123524]"><span aria-hidden="true">{meta.icon}</span> {meta.title}</p>
                                <p className="text-xs text-[#6D6558]">{meta.hint}</p>
                                {group.category === "instant" && <p className="mt-1 text-xs text-[#8B6B3F]">Pengiriman instan tersedia sesuai jangkauan alamat.</p>}
                            </div>
                            <div className="grid gap-2">
                                {group.rates.map((rate) => {
                                    const estimate = formatShippingDuration(rate.duration);
                                    const isSelected = selected?.courierCode === rate.courierCode && selected?.serviceCode === rate.serviceCode;
                                    return (
                                        <label key={`${rate.courierCode}-${rate.serviceCode}`} className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${isSelected ? "border-[#184D47] bg-[#EAF1ED]" : "border-[#C9A45B]/30"}`}>
                                            <span className="flex min-w-0 items-center gap-3">
                                                <input type="radio" name="shipping-rate" checked={isSelected} onChange={() => onSelect(rate)} />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-bold">{rate.courierName}</span>
                                                    <span className="block text-xs font-semibold text-[#123524]">{rate.serviceName}</span>
                                                    {rate.description && rate.description !== rate.serviceName && <span className="block break-words text-xs text-[#6D6558]">{rate.description}</span>}
                                                    {estimate && <span className="block text-xs text-[#6D6558]">Estimasi {estimate}</span>}
                                                </span>
                                            </span>
                                            <b className="shrink-0 whitespace-nowrap">{formatRupiah(rate.price)}</b>
                                        </label>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
        </fieldset>
    );
}
