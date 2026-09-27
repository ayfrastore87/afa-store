import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/catalog/catalog-experience.tsx", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../src/app/produk/page.tsx", import.meta.url), "utf8");
const header = source.slice(source.indexOf("function CategoryTiles"), source.indexOf("function WishlistToast"));

test("product category header uses the new premium copy and CTA", () => {
    assert.match(header, /KOLEKSI AFA STORE/);
    assert.match(header, /Temukan Favorit Anda/);
    assert.match(header, /Pilih kategori dan temukan produk pilihan untuk setiap kebutuhan\./);
    assert.doesNotMatch(header, /Kategori Pilihan|Belanja per Kategori|Lihat Semua Produk/);
    assert.match(header, /Jelajahi Semua Produk/);
    assert.match(header, /<ArrowRight/);
    assert.match(header, /href="\/produk"/);
});

test("product category tiles remain dynamic, filter-aware, and active-state aware", () => {
    assert.match(pageSource, /image: category\.imageUrl/);
    assert.match(header, /categories\.map\(\(category\)/);
    assert.match(header, /href=\{buildCatalogHref\(query, \{ category: active \? "" : category\.slug, page: 1 \}\)\}/);
    assert.match(header, /activeSlug === category\.slug/);
    assert.match(header, /active \? "border-\[#C9A45B\] bg-\[#F8F5EE\]/);
    assert.match(header, /rounded-full/);
    assert.match(header, /object-contain/);
    assert.match(header, /flex snap-x snap-proximity flex-nowrap/);
    assert.match(header, /overflow-x-auto/);
    assert.match(header, /overscroll-x-contain/);
    assert.match(header, /shrink-0 snap-start/);
    assert.doesNotMatch(header, /grayscale|invert|filter:/);
});