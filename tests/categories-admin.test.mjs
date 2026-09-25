import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../src/app/api/categories/route.ts");
const itemRoute = read("../src/app/api/categories/[id]/route.ts");
const page = read("../src/app/admin/(protected)/categories/page.tsx");
const schema = read("../prisma/schema.prisma");
const productStudio = read("../src/app/admin/(protected)/products/new/ProductCreationStudio.tsx");
const catalog = read("../src/app/produk/page.tsx");

test("categories GET remains database-backed with product counts", () => {
    assert.match(route, /export async function GET/);
    assert.match(route, /prisma\.category\.findMany/);
    assert.match(route, /_count/);
});
test("category mutations are admin-guarded and use whitelist data", () => {
    assert.match(route, /export async function POST/);
    assert.match(route, /getCurrentAdmin\(\)/);
    assert.match(itemRoute, /export async function PATCH/);
    assert.match(itemRoute, /export async function DELETE/);
    assert.doesNotMatch(route, /request\.json\(\).*prisma/);
});
test("category creation uses UUID String IDs and deterministic slug", () => {
    assert.match(route, /crypto\.randomUUID\(\)/);
    assert.match(route, /normalize\("NFD"\)/);
    assert.match(route, /hampers|slugify/);
});
test("duplicate, empty-name, and in-use delete protections exist", () => {
    assert.match(route, /Nama kategori wajib diisi/);
    assert.match(route, /Kategori sudah tersedia/);
    assert.match(itemRoute, /Kategori masih digunakan oleh produk/);
    assert.match(itemRoute, /_count: \{ select: \{ products: true \} \}/);
});
test("admin UI supports create/edit/delete and reads the shared API", () => {
    assert.match(page, /fetch\("\/api\/categories"\)/);
    assert.match(page, /Tambah Kategori/);
    assert.match(page, /window\.confirm/);
    assert.match(page, /_count\?\.products/);
});
test("products and catalog retain categoryId and Category.slug architecture", () => {
    assert.match(productStudio, /fetch\("\/api\/categories"\)/);
    assert.match(productStudio, /categoryId/);
    assert.match(catalog, /category\.slug/);
    assert.match(schema, /categoryId\s+String\?/);
    assert.match(schema, /category\s+Category\?/);
});
test("no schema migration or active category field was added", () => {
    assert.match(schema, /model Category/);
    assert.doesNotMatch(schema, /model Category[\s\S]*active\s+Boolean/);
});
