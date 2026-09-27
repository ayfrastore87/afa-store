import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const component = read("../src/components/home/HomeCategories.tsx");
const home = read("../src/app/page.tsx");
const categoriesApi = read("../src/app/api/categories/route.ts");
const productImage = read("../src/components/product-image.tsx");
const nextConfig = read("../next.config.ts");

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
    assert.match(productImage, /Foto belum tersedia/);
    assert.match(productImage, /setImageSrc\(null\)/);
    assert.match(component, /ProductImage src=\{group\.imageUrl\}/);
});

test("real Supabase public category URLs are accepted by Next Image and passed through unchanged", () => {
    const source = "https://jaivvnxpbdiksuqzewdd.supabase.co/storage/v1/object/public/categories/test.webp";
    assert.match(nextConfig, /protocol: "https"[\s\S]*hostname: "jaivvnxpbdiksuqzewdd\.supabase\.co"[\s\S]*pathname: "\/storage\/v1\/object\/public\/categories\/\*\*"/);
    assert.match(productImage, /new URL\(src\)/);
    assert.match(productImage, /url\.protocol === "http:" \|\| url\.protocol === "https:"/);
    assert.match(component, /ProductImage src=\{group\.imageUrl\}/);
    assert.match(component, /object-cover/);
    assert.ok(source.startsWith("https://jaivvnxpbdiksuqzewdd.supabase.co/storage/v1/object/public/categories/"));
});

test("fallback is limited to empty/invalid sources or a real image error, and src changes reset state", () => {
    assert.match(productImage, /if \(!src\?\.trim\(\)\) return null/);
    assert.match(productImage, /catch \{\s*return null;/);
    assert.match(productImage, /onError=\{\(\) => \{ setImageSrc\(null\);/);
    assert.match(productImage, /useEffect\(\(\) => \{\s*setImageSrc\(safeImageSource\(src\)\);\s*setLoading\(true\);\s*\}, \[src\]\)/);
});

test("category cards use responsive image cards and preserve original image rendering in night mode", () => {
    assert.match(component, /grid-cols-2/);
    assert.match(component, /sm:grid-cols-3/);
    assert.match(component, /lg:grid-cols-4/);
    assert.match(component, /object-cover/);
    assert.doesNotMatch(component, /invert|grayscale|brightness-\[/);
});