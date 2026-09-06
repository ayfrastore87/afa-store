import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../src/app/api/admin/products/image/route.ts");
const adminClient = read("../src/lib/supabase-admin.ts");
const uploadClient = read("../src/lib/product-image-upload-client.ts");
const studio = read("../src/app/admin/products/new/ProductCreationStudio.tsx");
const studioCss = read("../src/app/admin/products/new/studio.css");
const legacy = read("../src/app/admin/page.tsx");

test("upload rejects unauthenticated and non-admin or inactive users before parsing files", () => {
    const auth = route.indexOf("const user = await getCurrentAdmin()");
    const parsing = route.indexOf("await request.formData()");
    assert.ok(auth >= 0 && auth < parsing);
    assert.match(route, /authenticated \? "Forbidden" : "Unauthorized"/);
    assert.match(route, /status: authenticated \? 403 : 401/);
    assert.match(read("../src/lib/auth.ts"), /admin\.role !== "admin" \|\| admin\.isActive === false/);
});

test("admin upload reaches hard-coded public products bucket with safe generated path", () => {
    assert.match(route, /const BUCKET = "products"/);
    assert.match(route, /Date\.now\(\).*crypto\.randomUUID\(\)/);
    assert.match(route, /\.from\(BUCKET\)\.upload\(path, file/);
    assert.match(route, /upsert: false/);
    assert.match(route, /getPublicUrl\(path\)/);
    assert.doesNotMatch(route, /file\.name/);
});

test("missing, empty, unsupported, oversized, and valid WebP files are covered", () => {
    assert.match(route, /!\(file instanceof File\) \|\| file\.size === 0/);
    assert.match(route, /file\.size > MAX_IMAGE_BYTES/);
    assert.match(route, /status: 413/);
    assert.match(route, /"image\/jpeg": "jpg"/);
    assert.match(route, /"image\/png": "png"/);
    assert.match(route, /"image\/webp": "webp"/);
    assert.match(route, /if \(!extension\).*status: 400/);
});

test("both admin UIs use the authorized endpoint and no direct product Storage upload remains", () => {
    assert.match(uploadClient, /fetch\("\/api\/admin\/products\/image"/);
    assert.match(studio, /uploadProductImage\(photo\.file\)/);
    assert.match(legacy, /uploadProductImage\(file\)/);
    assert.doesNotMatch(studio, /storage\.from\("products"\)/);
    assert.doesNotMatch(legacy, /storage\.from\("products"\)/);
});

test("service role is server-only and never referenced by client code", () => {
    assert.match(adminClient, /^import "server-only";/);
    assert.match(adminClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(adminClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(studio, /SERVICE_ROLE|supabase-admin/);
    assert.doesNotMatch(legacy, /SERVICE_ROLE|supabase-admin/);
});

test("camera and gallery inputs are separate and camera requests the environment lens", () => {
    assert.match(studio, /ref=\{cameraRef\}[^>]*accept="image\/\*"[^>]*capture="environment"/);
    assert.match(studio, /cameraRef\.current\?\.click\(\)/);
    assert.match(studio, /getUserMedia\(\{ video: \{ facingMode: \{ ideal: "environment" \} \}, audio: false \}\)/);
    assert.match(studio, /getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
    assert.match(studio, /📷 Ambil Foto/);
    assert.match(studio, /ref=\{fileRef\}[^>]*accept="image\/\*"/);
    assert.match(studio, /fileRef\.current\?\.click\(\)/);
    assert.doesNotMatch(studio, /ref=\{fileRef\}[^>]*capture=/);
});

test("compression, WebP target, previews, crop, rotation, reset and deletion remain", () => {
    assert.match(studio, /const TARGET = 950_000/);
    assert.match(studio, /canvas\.toBlob\(resolve, "image\/webp"/);
    assert.match(studio, /photo\.file\.size > 1024 \* 1024/);
    for (const marker of ["photo-frame", "product-preview", "Crop", "Putar kiri", "Putar kanan", "Reset editor", "Hapus foto produk"]) assert.match(studio, new RegExp(marker));
});

test("crop editor uses pointer interaction, square handles, bounds and cancel snapshot", () => {
    assert.match(studio, /onPointerMove=\{moveCrop\}/);
    assert.match(studio, /onPointerDown=\{e => updateCrop\(e, "move"\)\}/);
    assert.match(studio, /setPointerCapture\(event\.pointerId\)/);
    assert.match(studio, /const min = 0\.2/);
    assert.match(studio, /Math\.max\(0, Math\.min\(1 - next\.size/);
    assert.match(studio, /Geser sudut crop kiri atas/);
    assert.match(studio, /Geser sudut crop kanan bawah/);
    assert.match(studioCss, /\.crop-preview[^}]*touch-action:none/);
    assert.match(studio, /setCropBeforeEdit\(initial\)/);
    assert.match(studio, /setCrop\(cropBeforeEdit\); setCropOpen\(false\)/);
    assert.match(studio, /onClick=\{beginCrop\}/);
});