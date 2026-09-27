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
    assert.match(page, /fetch\("\/api\/categories"/);
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
test("category image uploads use storage URLs and edits preserve an existing image when omitted", () => {
    const uploadClient = read("../src/lib/category-image-upload-client.ts");
    const uploadRoute = read("../src/app/api/admin/categories/image/route.ts");
    assert.match(uploadClient, /\/api\/admin\/categories\/image/);
    assert.match(uploadRoute, /storage\.from\(BUCKET\)\.upload/);
    assert.match(uploadRoute, /getPublicUrl\(path\)/);
    assert.match(itemRoute, /hasOwnProperty\.call\(body, "imageUrl"\)/);
    assert.match(itemRoute, /data\.imageUrl = imageUrl/);
});

test("category image upload is admin-only, signature-checked, and capped at 500 KB", () => {
    const uploadRoute = read("../src/app/api/admin/categories/image/route.ts");
    assert.match(uploadRoute, /getCurrentAdmin\(\)/);
    assert.match(uploadRoute, /512000/);
    assert.match(uploadRoute, /hasImageSignature/);
    assert.match(uploadRoute, /image\/jpeg/);
    assert.match(uploadRoute, /image\/png/);
    assert.match(uploadRoute, /image\/webp/);
    assert.match(uploadRoute, /upsert: false/);
    assert.doesNotMatch(uploadRoute, /base64|SUPABASE_SERVICE_ROLE_KEY/);
});

test("category image upload classifies configuration and storage failures without weakening auth", () => {
    const uploadRoute = read("../src/app/api/admin/categories/image/route.ts");
    const adminClient = read("../src/lib/supabase-admin.ts");
    assert.match(uploadRoute, /getCurrentAdmin\(\)/);
    assert.match(uploadRoute, /return NextResponse\.json\(\{ error: user \? "Forbidden" : "Unauthorized" \}/);
    assert.match(uploadRoute, /storageFailure/);
    assert.match(uploadRoute, /category === "configuration"/);
    assert.match(uploadRoute, /bucket_not_found/);
    assert.match(uploadRoute, /storage_permission/);
    assert.match(uploadRoute, /\[category-image-upload\]/);
    assert.match(uploadRoute, /status = category === "configuration" \? 500/);
    assert.match(uploadRoute, /status = category === "configuration" \? 500 : category === "bucket_not_found" \? 503 : 502/);
    assert.match(adminClient, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(adminClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(adminClient, /hasUrl: Boolean\(url\)/);
    assert.match(adminClient, /hasServiceRoleKey: Boolean\(serviceRoleKey\)/);
    assert.doesNotMatch(uploadRoute, /console\.log\([^)]*serviceRoleKey/);
});

test("category image upload uses the categories bucket and returns the derived public URL", () => {
    const uploadRoute = read("../src/app/api/admin/categories/image/route.ts");
    assert.match(uploadRoute, /const BUCKET = "categories"/);
    assert.match(uploadRoute, /storage\.from\(BUCKET\)\.upload/);
    assert.match(uploadRoute, /getPublicUrl\(path\)/);
    assert.match(uploadRoute, /return NextResponse\.json\(\{ url: data\.publicUrl, path \}/);
    assert.doesNotMatch(uploadRoute, /from\("products"\)|from\("sales-visits"\)/);
});

test("category uploader optimizes to centered 600px WebP before upload", () => {
    const client = read("../src/lib/category-image-upload-client.ts");
    const pageSource = read("../src/app/admin/(protected)/categories/page.tsx");
    assert.match(client, /CATEGORY_IMAGE_SIZE = 600/);
    assert.match(client, /image\/webp/);
    assert.match(client, /512000/);
    assert.match(client, /drawImage/);
    assert.match(client, /quality of \[0\.85/);
    assert.match(pageSource, /onDrop/);
    assert.match(pageSource, /Memproses Gambar/);
    assert.match(pageSource, /Mengunggah/);
    assert.match(pageSource, /Simpan Kategori/);
    assert.match(pageSource, /Ganti Gambar/);
    assert.match(pageSource, /Belum ada gambar/);
    assert.doesNotMatch(pageSource, /â†/);
});
