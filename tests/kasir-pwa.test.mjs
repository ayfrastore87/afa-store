import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { KASIR_HOME_PATH, isProtectedKasirPath } from "../src/lib/kasir-access.ts";
import { KASIR_APP_NAME, KASIR_MANIFEST_PATH, KASIR_START_URL, buildKasirManifest } from "../src/lib/kasir-pwa.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

const customerManifest = read("../src/app/manifest.ts");
const rootLayout = read("../src/app/layout.tsx");
const protectedLayout = read("../src/app/kasir/(protected)/layout.tsx");
const loginPage = read("../src/app/kasir/login/page.tsx");
const manifestRoute = read("../src/app/kasir-manifest.webmanifest/route.ts");
const installPrompt = read("../src/components/kasir/KasirInstallPrompt.tsx");
const settings = read("../src/components/kasir/KasirSettings.tsx");

test("kasir manifest is a valid installable standalone app named AFA KASIR", () => {
    const manifest = buildKasirManifest();
    assert.equal(manifest.name, "AFA KASIR");
    assert.equal(manifest.short_name, "AFA KASIR");
    assert.equal(KASIR_APP_NAME, "AFA KASIR");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.orientation, "portrait");
    // start_url must be the SAME protected home the access policy defines.
    assert.equal(KASIR_START_URL, KASIR_HOME_PATH);
    assert.equal(manifest.start_url, KASIR_HOME_PATH);
    assert.equal(manifest.id, KASIR_HOME_PATH);
    assert.equal(isProtectedKasirPath(manifest.start_url), true);
    // Whole origin in scope so /kasir/login and /api/* stay inside the app window.
    assert.equal(manifest.scope, "/");
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
    // Chrome install criteria: 192 + 512 "any" icons; maskable variants for Android.
    const sizes = (purpose) => manifest.icons.filter((i) => i.purpose === purpose).map((i) => i.sizes).sort();
    assert.deepEqual(sizes("any"), ["192x192", "512x512"]);
    assert.deepEqual(sizes("maskable"), ["192x192", "512x512"]);
    // JSON-serialisable (route handler stringifies it).
    assert.equal(JSON.parse(JSON.stringify(manifest)).name, "AFA KASIR");
});

test("every manifest icon physically exists in public/icons", () => {
    for (const icon of buildKasirManifest().icons) {
        assert.equal(icon.type, "image/png");
        assert.match(icon.src, /^\/icons\/icon-(maskable-)?(192|512)\.png$/);
        assert.equal(exists(`../public${icon.src}`), true, `${icon.src} must exist`);
    }
});

test("manifest is served outside the protected /kasir area so the proxy never redirects it", () => {
    assert.equal(KASIR_MANIFEST_PATH, "/kasir-manifest.webmanifest");
    assert.equal(isProtectedKasirPath(KASIR_MANIFEST_PATH), false);
    assert.equal(exists("../src/app/kasir-manifest.webmanifest/route.ts"), true);
    assert.match(manifestRoute, /buildKasirManifest\(\)/);
    assert.match(manifestRoute, /application\/manifest\+json/);
    assert.match(manifestRoute, /export const dynamic = "force-static";/);
    // Pure JSON endpoint: no auth, no database, no request body.
    assert.doesNotMatch(manifestRoute, /prisma|supabase|requireCashier|getCurrentCashier/);
});

test("kasir pages link the kasir manifest; customer site keeps its own", () => {
    for (const source of [protectedLayout, loginPage]) {
        assert.match(source, /manifest: KASIR_MANIFEST_PATH/);
        assert.match(source, /applicationName: KASIR_APP_NAME/);
        assert.match(source, /appleWebApp: \{ capable: true, title: KASIR_APP_NAME/);
        assert.match(source, /robots: \{ index: false, follow: false \}/);
    }
    // Customer manifest + root layout untouched.
    assert.match(customerManifest, /name: "AFA STORE"/);
    assert.match(customerManifest, /start_url: "\/"/);
    assert.match(rootLayout, /manifest: "\/manifest\.webmanifest"/);
    assert.match(rootLayout, /applicationName: "AFA STORE"/);
    assert.doesNotMatch(customerManifest, /KASIR/);
    assert.doesNotMatch(rootLayout, /kasir-pwa|KASIR/);
});

test("PWA metadata does not weaken the kasir auth structure", () => {
    // Guard still runs in the protected layout; login page still never guards.
    assert.match(protectedLayout, /await requireCashier\(\);/);
    assert.doesNotMatch(loginPage, /requireCashier/);
    assert.match(loginPage, /resolveKasirRoute\(KASIR_LOGIN_PATH, await getCurrentCashier\(\)\)/);
    // No root kasir layout was introduced for the metadata (would re-create the redirect loop).
    assert.equal(exists("../src/app/kasir/layout.tsx"), false);
});

test("install prompt is a self-contained client component with a manual fallback", () => {
    assert.match(installPrompt, /^"use client";/);
    assert.match(installPrompt, /addEventListener\("beforeinstallprompt"/);
    assert.match(installPrompt, /addEventListener\("appinstalled"/);
    assert.match(installPrompt, /\(display-mode: standalone\)/);
    assert.match(installPrompt, /event\.preventDefault\(\);/);
    assert.match(installPrompt, /Install AFA Kasir/);
    assert.match(installPrompt, /Tambahkan ke layar utama/i);
    // Reuses the existing settings button styles (no new CSS).
    assert.match(installPrompt, /kasir-settings-btn kasir-settings-btn-primary/);
    // Presentation only: no network, storage, service worker or popups.
    assert.doesNotMatch(installPrompt, /fetch\(|localStorage|serviceWorker|Swal|alert\(/);
    // Mounted on the kasir settings page.
    assert.match(settings, /import KasirInstallPrompt from "@\/components\/kasir\/KasirInstallPrompt";/);
    assert.match(settings, /<KasirInstallPrompt \/>/);
    assert.match(settings, /title="Aplikasi Kasir"/);
});

test("no service worker is registered anywhere (install works without one; avoids caching POS/API responses)", () => {
    assert.equal(exists("../public/sw.js"), false);
    assert.equal(exists("../public/service-worker.js"), false);
    for (const source of [rootLayout, protectedLayout, loginPage, installPrompt, settings]) {
        assert.doesNotMatch(source, /serviceWorker\.register/);
    }
});
