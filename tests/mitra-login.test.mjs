import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// AFA MITRA — /mitra/login portal tests (Tahap 3 presentation).
// Asserts the login portal reuses the existing AFA STORE auth (POSTs to the
// existing /api/auth/login route), routes authenticated users by Partner status
// before rendering, never creates a Partner record, and guards the post-login
// `next` redirect against open-redirect / self-loop attacks.

function read(rel) {
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
}

const page = read("../src/app/mitra/login/page.tsx");
const form = read("../src/components/mitra/mitra-login.tsx");

test("login page redirects authenticated users by Partner status", () => {
    // Reuses resolveMitra() so status logic lives in one place.
    assert.ok(page.includes("resolveMitra()"));
    assert.ok(page.includes('redirect("/mitra/dashboard")'));
    assert.ok(page.includes('redirect("/mitra/daftar")'));
    assert.ok(page.includes('redirect("/mitra/pengajuan")'));
    // All non-"unauthenticated" statuses redirect; the form only renders otherwise.
    assert.ok(page.includes("<MitraLogin />"));
    assert.ok(page.includes('dynamic = "force-dynamic"'));
});

test("login component reuses the existing AFA STORE login endpoint", () => {
    assert.ok(form.includes('fetch("/api/auth/login"'));
    assert.ok(form.includes('method: "POST"'));
    assert.ok(form.includes("identifier: email"));
    // Supabase SSR cookies are the session authority; no manual token storage.
    assert.doesNotMatch(form, /localStorage\.(setItem|getItem)/);
    assert.doesNotMatch(form, /setCookie|document\.cookie/);
});

test("login component maps failure statuses to human messages", () => {
    assert.ok(form.includes('status === 401'));
    assert.ok(form.includes("Email atau password tidak sesuai."));
    assert.ok(form.includes('status === 429'));
    assert.ok(form.includes("Terlalu banyak percobaan login"));
    assert.ok(form.includes('status >= 500'));
});

test("login component never creates a Partner record", () => {
    assert.doesNotMatch(form, /partner\s*\.\s*(create|upsert)/);
    assert.doesNotMatch(form, /fetch\("\/api\/account\/partner\/apply"/);
    assert.doesNotMatch(form, /new PrismaClient/);
});

test("login component guards the `next` redirect against open redirects", () => {
    // safeNext only allows an internal absolute path, not protocol-relative,
    // not backslash, and never looping back onto a login page.
    assert.ok(form.includes('next.startsWith("/")'));
    assert.ok(form.includes('!next.startsWith("//")'));
    assert.ok(form.includes('!next.includes("\\\\")'));
    assert.ok(form.includes('!next.startsWith("/login")'));
    assert.ok(form.includes('!next.startsWith("/mitra/login")'));
    assert.ok(form.includes('"/mitra/dashboard"'));
});
