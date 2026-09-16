"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import type { LocationSearchResult } from "@/lib/geocoding-normalize";
import { GOOGLE_PLACE_FIELDS, normalizeGooglePlace, toLocationSearchResult } from "@/lib/google-geocoding";
import { getGoogleMapsApi, loadGoogleMaps, GoogleMapsLoadError } from "@/lib/google-maps-loader";

type Props = {
    onSelect: (result: LocationSearchResult) => void;
    placeholder?: string;
    className?: string;
};

type SearchStatus = "loading" | "ready" | "unavailable" | "unconfigured";

const SELECTION_ERROR = "Alamat itu belum dapat dibaca. Coba pilih saran lain atau geser peta secara manual.";

/** A missing key is an operator problem; anything else is a transient load failure. */
function statusForError(error: unknown): SearchStatus {
    return error instanceof GoogleMapsLoadError && error.code === "MISSING_KEY" ? "unconfigured" : "unavailable";
}

/**
 * Address search built on the Google Places API (New) autocomplete widget.
 *
 * Google owns suggestion fetching, keyboard navigation, debouncing and the session
 * token (which keeps Places billing correct), so this component never talks to a
 * geocoding proxy of its own. The customer's pick is converted to the internal
 * `LocationSearchResult` shape and handed to `onSelect`, which only moves the DRAFT
 * map center — selecting a suggestion never confirms a delivery location.
 *
 * The Google `place_id` is deliberately dropped during normalization: it must never be
 * used as a Biteship `destinationAreaId`.
 */
export function CheckoutLocationSearch({ onSelect, placeholder = "Cari alamat, jalan, atau tempat", className = "" }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const elementRef = useRef<GoogleMapsPlaceAutocompleteElement | null>(null);
    // Monotonic selection id: a slow lookup for an earlier pick may never overwrite a
    // later one (latest selection wins).
    const selectionRef = useRef(0);
    const onSelectRef = useRef(onSelect);
    const [status, setStatus] = useState<SearchStatus>("loading");
    const [message, setMessage] = useState("");
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        onSelectRef.current = onSelect;
    }, [onSelect]);

    useEffect(() => {
        let disposed = false;
        let element: GoogleMapsPlaceAutocompleteElement | null = null;

        const handleSelect = async (event: Event) => {
            const prediction = (event as GoogleMapsPlaceSelectEvent).placePrediction;
            const place = prediction?.toPlace?.() ?? null;
            if (!place) return;
            const selectionId = ++selectionRef.current;
            setMessage("");
            try {
                // Only the fields the internal address needs, so the Places call stays
                // cheap and the response can never leak into the UI unnormalized.
                await place.fetchFields?.({ fields: [...GOOGLE_PLACE_FIELDS] });
                if (disposed || selectionId !== selectionRef.current) return;
                const result = toLocationSearchResult(normalizeGooglePlace(place));
                if (!result) {
                    setMessage(SELECTION_ERROR);
                    return;
                }
                onSelectRef.current(result);
                // Clear the widget so the next search starts from an empty field.
                if (element) element.value = "";
            } catch {
                if (disposed || selectionId !== selectionRef.current) return;
                // Never surface the raw upstream error to the customer.
                setMessage(SELECTION_ERROR);
            }
        };

        setStatus("loading");
        setMessage("");
        loadGoogleMaps()
            .then(() => {
                const api = getGoogleMapsApi();
                const host = containerRef.current;
                if (disposed || !api || !host) return;
                element = new api.maps.places.PlaceAutocompleteElement({
                    // Indonesian places only, matching the checkout's other locale hints.
                    includedRegionCodes: ["id"],
                    requestedLanguage: "id",
                    requestedRegion: "ID",
                });
                element.placeholder = placeholder;
                // Both event names exist in the wild (`gmp-select` is the current one);
                // binding both keeps the widget working across API bootstrap versions.
                element.addEventListener("gmp-select", handleSelect);
                element.addEventListener("gmp-placeselect", handleSelect);
                host.replaceChildren(element);
                elementRef.current = element;
                setStatus("ready");
            })
            .catch((error: unknown) => {
                if (disposed) return;
                setStatus(statusForError(error));
            });

        return () => {
            disposed = true;
            elementRef.current = null;
            element?.remove();
        };
    }, [attempt, placeholder]);

    const failed = status === "unavailable" || status === "unconfigured";

    return (
        <div className={className}>
            <div ref={containerRef} className={status === "ready" ? "min-h-11" : "hidden"} aria-hidden={status === "ready" ? undefined : true} />

            {status === "loading" ? (
                <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#C9A45B]/30 bg-white px-3 text-sm text-[#6D6558]">
                    <Loader2 size={16} className="animate-spin" />
                    Memuat pencarian alamat...
                </div>
            ) : null}

            {failed ? (
                <div className="rounded-xl border border-[#C9A45B]/30 bg-white px-3 py-2 text-sm text-[#6D6558]">
                    <p className="flex items-start gap-2">
                        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
                        <span>
                            {status === "unconfigured"
                                ? "Pencarian alamat belum aktif. Geser peta secara manual atau pilih area pengiriman di bawah."
                                : "Pencarian alamat gagal dimuat. Geser peta secara manual atau coba lagi."}
                        </span>
                    </p>
                    <button
                        type="button"
                        onClick={() => setAttempt((value) => value + 1)}
                        className="mt-2 inline-flex min-h-9 items-center rounded-full border border-[#184D47] px-3 text-xs font-bold text-[#184D47] hover:bg-[#EAF1ED]"
                    >
                        Coba Lagi
                    </button>
                </div>
            ) : null}

            {message ? (
                <p role="alert" className="mt-2 text-xs font-semibold text-[#8B6B3F]">
                    {message}
                </p>
            ) : null}
        </div>
    );
}
