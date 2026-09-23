"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Minus, Plus, TriangleAlert } from "lucide-react";

import type { DeliveryCoordinates } from "@/lib/coordinates";
import { getGoogleMapsApi, loadGoogleMaps, GoogleMapsLoadError, GOOGLE_MAPS_LOAD_FAILED_MESSAGE } from "@/lib/google-maps-loader";
import { COARSE_POINTER_QUERY, preferredGestureHandling, type MapGestureHandling } from "@/lib/map-gesture";

const MIN_ZOOM = 3;
const MAX_ZOOM = 20;
// ~1 cm in degrees. The page echoes the published center straight back as a prop, so
// without a tolerance the map and React state would keep pushing each other around.
const CENTER_EPSILON = 1e-7;

/**
 * The gesture policy for THIS device (see src/lib/map-gesture.ts).
 *
 * Touch-first (coarse pointer) → `cooperative`: one finger still scrolls the modal/page and two
 * fingers pinch-zoom the map, so the checkout is never locked. Mouse/trackpad (fine pointer) →
 * `greedy`: the wheel zooms the map under the cursor, which is what desktop users expect.
 * Nothing here ever sets `touch-action` or cancels `touchmove`/`wheel`, so page scrolling is
 * never broken globally.
 */
function mapGestureHandling(): MapGestureHandling {
    return preferredGestureHandling(typeof window === "undefined" ? null : window);
}

/** Coarse picker state so the page can explain a broken or unconfigured map. */
export type CheckoutMapStatus = "loading" | "ready" | "unavailable" | "unconfigured";

