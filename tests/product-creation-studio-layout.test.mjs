import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const studio = read("../src/app/admin/(protected)/products/new/ProductCreationStudio.tsx");
const studioCss = read("../src/app/admin/(protected)/products/new/studio.css");

// ---- Mobile layout --------------------------------------------------
test("studio CSS includes 640px mobile breakpoint", () => {
    assert.match(studioCss, /max-width.*640px/);
});

test("studio CSS collapses studio-layout to single column within mobile breakpoint", () => {
    // The @media(max-width:640px) block must set studio-layout to 1fr
    const mobileIdx = studioCss.lastIndexOf("max-width:640px");
    assert.ok(mobileIdx >= 0, "mobile breakpoint must exist");
    const mobileSection = studioCss.slice(mobileIdx);
    assert.match(mobileSection, /studio-layout\{[^}]*grid-template-columns:1fr/);
});

test("studio CSS collapses studio-grid to single column in mobile breakpoint", () => {
    const mobileIdx = studioCss.lastIndexOf("max-width:640px");
    assert.ok(mobileIdx >= 0);
    const mobileSection = studioCss.slice(mobileIdx);
    assert.match(mobileSection, /studio-grid\{[^}]*grid-template-columns:1fr/);
});

test("studio CSS hides aside on mobile", () => {
    const mobileIdx = studioCss.lastIndexOf("max-width:640px");
    assert.ok(mobileIdx >= 0);
    const mobileSection = studioCss.slice(mobileIdx);
    assert.match(mobileSection, /studio-layout aside\{[^}]*display:none/);
});

test("studio page prevents horizontal overflow", () => {
    assert.match(studioCss, /overflow-x:hidden/);
});

// ---- Desktop layout -------------------------------------------------
test("studio CSS defines 2-column desktop layout with aside", () => {
    assert.match(studioCss, /studio-layout\{[^}]*grid-template-columns:[^}]*minmax\(0,1fr\)[^}]*340px/);
});

test("studio aside is sticky on desktop", () => {
    assert.match(studioCss, /studio-layout aside\{[^}]*position:sticky/);
});

// ---- All product fields preserved -----------------------------------
test("all form fields are present: name slug categoryId isActive price stock rating description", () => {
    for (const field of ["name", "slug", "categoryId", "isActive", "price", "stock", "rating", "description"]) {
        assert.match(studio, new RegExp(`form\\.${field}|"${field}"|'${field}'|name="${field}"`), `field ${field} must be present`);
    }
});

test("all form fields are present: flavor size weight badge", () => {
    for (const field of ["flavor", "size", "weight", "badge"]) {
        assert.match(studio, new RegExp(`form\\.${field}|"${field}"|'${field}'|name="${field}"`), `field ${field} must be present`);
    }
});

// ---- Submit logic preserved -----------------------------------------
test("submit validates required fields with showError", () => {
    assert.match(studio, /showError.*"name"/);
    assert.match(studio, /showError.*"categoryId"/);
    assert.match(studio, /showError.*"price"/);
    assert.match(studio, /showError.*"stock"/);
    assert.match(studio, /showError.*"weight"/);
});

test("submit price and stock integer validation unchanged", () => {
    assert.match(studio, /form\.price === "" \|\| !Number\.isInteger\(price\)/);
    assert.match(studio, /form\.stock === "" \|\| !Number\.isInteger\(stock\)/);
});

test("submit POSTs to /api/products with correct body fields", () => {
    assert.match(studio, /\/api\/products/);
    assert.match(studio, /method: "POST"/);
    assert.match(studio, /price, stock, rating, weight/);
});

// ---- Category source unchanged --------------------------------------
test("categories fetched from /api/categories", () => {
    assert.match(studio, /\/api\/categories/);
    assert.match(studio, /setCategories/);
    assert.match(studio, /body\.data \?\? \[\]/);
});

// ---- Image upload unchanged -----------------------------------------
test("image upload uses uploadProductImage via authorized endpoint", () => {
    assert.match(studio, /uploadProductImage\(photo\.file\)/);
    assert.doesNotMatch(studio, /storage\.from\("products"\)/);
});

// ---- Validation preserved -------------------------------------------
test("weight validation: integer and minimum 1", () => {
    assert.match(studio, /!Number\.isInteger\(weight\) \|\| weight < 1/);
});

test("photo size validation preserved", () => {
    assert.match(studio, /photo\.file\.size > 1024 \* 1024/);
});

// ---- Night mode tokens ----------------------------------------------
test("studio CSS has night mode overrides for studio-card", () => {
    assert.match(studioCss, /studio-card\{[^}]*background:var\(--night-surface\)/);
});

test("studio CSS has night mode override for studio-page background", () => {
    assert.match(studioCss, /studio-page\{[^}]*background:var\(--night-bg\)/);
});

test("studio CSS uses html[data-theme=dark] .admin-route-shell scope for night mode", () => {
    assert.match(studioCss, /html\[data-theme="dark"\] \.admin-route-shell/);
});

// ---- Action buttons accessible --------------------------------------
test("submit button has type=submit, aria-busy, and disabled state", () => {
    assert.match(studio, /type="submit"/);
    assert.match(studio, /aria-busy=\{busy\}/);
    assert.match(studio, /disabled=\{busy \|\| processing\}/);
});

test("cancel link points to /admin/products with studio-cancel class", () => {
    assert.match(studio, /className="studio-cancel"/);
    assert.match(studio, /href="\/admin\/products"/);
});

test("studio-submit class used for gold save button", () => {
    assert.match(studio, /className="studio-submit"/);
    assert.match(studioCss, /studio-submit\{[^}]*background:#C9A45B/);
});

// ---- Section structure (01–05) --------------------------------------
test("studio has all 5 numbered sections 01 through 05", () => {
    for (const n of ["01", "02", "03", "04", "05"]) {
        assert.match(studio, new RegExp(`n="${n}"`), `section ${n} must exist`);
    }
});

test("section titles match spec", () => {
    assert.match(studio, /Informasi Produk/);
    assert.match(studio, /Deskripsi Produk/);
    assert.match(studio, /Harga & Stok/);
    assert.match(studio, /Gambar Produk/);
    assert.match(studio, /Informasi Tambahan/);
});

test("section subtitles are present", () => {
    assert.match(studio, /Isi informasi dasar produk/);
    assert.match(studio, /Ceritakan detail produk/);
    assert.match(studio, /Atur harga dan jumlah stok/);
    assert.match(studio, /Unggah foto produk/);
    assert.match(studio, /Atur detail tambahan produk/);
});

test("section-subtitle CSS class is defined", () => {
    assert.match(studioCss, /\.section-subtitle/);
});

test("section-header-text CSS class is defined", () => {
    assert.match(studioCss, /\.section-header-text/);
});

// ---- Upload improved UI ---------------------------------------------
test("photo empty state is clickable with role=button", () => {
    assert.match(studio, /role="button"/);
    assert.match(studio, /Pilih Gambar/);
    assert.match(studio, /Klik untuk upload gambar/);
});

// ---- No backend changes ---------------------------------------------
test("no Prisma or database import in studio TSX", () => {
    assert.doesNotMatch(studio, /@prisma\/client/);
    assert.doesNotMatch(studio, /from "\.\.\/lib\/prisma/);
    assert.doesNotMatch(studio, /from "\.\.\/lib\/revenue/);
});