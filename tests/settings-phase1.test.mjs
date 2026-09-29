// settings-phase1.test.mjs -- Phase 1 store settings tests
import { readFileSync } from 'node:fs';
import { ok, doesNotMatch, match } from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
function read(rel) { return readFileSync(path.join(root, rel), 'utf8'); }
const adminRoute    = read('src/app/api/admin/settings/route.ts');
const publicRoute   = read('src/app/api/public/settings/route.ts');
const loader        = read('src/lib/settings-loader.ts');
const layout        = read('src/app/layout.tsx');
const homePage      = read('src/app/page.tsx');
const footer        = read('src/components/premium-footer.tsx');
const waLib         = read('src/lib/whatsapp-order.ts');
const customCta     = read('src/components/custom-order-cta.tsx');
const advPanels     = read('src/components/admin/AdminAdvancedPanels.tsx');
const imageUploader = read('src/lib/settings-image-upload-client.ts');
const imageRoute    = read('src/app/api/admin/settings/image/route.ts');

// ── 1. Admin Settings API ───────────────────────────────────────────────────
test("admin GET: getCurrentAdmin in try/catch 503", () => {
  match(adminRoute, /\[admin-settings-get\] Auth check failed/);
  match(adminRoute, /\[admin-settings-save\] Auth check failed/);
  const n = (adminRoute.match(/admin = await getCurrentAdmin/g) || []).length;
  ok(n >= 2, "both handlers must call getCurrentAdmin inside try");
});
test("admin API: DB errors 503 not 502", () => {
  doesNotMatch(adminRoute, /status: 502/);
  match(adminRoute, /status: 503/);
});
test("admin API: upsert log has details+hint", () => {
  match(adminRoute, /details:/);
  match(adminRoute, /hint:/);
});

// ── 2. Public settings whitelist ─────────────────────────────────────────────
test("public: twoFA not in ALLOWED_KEYS", () => { doesNotMatch(publicRoute, /"twoFA"/); });
test("public: session not in ALLOWED_KEYS", () => { doesNotMatch(publicRoute, /"session"/); });
test("public: storeName in ALLOWED_KEYS", () => { match(publicRoute, /"storeName"/); });
test("public: email in ALLOWED_KEYS", () => { match(publicRoute, /"email"/); });

// ── 3. settings-loader.ts ─────────────────────────────────────────────────
test("loader: no twoFA", () => { doesNotMatch(loader, /twoFA/); });
test("loader: no session", () => { doesNotMatch(loader, /session/); });
test("loader: storeName default", () => { match(loader, /storeName:"AFA STORE"/); });

// ── 4. layout.tsx themeColor ─────────────────────────────────────────────────
test("layout: generateViewport async", () => {
  match(layout, /export async function generateViewport/);
  match(layout, /settings\.themeColor/);
});
test("layout: themeColor hex validated", () => { match(layout, /0-9a-fA-F/); });
test("layout: themeColor fallback #123524", () => { match(layout, /#123524/); });
test("layout: storeName in metadata", () => { match(layout, /settings\.storeName/); });

// ── 5. page.tsx ───────────────────────────────────────────────────────────────
test("page: fetches storeName and logo", () => {
  match(homePage, /keys=homeBanner,whatsapp,storeName,logo/);
});
test("page: uses homeLogo fallback", () => {
  match(homePage, /homeLogo.*AFA LOGO/);
});
test("page: uses storeName fallback", () => {
  match(homePage, /storeName.*"AFA STORE"/);
});
test("page: passes whatsapp to CustomOrderCta", () => {
  match(homePage, /CustomOrderCta whatsapp=\{whatsappSetting/);
});
test("page: buyNow routes to cart using requireAuth (WhatsApp removed from buyNow)", () => {
  // buyNow now adds to cart and navigates; whatsappSetting is still used by contact CTAs
  doesNotMatch(homePage, /buildWhatsAppOrderUrl.*whatsappSetting/);
  match(homePage, /requireAuth\("\/cart", "cart"\)/);
  match(homePage, /router\.push\("\/cart"\)/);
});

// ── 6. whatsapp-order.ts ──────────────────────────────────────────────────────
test("whatsapp-order: optional phoneNumber", () => {
  match(waLib, /phoneNumber\?: string/);
});
test("whatsapp-order: AFA_STORE_WHATSAPP_NUMBER fallback", () => {
  match(waLib, /AFA_STORE_WHATSAPP_NUMBER/);
});

// ── 7. custom-order-cta.tsx ───────────────────────────────────────────────────
test("custom-cta: whatsapp prop", () => { match(customCta, /whatsapp\?: string/); });
test("custom-cta: waNumber in URL", () => { match(customCta, /wa\.me\/\$\{waNumber\}/); });
test("custom-cta: WHATSAPP_FALLBACK used", () => {
  match(customCta, /WHATSAPP_FALLBACK/);
  doesNotMatch(customCta, /const WHATSAPP_NUMBER\s*=/);
});

// ── 8. premium-footer.tsx ─────────────────────────────────────────────────────
test("footer: email in type", () => { match(footer, /email: string/); });
test("footer: email fetched", () => { match(footer, /"email"/); });
test("footer: email as mailto", () => { match(footer, /mailto:/); });
test("footer: address with MapPin", () => {
  match(footer, /MapPin/);
  match(footer, /st\.address/);
});

// ── 9. extractSettingsStoragePath ─────────────────────────────────────────────
test("extractSettingsStoragePath: strips bucket prefix", () => {
  // New regex: captures path AFTER the bucket "settings/"
  match(imageUploader, /public\/settings\//);
  // Old (wrong) pattern that included bucket in capture group must be gone
  doesNotMatch(imageUploader, /\(settings\\\//);
});

// ── 10. AdminAdvancedPanels placeholder wording ───────────────────────────────
test("admin panels: Belum tersedia wording", () => {
  match(advPanels, /Belum tersedia di versi ini/);
  doesNotMatch(advPanels, /diproses melalui auth Supabase/);
  doesNotMatch(advPanels, /membutuhkan service role/);
});

// ── 11. image DELETE regex ────────────────────────────────────────────────────
test("settings image DELETE: regex has character class with hyphen", () => {
  match(imageRoute, /\[a-zA-Z0-9/);
});

// ── 12. JSONB normalisation ───────────────────────────────────────────────────
test("admin GET: unwraps JSONB value.value", () => {
  match(adminRoute, /"value" in row\.value/);
});
test("admin PATCH: writes value: { value } wrapper", () => {
  match(adminRoute, /value: \{ value \}/);
});

// ── 13. manifest.ts is synchronous ───────────────────────────────────────────
test("manifest: sync function", () => {
  const manifest = read("src/app/manifest.ts");
  doesNotMatch(manifest, /async function manifest/);
  match(manifest, /name: "AFA STORE"/);
});