type Props = {
    center: DeliveryCoordinates;
    zoom: number;
    onCenterChange: (coords: DeliveryCoordinates) => void;
    onZoomChange: (zoom: number) => void;
    onInteractionStart: () => void;
    onInteractionEnd: () => void;
    onStateChange?: (status: CheckoutMapStatus) => void;
    fullscreen?: boolean;
    /** Compact map presentation used by clickable address thumbnails. */
    thumbnail?: boolean;
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function isSamePoint(a: DeliveryCoordinates | null, b: DeliveryCoordinates | null) {
    if (!a || !b) return false;
    return Math.abs(a.latitude - b.latitude) < CENTER_EPSILON && Math.abs(a.longitude - b.longitude) < CENTER_EPSILON;
}

/** A missing key is an operator problem; everything else is a transient load failure. */
function statusForError(error: unknown): CheckoutMapStatus {
    return error instanceof GoogleMapsLoadError && error.code === "MISSING_KEY" ? "unconfigured" : "unavailable";
}

/**
 * Google Maps JavaScript API picker with a Grab/Gojek-style center pin.
 *
 * The pin never moves: the customer pans the map underneath it, exactly like before.
 * Google owns the map instance (tiles, gestures, its own logo/attribution) while React
 * stays the source of truth — the settled center is published through `onCenterChange`
 * (draft only) and comes back down as the controlled `center` prop. The center is only
 * published when the map settles, so no reverse geocoding can ever run while dragging.
 */
export function CheckoutLocationMap({
    center,
    zoom,
    onCenterChange,
    onZoomChange,
    onInteractionStart,
    onInteractionEnd,
    onStateChange,
    fullscreen = false,
    thumbnail = false,
}: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<GoogleMapsMap | null>(null);
    const lastReportedRef = useRef<DeliveryCoordinates | null>(null);
    const centerRef = useRef(center);
    const zoomRef = useRef(zoom);
    const [status, setStatus] = useState<CheckoutMapStatus>("loading");
    // Bumped by the retry button to re-run the loader with a fresh, single attempt.
    const [attempt, setAttempt] = useState(0);

    // The map instance is created exactly once, so handlers live in a ref: a parent
    // re-render (new function identities) must never rebuild the Google map.
    const handlersRef = useRef({ onCenterChange, onZoomChange, onInteractionStart, onInteractionEnd, onStateChange });
    useEffect(() => {
        handlersRef.current = { onCenterChange, onZoomChange, onInteractionStart, onInteractionEnd, onStateChange };
    }, [onCenterChange, onZoomChange, onInteractionStart, onInteractionEnd, onStateChange]);
    useEffect(() => {
        centerRef.current = center;
    }, [center]);
    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    // Re-apply the gesture policy when the device class really changes: a media change (touch
    // screen turned into a mouse-first setup) or an orientation change must never leave the
    // wrong policy active on a live map. `setOptions` touches only this one option.
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const query = window.matchMedia(COARSE_POINTER_QUERY);
        const apply = () => {
            const map = mapRef.current;
            if (!map || typeof map.setOptions !== "function") return;
            map.setOptions({ gestureHandling: mapGestureHandling() });
        };
        apply();
        query.addEventListener?.("change", apply);
        window.addEventListener("orientationchange", apply);
        return () => {
            query.removeEventListener?.("change", apply);
            window.removeEventListener("orientationchange", apply);
        };
    }, [status]);

    // Create the Google map once the official JS API is available.
    useEffect(() => {
        let disposed = false;
        let unbind: (() => void) | null = null;
        if (!containerRef.current) return;
        setStatus("loading");
        loadGoogleMaps()
            .then(() => {
                const api = getGoogleMapsApi();
                if (disposed || !api || !containerRef.current) return;
                // `loadGoogleMaps()` only resolves once `Map` exists; if that ever drifts, fail
                // with a typed, retryable error instead of a `TypeError` the UI cannot explain.
                if (typeof api.maps.Map !== "function") {
                    throw new GoogleMapsLoadError("LOAD_FAILED", GOOGLE_MAPS_LOAD_FAILED_MESSAGE);
                }
                const map = new api.maps.Map(containerRef.current, {
                    center: { lat: centerRef.current.latitude, lng: centerRef.current.longitude },
                    zoom: zoomRef.current,
                    minZoom: MIN_ZOOM,
                    maxZoom: MAX_ZOOM,
                    // Google's own controls stay off (the checkout keeps its own zoom buttons).
                    // Google's logo/attribution is never hidden or moved.
                    disableDefaultUI: true,
                    clickableIcons: false,
                    keyboardShortcuts: false,
                    gestureHandling: thumbnail ? "none" : mapGestureHandling(),
                    backgroundColor: "#e7e4da",
                });
                mapRef.current = map;
                lastReportedRef.current = centerRef.current;

                // Publish the settled center. `idle` also fires after a programmatic
                // recenter, so an unchanged center is swallowed to keep this loop closed.
                const reportCenter = () => {
                    const current = map.getCenter();
                    if (!current) return;
                    const next = { latitude: current.lat(), longitude: current.lng() };
                    if (isSamePoint(lastReportedRef.current, next)) return;
                    lastReportedRef.current = next;
                    handlersRef.current.onCenterChange(next);
                };

                const listeners = [
                    map.addListener("dragstart", () => handlersRef.current.onInteractionStart()),
                    map.addListener("dragend", () => {
                        reportCenter();
                        handlersRef.current.onInteractionEnd();
                    }),
                    map.addListener("idle", reportCenter),
                    map.addListener("zoom_changed", () => {
                        const nextZoom = map.getZoom();
                        if (typeof nextZoom === "number") handlersRef.current.onZoomChange(nextZoom);
                    }),
                ];

                unbind = () => {
                    for (const listener of listeners) listener.remove();
                    // Also drops the listeners the Maps API registered on the instance, so
                    // reopening the picker cannot pile up ghost listeners.
                    api.maps.event?.clearInstanceListeners?.(map);
                    mapRef.current = null;
                };

                setStatus("ready");
                handlersRef.current.onStateChange?.("ready");
            })
            .catch((error: unknown) => {
                if (disposed) return;
                const next = statusForError(error);
                setStatus(next);
                handlersRef.current.onStateChange?.(next);
            });
        return () => {
            disposed = true;
            if (unbind) unbind();
        };
    }, [attempt]);

    // Programmatic recentering (search suggestion, "Lokasi Saya", saved pin). The map is
    // uncontrolled, so it is only nudged when the requested center is genuinely new.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || status !== "ready") return;
        const current = map.getCenter();
        const currentPoint = current ? { latitude: current.lat(), longitude: current.lng() } : null;
        const next = { latitude: center.latitude, longitude: center.longitude };
        if (isSamePoint(currentPoint, next)) return;
        lastReportedRef.current = next;
        map.setCenter({ lat: next.latitude, lng: next.longitude });
    }, [center.latitude, center.longitude, status]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || status !== "ready") return;
        if (map.getZoom() === zoom) return;
        map.setZoom(zoom);
    }, [zoom, status]);

    const changeZoom = (delta: number) => {
        onZoomChange(clamp(zoom + delta, MIN_ZOOM, MAX_ZOOM));
    };

    const failed = status === "unavailable" || status === "unconfigured";

    return (
        <div
            className={`relative w-full overflow-hidden rounded-2xl border border-neutral-200 bg-[#e7e4da] ${
                fullscreen ? "h-full min-h-[320px] rounded-none border-0" : thumbnail ? "h-full min-h-0 rounded-[1.25rem] border-0" : "h-64 sm:h-72"
            }`}
        >
            <div ref={containerRef} role="application" aria-label="Peta lokasi pengiriman" className="absolute inset-0" />

            {/* Google's own logo/terms are rendered by the API and are never hidden; this
                extra chip keeps the provider visible even on a light/blank basemap. */}
            {status === "ready" ? (
                <p className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                    Peta &copy; Google
                </p>
            ) : null}

            {/* The pin is fixed to the picker and the map moves under it. */}
            {status === "ready" ? (
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center">
                    <span className="mb-1 whitespace-nowrap rounded-full bg-[#123524]/90 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
                        TITIK PENGIRIMAN
                    </span>
                    <MapPin className="h-9 w-9 text-rose-600 drop-shadow-md" strokeWidth={2.5} />
                </div>
            ) : null}

            {status === "ready" && !thumbnail ? (
                <div className="absolute bottom-3 right-3 z-10 flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white/95 shadow-sm">
                    <button
                        type="button"
                        onClick={() => changeZoom(1)}
                        disabled={zoom >= MAX_ZOOM}
                        aria-label="Perbesar peta"
                        className="flex h-9 w-9 items-center justify-center text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                    <span className="h-px w-full bg-neutral-200" />
                    <button
                        type="button"
                        onClick={() => changeZoom(-1)}
                        disabled={zoom <= MIN_ZOOM}
                        aria-label="Perkecil peta"
                        className="flex h-9 w-9 items-center justify-center text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40"
                    >
                        <Minus className="h-4 w-4" />
                    </button>
                </div>
            ) : null}

            {status === "loading" ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm text-neutral-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat peta...
                </div>
            ) : null}

            {failed ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center">
                    <TriangleAlert className="h-6 w-6 text-amber-600" />
                    <p className="text-sm font-semibold text-neutral-800">
                        {status === "unconfigured" ? "Peta belum aktif" : "Peta gagal dimuat"}
                    </p>
                    <p className="max-w-xs text-xs text-neutral-600">
                        {status === "unconfigured"
                            ? "Peta Google belum dikonfigurasi. Kamu masih bisa mencari alamat lalu menggeser titik secara manual."
                            : "Periksa koneksi internet lalu coba lagi. Kamu tetap bisa memakai pencarian alamat."}
                    </p>
                    <button
                        type="button"
                        onClick={() => setAttempt((value) => value + 1)}
                        className="mt-1 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                    >
                        Coba lagi
                    </button>
                </div>
            ) : null}
        </div>
    );
}
