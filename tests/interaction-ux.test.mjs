import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const globalCss = fs.readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
// The landing product card markup lives in its own component now; assert
// against the real source that renders it on the homepage.
const productCardSource = fs.readFileSync(new URL("../src/components/product-card.tsx", import.meta.url), "utf8");

test("enabled interactive elements get pointer cursor", () => {
    assert.match(globalCss, /cursor:\s*pointer/);
    assert.match(globalCss, /a\[href\]/);
    assert.match(globalCss, /button:not\(:disabled\)/);
    assert.match(globalCss, /\[role="button"\]:not\(\[aria-disabled="true"\]\)/);
    assert.match(globalCss, /\[data-clickable="true"\]/);
});

test("disabled controls get not-allowed cursor", () => {
    assert.match(globalCss, /cursor:\s*not-allowed/);
    assert.match(globalCss, /button:disabled/);
    assert.match(globalCss, /\[aria-disabled="true"\]/);
});

test("no blanket universal pointer rule", () => {
    assert.doesNotMatch(globalCss, /\*\s*\{[^}]*cursor\s*:\s*pointer/s);
});

test("prefers-reduced-motion still honored", () => {
    assert.match(globalCss, /prefers-reduced-motion:\s*reduce/);
});

test("cart drawer close control is an accessible button", () => {
    assert.match(pageSource, /aria-label="Tutup keranjang"/);
    assert.match(pageSource, /<button type="button" onClick=\{onClose\}/);
});

test("cart drawer quantity and remove controls remain buttons with labels", () => {
    assert.match(pageSource, /aria-label=\{`Kurangi \$\{i\.name\}`\}/);
    assert.match(pageSource, /aria-label=\{`Tambah \$\{i\.name\}`\}/);
    assert.match(pageSource, /aria-label=\{`Hapus \$\{i\.name\}`\}/);
});

test("cart drawer navigation and action controls preserved", () => {
    assert.match(pageSource, /<Link href="\/cart" onClick=\{onClose\}/);
    assert.match(pageSource, /onClick=\{onCheckout\}/);
    assert.match(pageSource, /onClick=\{clearCart\}/);
    assert.match(pageSource, /Kosongkan Keranjang/);
    assert.match(pageSource, /Lihat Keranjang/);
});

test("cart checkout and clear controls expose disabled state", () => {
    assert.match(pageSource, /disabled=\{!cart\.length \|\| checkoutPending\}/);
    assert.match(pageSource, /disabled=\{!cart\.length\}/);
});

test("ProductCard image and title links unchanged", () => {
    assert.match(productCardSource, /href=\{`\/produk\/\$\{item\.slug\}`\}/);
    assert.match(productCardSource, /aria-label=\{`Lihat detail \$\{item\.name\}`\}/);
    // The image is a clickable Link wrapping an aspect-square image area.
    assert.match(productCardSource, /aspect-square w-full/);
});

test("add-to-cart still uses cart context", () => {
    assert.match(pageSource, /await addToCart\(item\)/);
});
