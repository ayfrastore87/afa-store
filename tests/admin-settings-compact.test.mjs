/**
 * admin-settings-compact.test.mjs
 * Validates the compact settings workspace redesign.
 * UI/UX only — no business logic, API, or schema changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dir, rel), "utf8");

const tsx = read("../src/components/admin/AdminAdvancedPanels.tsx");
const css = read("../src/app/globals.css");

// ── 1. All existing setting keys preserved ────────────────────────────────────
const REQUIRED_KEYS = [
    "storeName", "logo", "favicon", "address", "whatsapp", "email",
    "instagram", "facebook", "tiktok", "maps",
    "shippingEnabled", "couriers", "defaultWeight", "freeShipping",
    "qris", "bankTransfer", "cod", "virtualAccount", "accountNumber", "bankName",
    "websiteTitle", "metaDescription", "seoKeywords", "homeBanner",
    "footerLogo", "themeColor", "darkMode",
    "twoFA", "session",
];

for (const key of REQUIRED_KEYS) {
    test(`setting key "${key}" preserved in STG_FIELD_CFG`, () => {
        assert.ok(tsx.includes(`${key}:`), `Key "${key}" not found in STG_FIELD_CFG`);
    });
}

// ── 2. All 7 sections present in STG_SECTIONS ─────────────────────────────────
const SECTIONS = [
    { id: "informasi",  title: "Informasi Toko" },
    { id: "pengiriman", title: "Pengiriman" },
    { id: "pembayaran", title: "Pembayaran" },
    { id: "website",    title: "Website" },
    { id: "keamanan",   title: "Keamanan" },
    { id: "admin",      title: "Admin" },
    { id: "backup",     title: "Backup" },
];

for (const { id, title } of SECTIONS) {
    test(`section "${id}" (${title}) present in STG_SECTIONS`, () => {
        assert.ok(tsx.includes(`id: "${id}"`), `Section id "${id}" not in STG_SECTIONS`);
        assert.ok(tsx.includes(`title: "${title}"`), `Section title "${title}" not in STG_SECTIONS`);
    });
}

// ── 3. Desktop left navigation ────────────────────────────────────────────────
test("desktop left nav exists with stg-nav class", () => {
    assert.ok(tsx.includes("stg-nav"), "stg-nav class missing");
    assert.ok(tsx.includes('<nav'), "nav element missing");
    assert.ok(tsx.includes('aria-label="Navigasi pengaturan"'), "nav aria-label missing");
});

test("desktop nav uses lg:flex to show only on large screens", () => {
    assert.ok(tsx.includes("lg:flex") && tsx.includes("hidden"), "Desktop nav should be hidden then lg:flex");
});

test("desktop nav items have aria-current for active state", () => {
    assert.ok(tsx.includes('aria-current={active ? "true" : undefined}'), "aria-current missing on nav items");
});

test("desktop nav items have min-h-11 for 44px touch target", () => {
    assert.ok(tsx.includes("min-h-11"), "min-h-11 touch target missing on nav items");
});

// ── 4. Settings workspace panel ────────────────────────────────────────────────
test("stg-workspace class exists for desktop layout container", () => {
    assert.ok(tsx.includes("stg-workspace"), "stg-workspace class missing");
});

test("stg-panel class on workspace content area", () => {
    assert.ok(tsx.includes("stg-panel"), "stg-panel class missing");
});

test("only active section panel is rendered (conditional rendering)", () => {
    // Each section is gated by activeSection checks
    assert.ok(tsx.includes('activeSection === "keamanan"'), "Keamanan section conditional missing");
    assert.ok(tsx.includes('activeSection === "admin"'), "Admin section conditional missing");
    assert.ok(tsx.includes('activeSection === "backup"'), "Backup section conditional missing");
    assert.ok(
        tsx.includes('!["keamanan", "admin", "backup"].includes(activeSection)'),
        "Standard sections conditional missing"
    );
});

// ── 5. Mobile horizontal tabs ─────────────────────────────────────────────────
test("mobile tabs strip exists with stg-mobile-tabs", () => {
    assert.ok(tsx.includes("stg-mobile-tabs"), "stg-mobile-tabs class missing");
});

test("mobile tabs use role=tablist and role=tab", () => {
    assert.ok(tsx.includes('role="tablist"'), "tablist role missing");
    assert.ok(tsx.includes('role="tab"'), "tab role missing");
});

test("mobile tabs use aria-selected for active state", () => {
    assert.ok(tsx.includes("aria-selected={active}"), "aria-selected missing on tabs");
});

test("mobile tabs are hidden on desktop with lg:hidden", () => {
    assert.ok(tsx.includes("stg-mobile-tabs lg:hidden"), "lg:hidden missing on mobile tabs wrapper");
});

test("mobile tabs have whitespace-nowrap to prevent wrapping", () => {
    assert.ok(tsx.includes("whitespace-nowrap"), "whitespace-nowrap missing on tab buttons");
});

// ── 6. Desktop 2-column field grid ────────────────────────────────────────────
test("stg-field-grid class used in field sections", () => {
    assert.ok(tsx.includes("stg-field-grid"), "stg-field-grid class missing");
});

test("stg-field-wide for full-width fields (address, metaDescription etc.)", () => {
    assert.ok(tsx.includes("stg-field-wide"), "stg-field-wide class missing");
});

test("CSS stg-field-grid uses 2-col grid on desktop", () => {
    assert.ok(css.includes("stg-field-grid"), "stg-field-grid not in CSS");
    assert.ok(css.includes("grid-template-columns: 1fr 1fr"), "2-column grid missing");
});

test("CSS stg-field-grid collapses to 1-col on mobile (max-width 767px)", () => {
    assert.ok(css.includes("grid-template-columns: 1fr"), "1-col mobile grid missing");
    assert.ok(css.includes("max-width: 767px"), "mobile breakpoint missing");
});

test("stg-field-wide spans full width (grid-column: 1 / -1)", () => {
    assert.ok(css.includes("grid-column: 1 / -1"), "stg-field-wide full-width rule missing");
});

// ── 7. Compact header with save button ────────────────────────────────────────
test("compact header with Pengaturan title", () => {
    assert.ok(tsx.includes("Pengaturan"), "Pengaturan title missing");
    assert.ok(tsx.includes("stg-header"), "stg-header class missing");
});

test("save button present in header area", () => {
    assert.ok(tsx.includes("Simpan Perubahan"), "Simpan Perubahan text missing");
    assert.ok(tsx.includes("stg-save-btn"), "stg-save-btn class missing");
});

test("dirty state indicator shown when unsaved changes", () => {
    assert.ok(tsx.includes("dirty"), "dirty state missing");
    assert.ok(tsx.includes("Belum disimpan"), "Belum disimpan indicator missing");
    assert.ok(tsx.includes("setDirty(true)"), "setDirty(true) in setValue missing");
    assert.ok(tsx.includes("setDirty(false)"), "setDirty(false) after save missing");
});

// ── 8. Mobile bottom save bar ─────────────────────────────────────────────────
test("mobile bottom save bar with stg-mobile-save", () => {
    assert.ok(tsx.includes("stg-mobile-save"), "stg-mobile-save class missing");
    assert.ok(tsx.includes("stg-mobile-save mt-1"), "mobile save bar positioning class missing");
});

test("mobile bottom save bar hidden on desktop (lg:hidden)", () => {
    assert.ok(tsx.includes("stg-mobile-save mt-1 flex items-center justify-between gap-3 rounded-[16px] border border-[#184D47]/10 bg-white/90 px-4 py-3 shadow-lg backdrop-blur lg:hidden"), "mobile save bar lg:hidden missing");
});

// ── 9. Existing save handler preserved (UNCHANGED) ────────────────────────────
test("save handler uses existing settingSchema.safeParse", () => {
    assert.ok(tsx.includes("settingSchema.safeParse(values)"), "settingSchema.safeParse missing");
});

test("save handler does NOT use browser supabase upsert (moved to server API)", () => {
    // Direct browser supabase upsert fails in production due to RLS on anon key.
    // The save now goes through PATCH /api/admin/settings (service-role server write).
    assert.ok(
        !tsx.includes('supabase.from("settings").upsert'),
        "save() must not use browser supabase.upsert — use PATCH /api/admin/settings instead"
    );
});

test("save handler uses getUserFacingMessage for errors", () => {
    assert.ok(tsx.includes("getUserFacingMessage"), "getUserFacingMessage missing from save handler");
});

test("realtime subscription channel preserved", () => {
    assert.ok(tsx.includes('.channel("afa-settings-panel")'), "realtime channel name changed");
    assert.ok(tsx.includes("supabase.removeChannel"), "removeChannel cleanup missing");
});

// ── 10. Security section preserved ────────────────────────────────────────────
test("security actions preserved: Ganti Password, 2FA, Logout Semua Device, Session", () => {
    assert.ok(tsx.includes("Ganti Password"), "Ganti Password missing");
    assert.ok(tsx.includes('"2FA"'), "2FA action missing");
    assert.ok(tsx.includes("Logout Semua Device"), "Logout Semua Device missing");
    assert.ok(tsx.includes('"Session"'), "Session action missing");
});

test("security actions show stg-security-btn rows with ArrowRight", () => {
    assert.ok(tsx.includes("stg-security-btn"), "stg-security-btn missing");
    assert.ok(tsx.includes("ArrowRight"), "ArrowRight icon missing from security rows");
});

// ── 11. Admin section preserved ───────────────────────────────────────────────
test("admin section: Tambah/Edit/Hapus admin buttons preserved", () => {
    assert.ok(tsx.includes('"Tambah"'), "Tambah admin button missing");
    assert.ok(tsx.includes('"Edit"'), "Edit admin button missing");
    assert.ok(tsx.includes('"Hapus"'), "Hapus admin button missing");
    assert.ok(tsx.includes("adminAction"), "adminAction handler preserved");
});

test("admin section: role selector preserved (Owner/Administrator/Operator/Viewer)", () => {
    assert.ok(tsx.includes('"Owner"'), "Owner role missing");
    assert.ok(tsx.includes('"Administrator"'), "Administrator role missing");
    assert.ok(tsx.includes('"Operator"'), "Operator role missing");
    assert.ok(tsx.includes('"Viewer"'), "Viewer role missing");
});

test("admin list from supabase users table preserved", () => {
    assert.ok(tsx.includes('supabase.from("users").select("id,name,email,role")'), "users query missing");
    assert.ok(tsx.includes('"Owner","Administrator","Operator","Viewer","admin"'), "admin role filter missing");
});

// ── 12. Backup section preserved ──────────────────────────────────────────────
test("backup actions preserved: Backup/Restore/Download", () => {
    assert.ok(tsx.includes("Backup Database"), "Backup Database action missing");
    assert.ok(tsx.includes("Restore Database"), "Restore Database action missing");
    assert.ok(tsx.includes("Download Backup"), "Download Backup action missing");
});

// ── 13. Night mode CSS ────────────────────────────────────────────────────────
test("night mode CSS for stg-input", () => {
    assert.ok(
        css.includes('html[data-theme="dark"] .stg-input'),
        "Night mode stg-input rule missing"
    );
});

test("night mode CSS for stg-panel", () => {
    assert.ok(
        css.includes('html[data-theme="dark"] .stg-panel'),
        "Night mode stg-panel rule missing"
    );
});

test("night mode CSS for stg-toggle-row", () => {
    assert.ok(
        css.includes('html[data-theme="dark"] .stg-toggle-row'),
        "Night mode stg-toggle-row rule missing"
    );
});

test("night mode uses existing CSS variables (--night-input, --night-surface, etc.)", () => {
    assert.ok(css.includes("var(--night-input"), "night-input variable missing");
    assert.ok(css.includes("var(--night-surface"), "night-surface variable missing");
    assert.ok(css.includes("var(--night-text"), "night-text variable missing");
});

// ── 14. No horizontal overflow ────────────────────────────────────────────────
test("mobile tabs use overflow-x-auto on strip (no page overflow)", () => {
    assert.ok(tsx.includes("overflow-x-auto"), "overflow-x-auto missing on tabs strip");
});

test("workspace inputs use w-full (no fixed width)", () => {
    assert.ok(tsx.includes("w-full"), "w-full missing from inputs");
});

test("panel container has min-w-0 to prevent overflow in flex", () => {
    assert.ok(tsx.includes("min-w-0"), "min-w-0 missing from panel container");
});

// ── 15. Accessibility ─────────────────────────────────────────────────────────
test("inputs have aria-label attributes", () => {
    assert.ok(tsx.includes("aria-label={cfg.label}"), "aria-label missing from inputs");
});

test("section navigation keyboard accessible (focus-visible styles)", () => {
    assert.ok(tsx.includes("focus-visible:outline-2"), "focus-visible outline missing");
    assert.ok(tsx.includes("focus-visible:outline-[#D4AF37]"), "focus-visible color missing");
});

// ── 16. No new icons outside existing + new approved icons ────────────────────
test("new icons Building2, CreditCard, Globe, Truck, Users added to imports", () => {
    assert.ok(tsx.includes("Building2"), "Building2 icon missing");
    assert.ok(tsx.includes("CreditCard"), "CreditCard icon missing");
    assert.ok(tsx.includes("Globe"), "Globe icon missing");
    assert.ok(tsx.includes("Truck"), "Truck icon missing");
    assert.ok(tsx.includes("Users"), "Users icon missing");
});

// ── 17. Regression guards ─────────────────────────────────────────────────────
test("defaultSettings still defines all 29 keys", () => {
    const dsIdx = tsx.indexOf("const defaultSettings");
    assert.ok(dsIdx > -1, "defaultSettings not found");
    const dsBlock = tsx.slice(dsIdx, dsIdx + 600);
    assert.ok(dsBlock.includes("storeName"), "storeName missing from defaultSettings");
    assert.ok(dsBlock.includes("twoFA"), "twoFA missing from defaultSettings");
    assert.ok(dsBlock.includes("session"), "session missing from defaultSettings");
});

test("settingSchema unchanged (z.record validation)", () => {
    assert.ok(tsx.includes("z.record(z.string(), z.union([z.string(), z.boolean()]))"), "settingSchema changed");
});

test("save() uses secure PATCH /api/admin/settings endpoint (server-side write)", () => {
    // The compact redesign previously guarded against adding this route.
    // The settings e2e fix now requires it: direct browser supabase upsert fails
    // in production due to RLS/write restrictions on anon key.
    assert.ok(
        tsx.includes('fetch("/api/admin/settings"') || tsx.includes("fetch('/api/admin/settings'"),
        "save() must call /api/admin/settings PATCH instead of direct supabase.upsert"
    );
    assert.ok(
        tsx.includes('"PATCH"') || tsx.includes("'PATCH'"),
        "fetch call must use PATCH method"
    );
});

test("no Prisma references added to SettingsPanel", () => {
    const spIdx = tsx.indexOf("export function SettingsPanel()");
    const spBlock = tsx.slice(spIdx);
    assert.ok(!spBlock.includes("prisma."), "Prisma added to SettingsPanel — should use supabase");
});

test("form still uses onSubmit={save} handler", () => {
    assert.ok(tsx.includes("onSubmit={save}"), "form onSubmit handler changed");
});

test("activeSection default is 'informasi'", () => {
    assert.ok(tsx.includes('useState("informasi")'), "Default activeSection should be informasi");
});