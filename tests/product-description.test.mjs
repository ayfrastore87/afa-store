import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schemaSource = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const validationSource = fs.readFileSync(new URL("../src/lib/product-validation.ts", import.meta.url), "utf8");
const detailPageSource = fs.readFileSync(new URL("../src/app/produk/[slug]/page.tsx", import.meta.url), "utf8");
const adminPageSource = fs.readFileSync(new URL("../src/components/admin/AdminDashboard.tsx", import.meta.url), "utf8");
const studioSource = fs.readFileSync(new URL("../src/app/admin/(protected)/products/new/ProductCreationStudio.tsx", import.meta.url), "utf8");

test("Product Prisma model has an optional description field", () => {
    assert.match(schemaSource, /model Product \{[\s\S]*?description\s+String\?/);
});

test("product validation trims and caps description at 1000 characters, nullable", () => {
    assert.match(validationSource, /PRODUCT_DESCRIPTION_MAX_LENGTH\s*=\s*1000/);
    assert.match(validationSource, /description:\s*optionalText\(PRODUCT_DESCRIPTION_MAX_LENGTH\)/);
});

test("product detail renders description with whitespace-pre-line and a fallback", () => {
    assert.match(detailPageSource, /whitespace-pre-line/);
    assert.match(detailPageSource, /Deskripsi produk belum tersedia\./);
    assert.match(detailPageSource, /product\.description/);
});

test("product detail renders description text safely (no dangerouslySetInnerHTML)", () => {
    assert.doesNotMatch(detailPageSource, /dangerouslySetInnerHTML/);
});

test("admin add/edit form includes a description textarea limited to 1000", () => {
    assert.match(adminPageSource, /Deskripsi Produk/);
    assert.match(adminPageSource, /maxLength=\{1000\}/);
    assert.match(adminPageSource, /form\.description/);
});

test("product creation studio includes an optional description textarea", () => {
    assert.match(studioSource, /Deskripsi Produk/);
    assert.match(studioSource, /maxLength=\{1000\}/);
    assert.match(studioSource, /form\.description/);
});
