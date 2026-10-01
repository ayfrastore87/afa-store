import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const wishlistContext = fs.readFileSync(new URL("../src/context/wishlist-context.tsx", import.meta.url), "utf8");
const homeSource = fs.readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const catalogSource = fs.readFileSync(new URL("../src/components/catalog/catalog-experience.tsx", import.meta.url), "utf8");
const wishlistPage = fs.readFileSync(new URL("../src/app/wishlist/page.tsx", import.meta.url), "utf8");
const cartPage = fs.readFileSync(new URL("../src/app/cart/page.tsx", import.meta.url), "utf8");
const detailCta = fs.readFileSync(new URL("../src/components/product-detail-cta.tsx", import.meta.url), "utf8");
const prompt = fs.readFileSync(new URL("../src/lib/customer-auth-prompt.ts", import.meta.url), "utf8");
const whatsappOrder = fs.readFileSync(new URL("../src/lib/whatsapp-order.ts", import.meta.url), "utf8");
const cartContext = fs.readFileSync(new URL("../src/context/cart-context.tsx", import.meta.url), "utf8");

 test("wishlist actions require customer authentication before mutation", () => {
    assert.match(wishlistContext, /hasAuthenticatedUser/);
    assert.match(wishlistContext, /if \(\!\(await requireAuth\(\)\)\) return;/g);
    assert.match(wishlistContext, /if \(!\(await requireAuth\(\)\)\) return;/g);
    assert.match(wishlistContext, /Silakan Login\/Daftar terlebih dahulu/);
    assert.match(wishlistContext, /if \(!isAuthenticated\) return;/);
    assert.match(wishlistContext, /localStorage\.removeItem/);
});

test("wishlist auth prompt and cart navigation remain protected", () => {
    assert.match(prompt, /Login untuk menggunakan Wishlist/);
    assert.match(prompt, /Simpan produk favorit Anda dengan masuk atau membuat akun AFA STORE/);
    assert.match(prompt, /loginPath\(next\)/);
    assert.match(homeSource, /confirmCustomerAuth\(kind, next\)/);
    assert.ok(catalogSource.includes('confirmCustomerAuth(next === "/wishlist" ? "wishlist" : "cart", next)'));
    assert.ok(homeSource.includes('requireAuth("/cart", "cart")'));
    assert.ok(catalogSource.includes('requireAuth("/cart")'));
});

test("guest cart modal offers WhatsApp first, existing login flow, and dismiss", () => {
    const guestPrompt = prompt.slice(prompt.indexOf("export async function chooseGuestCartAction"));
    assert.match(guestPrompt, /title: "Pesan Produk AFA STORE"/);
    assert.match(guestPrompt, /text: "Pilih cara melanjutkan pesanan Anda\."/);
    assert.match(guestPrompt, /showDenyButton: true/);
    assert.match(guestPrompt, /showCancelButton: true/);
    assert.match(guestPrompt, /confirmButtonText: "Pesan via WhatsApp"/);
    assert.match(guestPrompt, /denyButtonText: "Login \/ Daftar"/);
    assert.match(guestPrompt, /cancelButtonText: "Nanti"/);
    assert.match(guestPrompt, /confirmButtonColor: "#25D366"/);
    assert.match(guestPrompt, /buildWhatsAppOrderUrl\(product, quantity\)/);
    assert.match(guestPrompt, /if \(result\.isConfirmed && whatsappUrl\) window\.open\(whatsappUrl, "_blank", "noopener,noreferrer"\)/);
    assert.match(guestPrompt, /if \(result\.isDenied\) window\.location\.assign\(loginPath\(productUrl\)\)/);
    assert.doesNotMatch(guestPrompt, /if \(result\.isDismissed\).*window\./);
    assert.doesNotMatch(guestPrompt, /addToCart|\/api\/checkout\/order|prisma|supabase/i);
});

test("homepage, catalog/category, and detail cart buttons use guest modal before cart mutation", () => {
    for (const [source, branch, modal] of [
        [homeSource, "const addCart", /chooseGuestCartAction\(`\/`, \{ \.\.\.item, slug: item\.slug \}\)/],
        [catalogSource, "const addCart", /chooseGuestCartAction\("\/produk", item\)/],
        [detailCta, "const addProduct", /chooseGuestCartAction\(`\/produk\/\$\{product\.slug\}`, product, quantity\)/],
    ]) {
        const handler = source.slice(source.indexOf(branch), source.indexOf("const ", source.indexOf(branch) + 6));
        assert.match(handler, /if \(!\(await hasAuthenticatedUser\(\)\)\) \{/);
        assert.match(handler, modal);
        assert.match(handler, /await addToCart\(/);
        const guestBranch = handler.slice(handler.indexOf("if (!(await hasAuthenticatedUser())"));
        assert.doesNotMatch(guestBranch.slice(0, guestBranch.indexOf("return;")), /addToCart\(|\/api\/checkout\/order/);
    }
    assert.match(cartContext, /body: JSON\.stringify\(\{ item: \{ id: item\.id, qty \} \}\)/);
});

test("WhatsApp order uses configured number and product metadata, not URL price, session or internal id", () => {
    assert.match(whatsappOrder, /process\.env\.NEXT_PUBLIC_WHATSAPP_NUMBER/);
    assert.match(whatsappOrder, /encodeURIComponent\(buildWhatsAppOrderMessage\(product, quantity\)\)/);
    assert.match(whatsappOrder, /`Produk: \$\{product\.name\}`/);
    assert.match(whatsappOrder, /product\.size \? \[`Ukuran: \$\{product\.size\}`\]/);
    assert.match(whatsappOrder, /product\.flavor \? \[`Rasa: \$\{product\.flavor\}`\]/);
    assert.match(whatsappOrder, /`Harga Satuan: \$\{formatRupiah\(product\.price\)\}`/);
    assert.match(whatsappOrder, /`Jumlah: \$\{safeQuantity\}`/);
    assert.match(whatsappOrder, /`Subtotal: \$\{formatRupiah\(product\.price \* safeQuantity\)\}`/);
    assert.match(whatsappOrder, /`\$\{SITE_URL\}\/produk\/\$\{product\.slug\}`/);
    assert.doesNotMatch(whatsappOrder, /searchParams|query\.price|product\.id|\/api\/checkout\/order|prisma|supabase|hasAuthenticatedUser/);
});

test("guest wishlist and cart navigation remains protected at the route level", () => {
    assert.match(wishlistPage, /hasAuthenticatedUser\(\)/);
    assert.match(cartPage, /hasAuthenticatedUser\(\)/);
});

test("Beli Sekarang uses guest WhatsApp fallback and authenticated cart checkout", () => {
    const buyNow = detailCta.slice(detailCta.indexOf("const buyNow"), detailCta.indexOf("const controls"));
    assert.match(buyNow, /hasAuthenticatedUser\(\)/);
    assert.match(buyNow, /buildWhatsAppOrderUrl\(product, quantity\)/);
    assert.match(buyNow, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
    assert.match(buyNow, /router\.push\("\/cart"\)/);
    // WhatsApp remains as a separate "Tanya via WhatsApp" anchor using buildWhatsAppOrderUrl
    assert.match(detailCta, /buildWhatsAppOrderUrl\(product, quantity\)/);
    assert.match(detailCta, /Tanya via WhatsApp/);
});
