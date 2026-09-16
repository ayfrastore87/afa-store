// ---------------------------------------------------------------------------
// Minimal Google Maps JavaScript API type declarations for the AFA STORE
// checkout location picker.
//
// The checkout loads the official Maps JavaScript API bootstrap script directly
// (see src/lib/google-maps-loader.ts) and deliberately avoids adding a large
// typing-only dependency. This global augmentation covers only the surface we
// actually use:
//   - `google.maps.Map` + the pan/zoom events we listen to,
//   - `google.maps.Geocoder` (reverse geocoding of a confirmed pin), which arrives with the
//     `geocoding` library and is therefore optional here,
//   - `google.maps.importLibrary` (the API's own "wait for a library" call),
//   - `google.maps.places.PlaceAutocompleteElement` (Places API "New" widget), which is
//     attached only once the `places` library has been loaded.
//
// The API key is NEVER hardcoded and never logged: it is read from the
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY environment variable by the loader.
// ---------------------------------------------------------------------------

type GoogleLatLngLiteral = { lat: number; lng: number };

interface GoogleMapsLatLng {
    lat(): number;
    lng(): number;
}

interface GoogleMapsEventListener {
    remove(): void;
}

interface GoogleMapsMapOptions {
    center?: GoogleLatLngLiteral;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    disableDefaultUI?: boolean;
    clickableIcons?: boolean;
    keyboardShortcuts?: boolean;
    gestureHandling?: "cooperative" | "greedy" | "auto" | "none";
    backgroundColor?: string;
    fullscreenControl?: boolean;
    mapTypeControl?: boolean;
    rotateControl?: boolean;
    scaleControl?: boolean;
    streetViewControl?: boolean;
    zoomControl?: boolean;
}

interface GoogleMapsMap {
    setCenter(center: GoogleLatLngLiteral): void;
    getCenter(): GoogleMapsLatLng | null;
    setZoom(zoom: number): void;
    getZoom(): number | null;
    /** Reconfigures a live map (used to re-apply the gesture policy on a media change). */
    setOptions?(options: GoogleMapsMapOptions): void;
    addListener(event: string, handler: (...args: unknown[]) => void): GoogleMapsEventListener;
}

interface GoogleGeocodeRequest {
    location: GoogleLatLngLiteral;
    language?: string | null;
    region?: string | null;
}

interface GoogleGeocoderAddressComponent {
    long_name?: string | null;
    short_name?: string | null;
    types?: string[] | null;
}

interface GoogleGeocoderGeometry {
    location?: GoogleMapsLatLng | null;
}

interface GoogleGeocoderResult {
    formatted_address?: string | null;
    address_components?: GoogleGeocoderAddressComponent[] | null;
    geometry?: GoogleGeocoderGeometry | null;
    place_id?: string | null;
    types?: string[] | null;
}

interface GoogleGeocoderResponse {
    results?: GoogleGeocoderResult[] | null;
}

interface GoogleGeocoder {
    geocode(request: GoogleGeocodeRequest): Promise<GoogleGeocoderResponse>;
}

interface GoogleMapsPlaceAutocompleteElementOptions {
    includedRegionCodes?: string[];
    requestedLanguage?: string;
    requestedRegion?: string;
}

interface GoogleMapsPlaceSelectEvent extends Event {
    placePrediction?: { toPlace?: () => GoogleMapsPlace | null } | null;
}

/**
 * `gmp-place-autocomplete` is a custom element. Only the members the checkout uses
 * are declared; the widget renders its own suggestion list (Popover API).
 */
interface GoogleMapsPlaceAutocompleteElement extends HTMLElement {
    placeholder?: string;
    value?: string;
}

interface GoogleMapsPlace {
    formattedAddress?: string | null;
    displayName?: string | { text?: string | null } | null;
    addressComponents?: unknown;
    location?: GoogleMapsLatLng | null;
    fetchFields?(request: { fields: string[] }): Promise<unknown>;
}

/**
 * The `places` library namespace.
 *
 * With `loading=async` the library — and therefore the widget class — is attached AFTER the
 * core modules, so it is not guaranteed to exist just because `window.google` does. Consumers
 * await the loader's `loadGoogleMapsPlaces()` (which uses `importLibrary("places")`) instead of
 * reading this straight after the API loads.
 */
interface GoogleMapsPlacesLibrary {
    PlaceAutocompleteElement?: new (options?: GoogleMapsPlaceAutocompleteElementOptions) => GoogleMapsPlaceAutocompleteElement;
}

interface GoogleMapsApi {
    maps: {
        Map: new (element: HTMLElement, options?: GoogleMapsMapOptions) => GoogleMapsMap;
        /**
         * Optional on purpose: the class arrives with the `geocoding` library, so `google.maps`
         * can exist without it. Consumers await the loader's `loadGoogleMapsGeocoder()` instead
         * of reading this straight after the API loads.
         */
        Geocoder?: new () => GoogleGeocoder;
        /** Removes every listener the API registered on an instance (map teardown). */
        event?: { clearInstanceListeners?: (instance: unknown) => void };
        /**
         * Resolves once a library is usable: the documented way to wait for a library whose
         * script has been requested but whose classes are not attached yet.
         */
        importLibrary?: (library: string) => Promise<unknown>;
        /** Present once the bootstrap ran; its classes arrive with the async module scripts. */
        places?: GoogleMapsPlacesLibrary;
    };
}

interface Window {
    google?: GoogleMapsApi;
}
