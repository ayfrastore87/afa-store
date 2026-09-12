import "server-only";

import { z } from "zod";

// ---------------------------------------------------------------------------
// Partner location vocabulary + server-side validation (Tahap IX).
// PartnerLocation already exists in the schema; no new model or migration.
// `source` is free text (no enum), so these constants document the agreed
// semantics. GPS coordinates from the browser are NEVER trusted as truth —
// the server still authenticates, requires explicit consent, and range-checks
// every value.
// ---------------------------------------------------------------------------

export const PARTNER_LOCATION_SOURCE_MANUAL = "MANUAL";
export const PARTNER_LOCATION_SOURCE_BROWSER_GPS = "BROWSER_GPS";

export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

// Upper bound to reject abnormal GPS accuracy payloads (in meters). Anything
// above this is almost certainly a spoofed or bogus reading. Kept here because
// it is a server-side validation concern; the LIVE/OFFLINE and accuracy *display*
// helpers live in the client-safe `@/lib/location-status` module.
export const ACCURACY_MAX = 10000;

// Client may only ever send latitude/longitude/accuracy/consent. `source` and
// `recordedAt` are assigned by the server. consent must be literally `true`;
// a `false` value (or a missing one) is rejected before anything is stored.
export const partnerLocationInputSchema = z.object({
    latitude: z.number({ message: "Latitude harus berupa angka." }).refine(
        (n) => Number.isFinite(n) && n >= LATITUDE_MIN && n <= LATITUDE_MAX,
        `Latitude harus antara ${LATITUDE_MIN} dan ${LATITUDE_MAX}.`
    ),
    longitude: z.number({ message: "Longitude harus berupa angka." }).refine(
        (n) => Number.isFinite(n) && n >= LONGITUDE_MIN && n <= LONGITUDE_MAX,
        `Longitude harus antara ${LONGITUDE_MIN} dan ${LONGITUDE_MAX}.`
    ),
    accuracy: z
        .number({ message: "Akurasi harus berupa angka." })
        .refine((n) => Number.isFinite(n) && n >= 0, "Akurasi tidak boleh negatif.")
        .refine((n) => n <= ACCURACY_MAX, `Akurasi terlalu besar (maksimal ${ACCURACY_MAX} meter).`)
        .optional(),
    consent: z
        .boolean({ message: "Persetujuan lokasi diperlukan." })
        .refine((v) => v === true, "Persetujuan lokasi diperlukan."),
});

export type PartnerLocationInput = z.infer<typeof partnerLocationInputSchema>;
