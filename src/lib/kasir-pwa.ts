/**
 * Kasir (POS) PWA identity.
 *
 * Pure, dependency-free module (only a Next *type* import) so it can be imported
 * by the manifest route handler, the kasir layouts and the plain node tests.
 *
 * Why a SEPARATE manifest instead of editing `src/app/manifest.ts`:
 *  - `/manifest.webmanifest` is the CUSTOMER app ("AFA STORE", start_url "/") and
 *    is also the manifest the Play Store TWA (docs/android-play-store.md) is built
 *    from. Renaming it would change the customer install identity.
 *  - The kasir needs its own name ("AFA KASIR"), its own `id` and a `start_url`
 *    that opens the POS directly. Chrome treats a different manifest `id` as a
 *    different installable app, so both can live on one origin.
 *
 * The manifest is served OUTSIDE `/kasir` on purpose: every `/kasir*` path except
 * the login page is protected by the proxy (`isProtectedKasirPath`), and a
 * manifest fetch that gets redirected to the login page would break install.
 */

import type { MetadataRoute } from "next";

/**
 * Where the installed app opens. Kept as a literal (no runtime import) so this
 * module stays dependency-free and loadable by plain `node --test`, exactly like
 * `kasir-access.ts`. tests/kasir-pwa.test.mjs asserts it equals KASIR_HOME_PATH.
 */
export const KASIR_START_URL = "/kasir";

export const KASIR_APP_NAME = "AFA KASIR";
export const KASIR_APP_DESCRIPTION = "Kasir AFA STORE — transaksi, pesanan, riwayat, dan laporan dalam satu aplikasi.";

/** Public URL of the kasir manifest. Must never be a protected kasir path. */
export const KASIR_MANIFEST_PATH = "/kasir-manifest.webmanifest";

/** Same AFA palette as the customer manifest / root layout (`#123524` dark green, `#F8F5EE` cream). */
export const KASIR_THEME_COLOR = "#123524";
export const KASIR_BACKGROUND_COLOR = "#F8F5EE";

/** Icons that physically exist in `public/icons/` (checked by tests/kasir-pwa.test.mjs). */
export const KASIR_MANIFEST_ICONS: NonNullable<MetadataRoute.Manifest["icons"]> = [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

export function buildKasirManifest(): MetadataRoute.Manifest {
    return {
        name: KASIR_APP_NAME,
        short_name: KASIR_APP_NAME,
        description: KASIR_APP_DESCRIPTION,
        // Distinct id => Chrome/Edge treat this as a different app than "AFA STORE".
        id: KASIR_START_URL,
        // Opens the POS directly. An unauthenticated launch is sent by the proxy to
        // /kasir/login?next=/kasir and comes back here after login — no PWA-specific
        // auth handling is needed.
        start_url: KASIR_START_URL,
        // Whole origin: /kasir/login, /api/auth/logout and every kasir API stay
        // inside the standalone window instead of popping a browser tab.
        scope: "/",
        lang: "id-ID",
        dir: "ltr",
        display: "standalone",
        orientation: "portrait",
        background_color: KASIR_BACKGROUND_COLOR,
        theme_color: KASIR_THEME_COLOR,
        categories: ["business", "finance", "productivity"],
        icons: KASIR_MANIFEST_ICONS,
    };
}
