import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../src/app/api/admin/products/image/route.ts");
const adminClient = read("../src/lib/supabase-admin.ts");
const uploadClient = read("../src/lib/product-image-upload-client.ts");
const studio = read("../src/app/admin/(protected)/products/new/ProductCreationStudio.tsx");
const studioCss = read("../src/app/admin/(protected)/products/new/studio.css");
const legacy = read("../src/components/admin/AdminDashboard.tsx");
const productRoute = read("../src/app/api/products/route.ts");
const imageCrop = read("../src/lib/product-image-crop.ts");

test("product create uses Supabase admin authorization with the required 401/403 contract", () => {
    assert.match(productRoute, /import \{ getCurrentAdmin, getCurrentUser \} from "@\/lib\/auth"/);
    assert.match(productRoute, /const authenticated = await getCurrentUser\(\)/);
    assert.match(productRoute, /if \(!authenticated\).*error: "Unauthorized".*status: 401/);
    assert.match(productRoute, /const admin = await getCurrentAdmin\(\)/);
    assert.match(productRoute, /if \(!admin\).*error: "Forbidden".*status: 403/);
    assert.doesNotMatch(productRoute, /@\/lib\/server-auth/);
    assert.doesNotMatch(productRoute, /afa_session|JWT_SECRET|NEXTAUTH_SECRET|afa-store-dev-secret/);
    assert.doesNotMatch(productRoute, /role.*request|request.*role/);
});

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

test("product upload diagnoses safe server failures and validates the client payload", () => {
    assert.match(route, /Product image storage failure/);
    for (const category of ["bucket_not_found", "file_too_large", "storage_permission", "storage_api"]) assert.match(route, new RegExp(category));
    assert.match(route, /mimeType: file\.type/);
    assert.match(route, /Unsupported image type/);
    assert.match(uploadClient, /file instanceof File/);
    assert.match(uploadClient, /file\.size === 0/);
    assert.match(uploadClient, /image\/jpeg.*image\/png.*image\/webp/);
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
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
    assert.match(legacy, /optimizeProductImage\(file\)/);
    assert.match(legacy, /uploadProductImage\(optimized\.file\)/);
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

test("gallery uses one multi-file picker without a camera input", () => {
    assert.equal((studio.match(/type="file"/g) ?? []).length, 1);
    assert.match(studio, /type="file" multiple accept="image\/jpeg,image\/png,image\/webp"/);
    assert.doesNotMatch(studio, /cameraRef|capture=|getUserMedia/);
    assert.match(studio, /fileRef\.current\?\.click\(\)/);
});

test("compression, WebP target, previews, crop, rotation, reset and deletion remain", () => {
    assert.match(uploadClient, /TARGET_PRODUCT_IMAGE_BYTES = 800 \* 1024/);
    assert.match(uploadClient, /MAX_PRODUCT_IMAGE_BYTES = 1024 \* 1024/);
    assert.match(uploadClient, /1600, 1400, 1200, 1000, 800, 640/);
    assert.match(uploadClient, /0\.85, 0\.78, 0\.7, 0\.62, 0\.54, 0\.46, 0\.38/);
    assert.match(studio, /canvas\.toBlob\(resolve, PRODUCT_IMAGE_TYPE,/);
    assert.match(studio, /PRODUCT_IMAGE_TYPE/);
    assert.match(imageCrop, /export const PRODUCT_IMAGE_TYPE\s*=\s*"image\/webp"/);
    assert.match(uploadClient, /blob\.size <= MAX_PRODUCT_IMAGE_BYTES/);
    for (const marker of ["photo-frame", "product-preview", "Crop", "Putar kiri", "Putar kanan", "Reset editor", "Hapus foto produk"]) assert.match(studio, new RegExp(marker));
});

test("multi-gallery editor keeps active photo separate from primary", () => {
    assert.match(studio, /activeImageId/);
    assert.match(studio, /onClick=\{\(\) => selectPhoto\(item\.id\)\}/);
    assert.match(studio, /Putar kiri/);
    assert.match(studio, /Putar kanan/);
    assert.match(studio, /galleryRef\.current = galleryRef\.current\.map\(item => item\.id === active\.id \? edited : item\)/);
    assert.match(studio, /URL\.revokeObjectURL\(oldUrl\)/);
    assert.match(studio, /isPrimary: item\.id === galleryRef\.current\[0\]\?\.id/);
});

test("crop editor uses pointer interaction, square handles, bounds and cancel snapshot", () => {
    assert.match(studio, /onPointerMove=\{moveCrop\}/);
    assert.match(studio, /onPointerDown=\{updateCrop\}/);
    assert.match(studio, /onPointerUp=\{endCrop\}/);
    assert.match(studio, /onPointerCancel=\{endCrop\}/);
    assert.match(studio, /setPointerCapture\(event\.pointerId\)/);
    assert.match(studio, /MAX_ZOOM = 3/);
    assert.match(studio, /clamp\(.*-maxPanX, maxPanX\)/);
    assert.match(studio, /crop\?\.panX \?\? 0/);
    assert.match(studio, /crop\?\.panY \?\? 0/);
    assert.match(studioCss, /\.crop-preview[^}]*touch-action:none/);
    assert.match(studio, /setCropBeforeEdit\(initial\)/);
    assert.match(studio, /setCrop\(cropBeforeEdit\); setCropOpen\(false\)/);
    assert.match(studio, /onClick=\{beginCrop\}/);
});