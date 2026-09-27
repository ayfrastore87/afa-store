import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const component = read("../src/components/home/HomeCategories.tsx");
const home = read("../src/app/page.tsx");
const categoriesApi = read("../src/app/api/categories/route.ts");

test("homepage category cards use the Admin Category.imageUrl source and dynamic names", () => {
    assert.match(home, /fetch\("\/api\/categories"/);
    assert.match(home, /imageUrl: string \| null/);
    assert.match(component, /group\.imageUrl/);
    assert.match(component, /group\.name/);
    assert.match(categoriesApi, /prisma\.category\.findMany/);
});

test("homepage categories remain dynamic and clickable without hardcoded image mapping", () => {
    assert.match(component, /groups\.map/);
    assert.match(component, /onClick=\{\(\) => onSelect\(group\.name\)\}/);
    assert.doesNotMatch(component, /Bawang Goreng|Parcel|Hampers/);
    assert.doesNotMatch(component, /ArrowRight|ChevronLeft|ChevronRight/);
});

test("missing or failed category images use the shared clean fallback", () => {
    const productImage = read("../src/components/product-image.tsx");
    assert.match(productImage, /Foto belum tersedia/);
    assert.match(productImage, /setImageSrc\(null\)/);
    assert.match(component, /ProductImage src=\{group\.imageUrl\}/);
});

test("category cards use responsive image cards and preserve original image rendering in night mode", () => {
    assert.match(component, /grid-cols-2/);
    assert.match(component, /sm:grid-cols-3/);
    assert.match(component, /lg:grid-cols-4/);
    assert.match(component, /object-cover/);
    assert.doesNotMatch(component, /invert|grayscale|brightness-\[/);
});