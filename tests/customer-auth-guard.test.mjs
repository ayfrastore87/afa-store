import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const wishlistContext = fs.readFileSync(new URL("../src/context/wishlist-context.tsx", import.meta.url), "utf8");
const homeSource = fs.readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const catalogSource = fs.readFileSync(new URL("../src/components/catalog/catalog-experience.tsx", import.meta.url), "utf8");
const wishlistPage = fs.readFileSync(new URL("../src/app/wishlist/page.tsx", import.meta.url), "utf8");
const cartPage = fs.readFileSync(new URL("../src/app/cart/page.tsx", import.meta.url), "utf8");
const detailCta = fs.readFileSync(new URL("../src/components/product-detail-cta.tsx", import.meta.url), "utf8");

 test("wishlist actions require customer authentication before mutation", () => {
    assert.match(wishlistContext, /hasAuthenticatedUser/);
    assert.match(wishlistContext, /if \(\!\(await requireAuth\(\)\)\) return;/g);
    assert.match(wishlistContext, /if \(!\(await requireAuth\(\)\)\) return;/g);
    assert.match(wishlistContext, /Silakan Login\/Daftar terlebih dahulu/);
    assert.match(wishlistContext, /if \(!isAuthenticated\) return;/);
    assert.match(wishlistContext, /localStorage\.removeItem/);
});

test("guest wishlist and cart actions use confirmation without mutation before login", () => {
    const prompt = fs.readFileSync(new URL("../src/lib/customer-auth-prompt.ts", import.meta.url), "utf8");
    assert.match(prompt, /Login untuk menggunakan Wishlist/);
    assert.match(prompt, /Login untuk menggunakan Keranjang/);
    assert.match(prompt, /Simpan produk favorit Anda dengan masuk atau membuat akun AFA STORE/);
    assert.match(prompt, /Masuk atau buat akun AFA STORE untuk menyimpan produk ke keranjang/);
    assert.match(prompt, /cancelButtonText: "Nanti"/);
    assert.match(prompt, /confirmButtonText: "Login \/ Daftar"/);
    assert.match(prompt, /loginPath\(next\)/);
    assert.match(homeSource, /confirmCustomerAuth\(kind, next\)/);
    assert.ok(catalogSource.includes('confirmCustomerAuth(next === "/wishlist" ? "wishlist" : "cart", next)'));
    assert.match(detailCta, /confirmCustomerAuth\("cart"/);
    assert.ok(homeSource.includes('requireAuth("/cart", "cart")'));
    assert.ok(catalogSource.includes('requireAuth("/cart")'));
});

test("guest wishlist and cart navigation remains protected at the route level", () => {
    assert.match(wishlistPage, /hasAuthenticatedUser\(\)/);
    assert.match(cartPage, /hasAuthenticatedUser\(\)/);
});

test("guest Beli Sekarang remains a direct WhatsApp action", () => {
    assert.match(detailCta, /buildWhatsAppOrderUrl\(product, quantity\)/);
    const buyNow = detailCta.slice(detailCta.indexOf("const buyNow"), detailCta.indexOf("const controls"));
    assert.doesNotMatch(buyNow, /hasAuthenticatedUser|loginPath|router\.push|checkout/);
});
