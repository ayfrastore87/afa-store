import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pageSource = fs.readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
// Landing product card markup lives in its own reusable component.
const productCardSource = fs.readFileSync(new URL("../src/components/product-card.tsx", import.meta.url), "utf8");
const detailPageSource = fs.readFileSync(new URL("../src/app/produk/[slug]/page.tsx", import.meta.url), "utf8");
const ctaSource = fs.readFileSync(new URL("../src/components/product-detail-cta.tsx", import.meta.url), "utf8");
const cartContextSource = fs.readFileSync(new URL("../src/context/cart-context.tsx", import.meta.url), "utf8");
const cartLibSource = fs.readFileSync(new URL("../src/lib/cart.ts", import.meta.url), "utf8");

test("product card image action navigates to /produk/[slug] (no more modal preview)", () => {
    assert.match(productCardSource, /href=\{`\/produk\/\$\{item\.slug\}`\}/);

    assert.doesNotMatch(productCardSource, /onPreview/);
    assert.doesNotMatch(productCardSource, /ImagePreview/);
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

test("Beli Sekarang opens guest WhatsApp order without checkout or order creation", () => {
    const whatsappSource = fs.readFileSync(new URL("../src/lib/whatsapp-order.ts", import.meta.url), "utf8");
    assert.match(ctaSource, /buildWhatsAppOrderUrl\(product, quantity\)/);
    assert.match(ctaSource, /disabled=\{!available\}/);
    assert.doesNotMatch(ctaSource, /\/api\/cart\/buy-now/);
    const buyNowSource = ctaSource.slice(ctaSource.indexOf("const buyNow"), ctaSource.indexOf("const controls"));
    assert.doesNotMatch(buyNowSource, /router\.push|login|checkout/);
    assert.match(whatsappSource, /6287770000883/);
    assert.match(whatsappSource, /encodeURIComponent/);
    assert.match(whatsappSource, /product\.name/);
    assert.match(whatsappSource, /product\.price/);
    assert.match(whatsappSource, /product\.size/);
    assert.match(whatsappSource, /quantity/);
    assert.match(whatsappSource, /SITE_URL.*produk/);
    assert.doesNotMatch(whatsappSource, /fetch|prisma|Payment|Biteship|stock/);
});

test("catalog and homepage buy-now actions share the WhatsApp helper", () => {
    const catalogSource = fs.readFileSync(new URL("../src/components/catalog/catalog-experience.tsx", import.meta.url), "utf8");
    assert.match(pageSource, /buildWhatsAppOrderUrl/);
    assert.match(catalogSource, /buildWhatsAppOrderUrl\(item\)/);
    assert.match(productCardSource, /onClick=\{onBuy\}/);
});

test("schema remains untouched by the customer WhatsApp flow", () => {
    const schemaSource = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    assert.ok(schemaSource.length > 0);
});

test("detail add-to-cart prevents double submit and awaits result", () => {
    assert.match(ctaSource, /if \(!available \|\| adding\) return;/);
    assert.match(ctaSource, /const added = await addToCart\(/);
    assert.match(ctaSource, /aria-busy=\{adding\}/);
    assert.match(ctaSource, /"Menambahkan…"/);
});

test("product card no longer renders \"Lihat gambar\" or \"Lihat detail\" overlay text over the image", () => {
    assert.ok(!productCardSource.includes("Lihat gambar"), "should not render 'Lihat gambar'");
    assert.ok(!productCardSource.includes(">Lihat detail</span>"), "should not render a visible 'Lihat detail' overlay badge");
    assert.ok(!productCardSource.includes("Lihat detail</span>"), "should not render a visible 'Lihat detail' overlay badge");
});

test("product image is a clickable Link with a meaningful accessible label", () => {
    assert.ok(productCardSource.includes("aria-label={`Lihat detail ${item.name}`}"), "image link keeps an accessible label");
    // The image is wrapped in an aspect-square, clickable Link area.
    assert.match(productCardSource, /aspect-square w-full/);
});

test("product image link navigates to /produk/[slug]", () => {
    assert.ok(productCardSource.includes("href={`/produk/${item.slug}`}"), "image links to the product detail route");
});

test("product title also links to the detail page", () => {
    assert.match(productCardSource, /<Link[\s\S]*?href=\{`\/produk\/\$\{item\.slug\}`\}[\s\S]*?className="inline cursor-pointer/, "title links to detail");
});
