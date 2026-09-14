import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// User-facing error hardening — regression tests.
// Verifies the UI never renders raw JSON, stack traces, HTTP codes, or
// Supabase/Prisma/system diagnostics; it shows concise Bahasa Indonesia instead.
// Static assertions only (no running Supabase / database).

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const helper = read("../src/lib/user-facing-error.ts");
const loginRoute = read("../src/app/api/auth/login/route.ts");
const authForms = read("../src/components/account/auth-forms.tsx");
const apiFetch = read("../src/lib/api-fetch.ts");
const adminLoginForm = read("../src/components/admin/LoginForm.tsx");
const passwordRoute = read("../src/app/api/account/password/route.ts");
const testimonialsRoute = read("../src/app/api/testimonials/route.ts");
const cartContext = read("../src/context/cart-context.tsx");
const accountDashboard = read("../src/components/account/account-dashboard.tsx");
const adminDashboard = read("../src/components/admin/AdminDashboard.tsx");
const kasirPos = read("../src/components/admin/kasir/KasirPOS.tsx");
const productDetailCta = read("../src/components/product-detail-cta.tsx");
const checkoutOrderRoute = read("../src/app/api/checkout/order/route.ts");

test("shared helper exposes a sanitized fallback and never echoes technical fields", () => {
    assert.match(helper, /USER_FACING_FALLBACK\s*=\s*"Terjadi kendala/);
    assert.match(helper, /export function safeApiMessage/);
    assert.match(helper, /export function parseSafeBody/);
    assert.match(helper, /export function getUserFacingMessage/);
    assert.match(helper, /export function isSafeUserMessage/);
    // Only allowlisted JSON keys can produce a message.
    assert.match(helper, /ALLOWED_MESSAGE_KEYS/);
    // Technical markers must be filtered out.
    assert.match(helper, /prisma\|postgres\|postgrest\|supabase/);
    // Never expose an arbitrary `stack`/`code`/`details` field.
    assert.doesNotMatch(helper, /record\.stack|record\.code|record\.details|record\.query/);
});

test("customer login route sanitizes provider failures and hides detail", () => {
    // The only response fields are `message` and internal `redirectTo`; the raw
    // Supabase error is logged server-side but never serialised to the client.
    assert.doesNotMatch(loginRoute, /\{ message: error\.message \}|return NextResponse\.json\(error/);
    assert.doesNotMatch(loginRoute, /error\?\.message.*NextResponse|JSON\.stringify\(error\.message\)/);
    assert.doesNotMatch(loginRoute, /stack:|error\?\.stack/);
    // Auth separation message stays clean and points to the admin portal.
    assert.match(loginRoute, /Akun ini adalah akun admin/);
    assert.match(loginRoute, /redirectTo: "\/admin\/login"/);
    assert.match(loginRoute, /Login gagal\. Periksa email dan password Anda\./);
});

test("customer auth form renders only sanitized message, never raw JSON or redirectTo", () => {
    // Reads the body via the safe parser instead of the raw-text thrower.
    assert.match(authForms, /parseSafeBody\(await response\.text\(\)\)/);
    assert.match(authForms, /safeApiMessage\(data\)/);
    // redirectTo is consumed ONLY by the router, never rendered as text.
    assert.match(authForms, /router\.replace\(target\)/);
    assert.doesNotMatch(authForms, /setError\(data\.redirectTo\)|message:\s*data\.redirectTo/);
    // No raw JSON / stack / technical fallthrough in the catch path.
    assert.doesNotMatch(authForms, /throw new Error\(response\.status\)/);
    assert.doesNotMatch(authForms, /error\.stack|JSON\.stringify\(response/);
});

test("api-fetch no longer throws the raw response body", () => {
    assert.match(apiFetch, /safeApiMessage\(parseSafeBody\(text\)\)/);
    assert.doesNotMatch(apiFetch, /throw new Error\(text\)/);
    assert.doesNotMatch(apiFetch, /"API returned HTML instead of JSON:"/);
});

test("admin login and kasir surfaces sanitize thrown errors", () => {
    assert.match(adminLoginForm, /getUserFacingMessage\(error/);
    assert.doesNotMatch(adminLoginForm, /setToast\(error\.message/);
    assert.match(kasirPos, /getUserFacingMessage\(error/);
    assert.doesNotMatch(kasirPos, /error instanceof Error \? error\.message/);
});

test("server routes stop leaking Supabase error messages to clients", () => {
    // account/password
    assert.doesNotMatch(passwordRoute, /message: error\.message/);
    assert.match(passwordRoute, /Gagal mengubah password/);
    // testimonials (public)
    assert.doesNotMatch(testimonialsRoute, /message: error\.message/);
    assert.match(testimonialsRoute, /logServerError/);
});

test("cart and account consumers sanitize API payloads", () => {
    assert.match(cartContext, /safeApiMessage\(body\)/);
    assert.match(cartContext, /getUserFacingMessage\(error/);
    assert.doesNotMatch(cartContext, /error instanceof Error \? error\.message/);
    assert.match(accountDashboard, /safeApiMessage\(data\)/);
    assert.doesNotMatch(accountDashboard, /setErr\(data\.message/);
});

test("admin dashboard sanitizes payload-driven toasts", () => {
    assert.match(adminDashboard, /safeApiMessage\(data\)/);
    assert.match(adminDashboard, /getUserFacingMessage/);
    assert.doesNotMatch(adminDashboard, /toast\(data\.message/);
});

test("product detail buy-now sanitizes the API error field instead of echoing it", () => {
    // The buy-now response body `error` is consumed only through safeApiMessage.
    assert.match(productDetailCta, /safeApiMessage\(data\)/);
    assert.doesNotMatch(productDetailCta, /data\?\.error/);
});

test("checkout order route returns concise Bahasa Indonesia instead of English/technical detail", () => {
    // Internal idempotency protection and server diagnostics legitimately use
    // technical terms; those must remain in place and never reach the browser.
    assert.match(checkoutOrderRoute, /Idempotency-Key/);
    assert.match(checkoutOrderRoute, /checkoutIdempotency/);
    assert.match(checkoutOrderRoute, /Prisma\.PrismaClientKnownRequestError/);
    // The old English user-facing phrases are fully replaced by Bahasa Indonesia.
    assert.doesNotMatch(checkoutOrderRoute, /temporarily unavailable|being processed/);
    assert.match(checkoutOrderRoute, /Permintaan checkout tidak valid/);
    assert.match(checkoutOrderRoute, /Checkout sedang dalam pemeliharaan/);
    assert.match(checkoutOrderRoute, /Pesanan sedang diproses/);
    // Raw error objects are never serialised into a client response.
    assert.doesNotMatch(checkoutOrderRoute, /NextResponse\.json\(error/);
    assert.doesNotMatch(checkoutOrderRoute, /JSON\.stringify\(error/);
});

test("auth separation is preserved under the hardened login", () => {
    assert.match(loginRoute, /user\.role === "admin"/);
    assert.match(loginRoute, /supabase\.auth\.signOut\(\)/);
    assert.match(loginRoute, /status: 403/);
    // Mitra authority stays on afa_mitra_session (untouched).
    const mitraAuth = read("../src/lib/mitra-auth.ts");
    assert.match(mitraAuth, /afa_mitra_session/);
    assert.doesNotMatch(mitraAuth, /getCurrentCustomer/);
});
