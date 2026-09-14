import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pageSource = fs.readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const detailPageSource = fs.readFileSync(new URL("../src/app/produk/[slug]/page.tsx", import.meta.url), "utf8");
const ctaSource = fs.readFileSync(new URL("../src/components/product-detail-cta.tsx", import.meta.url), "utf8");
const cartContextSource = fs.readFileSync(new URL("../src/context/cart-context.tsx", import.meta.url), "utf8");
const cartLibSource = fs.readFileSync(new URL("../src/lib/cart.ts", import.meta.url), "utf8");

test("product card image action navigates to /produk/[slug] (no more modal preview)", () => {
    assert.match(pageSource, /href=\{`\/produk\/\$\{item\.slug\}`\}/);

    assert.doesNotMatch(pageSource, /onPreview/);
    assert.doesNotMatch(pageSource, /ImagePreview/);
});

test("+ Keranjang uses the existing cart API via addToCart from cart context", () => {
    assert.match(pageSource, /await addToCart\(item\)/);
    assert.match(cartContextSource, /requestCart\("\/api\/cart", \{\s*method: "POST"/);
    assert.match(cartContextSource, /body:\s*JSON\.stringify\(\{\s*item:\s*\{\s*id:\s*item\.id,\s*qty\s*\}\s*\}\)/);
});

test("badge counts total quantity of all items, not row count", () => {
    assert.match(cartLibSource, /calculateTotalItems/);
    assert.match(cartLibSource, /items\.reduce\(\(sum, item\) => sum \+ item\.qty, 0\)/);
    assert.match(pageSource, /formatBadge\(cartItemCount\)/);
    assert.match(pageSource, /formatBadge\(totalItems\)/);
});

test("badge caps at 99+", () => {
    assert.match(pageSource, /function formatBadge\(count: number\) \{ return count > 99 \? "99\+" : String\(count\); \}/);
});

test("badge updates from cart context state without full page reload after add", () => {
    assert.match(cartContextSource, /setCart\(data\.items\)/);
    assert.doesNotMatch(cartContextSource, /window\.location\.reload/);
    assert.doesNotMatch(cartContextSource, /localStorage/);
});

test("unauthenticated add keeps existing auth behavior (login redirect, no guest cart)", () => {
    assert.match(pageSource, /await requireAuth\("\/"\)/);
    assert.match(cartContextSource, /if \(!isAuthenticated\) return false;/);
    assert.doesNotMatch(cartContextSource, /guest/i);
});

test("product detail renders real data: name, price, stock, rating, category, badge", () => {
    assert.match(detailPageSource, /prisma\.product\.findFirst\(\{ where: \{ slug, isActive: true \}, include: \{ category: true \} \}\)/);
    assert.match(detailPageSource, /formatRupiah\(product\.price\)/);
    assert.match(detailPageSource, /product\.stock/);
    assert.match(detailPageSource, /product\.rating/);
    assert.match(detailPageSource, /product\.badge/);
    assert.match(detailPageSource, /product\.category\?\.name/);
});

test("product detail does not fabricate per-product reviews", () => {
    assert.match(detailPageSource, /Belum ada ulasan untuk produk ini\./);
    assert.doesNotMatch(detailPageSource, /testimonials/i);
});

test("Beli Sekarang keeps existing buy-now flow", () => {
    assert.match(ctaSource, /\/api\/cart\/buy-now/);
    assert.match(ctaSource, /JSON\.stringify\(\{ id: product\.id, qty: quantity \}\)/);
    assert.match(ctaSource, /router\.push\(data\?\.redirectTo \|\| "\/checkout"\)/);
});

test("detail add-to-cart prevents double submit and awaits result", () => {
    assert.match(ctaSource, /if \(!available \|\| adding\) return;/);
    assert.match(ctaSource, /const added = await addToCart\(/);
    assert.match(ctaSource, /aria-busy=\{adding\}/);
    assert.match(ctaSource, /"Menambahkan…"/);
});

test("product card no longer renders \"Lihat gambar\" or \"Lihat detail\" overlay text over the image", () => {
    assert.ok(!pageSource.includes("Lihat gambar"), "should not render 'Lihat gambar'");
    assert.ok(!pageSource.includes(">Lihat detail</span>"), "should not render a visible 'Lihat detail' overlay badge");
    assert.ok(!pageSource.includes("Lihat detail</span>"), "should not render a visible 'Lihat detail' overlay badge");
});

test("product image is a clickable Link with a meaningful accessible label", () => {
    assert.ok(pageSource.includes("aria-label={`Lihat detail ${item.name}`}"), "image link keeps an accessible label");
    assert.ok(pageSource.includes("aspect-square w-full cursor-pointer"), "image link is clickable");
});

test("product image link navigates to /produk/[slug]", () => {
    assert.ok(pageSource.includes("href={`/produk/${item.slug}`}"), "image links to the product detail route");
});

test("product title also links to the detail page", () => {
    assert.ok(pageSource.includes('<Link href={`/produk/${item.slug}`} aria-label={`Lihat detail ${item.name}`} className="inline cursor-pointer'), "title links to detail");
});
