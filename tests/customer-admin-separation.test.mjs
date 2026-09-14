import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Phase 1 — strict customer vs admin separation.
// Static, read-only assertions. They verify the boundary logic in source without
// needing a running Supabase / database.

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const serverAuth = read("../src/lib/server-auth.ts");
const accountPage = read("../src/app/account/page.tsx");
const mitraPage = read("../src/app/account/mitra/page.tsx");
const meRoute = read("../src/app/api/auth/me/route.ts");
const loginRoute = read("../src/app/api/auth/login/route.ts");
const authForms = read("../src/components/account/auth-forms.tsx");
const adminLoginForm = read("../src/components/admin/LoginForm.tsx");
const mitraAuth = read("../src/lib/mitra-auth.ts");

test("getCurrentCustomer rejects admin and non-customer roles", () => {
    assert.match(serverAuth, /export async function getCurrentCustomer/);
    assert.match(serverAuth, /user\.role !== "customer"/);
    assert.match(serverAuth, /user\.isActive === false/);
    // Uses the existing getCurrentUser() as its session source.
    assert.match(serverAuth, /const user = await getCurrentUser\(\)/);
});

test("getCurrentCustomer accepts an active customer", () => {
    assert.match(serverAuth, /return user;/);
});

test("getCurrentAdmin is unchanged (admin still uses Supabase auth)", () => {
    assert.match(serverAuth, /user\?\.role === "admin"/);
    assert.match(serverAuth, /user\.isActive !== false/);
});

test("/account allows customer only, admin redirects to /admin", () => {
    assert.match(accountPage, /getCurrentCustomer\(\)/);
    assert.match(accountPage, /user\.role === "admin"/);
    assert.match(accountPage, /redirect\("\/admin"\)/);
    assert.match(accountPage, /redirect\("\/login\?next=\/account"\)/);
});

test("/account/mitra enforces the same customer boundary", () => {
    assert.match(mitraPage, /getCurrentCustomer\(\)/);
    assert.match(mitraPage, /user\.role === "admin"/);
    assert.match(mitraPage, /redirect\("\/admin"\)/);
    assert.match(mitraPage, /redirect\("\/login\?next=\/account\/mitra"\)/);
});

test("/api/auth/me is customer-only and never exposes admin as customer", () => {
    assert.match(meRoute, /getCurrentCustomer\(\)/);
    assert.doesNotMatch(meRoute, /getCurrentUser\(\)/);
    assert.match(meRoute, /status: 401/);
});

test("customer login refuses an admin row and never downgrades/duplicates it", () => {
    assert.match(loginRoute, /user\.role === "admin"/);
    assert.match(loginRoute, /supabase\.auth\.signOut\(\)/);
    assert.match(loginRoute, /redirectTo: "\/admin\/login"/);
    assert.match(loginRoute, /status: 403/);
    // ensurePublicUser still returns the existing row as-is; no role mutation here.
    assert.doesNotMatch(loginRoute, /\.update\(\{[^}]*role|role: "customer"/);
});

test("customer login UI follows the admin redirect hint safely", () => {
    assert.match(authForms, /redirectTo/);
    assert.match(authForms, /target\.startsWith\("\/"\)/);
    assert.match(authForms, /!target\.startsWith\("\/\/"\)/);
    assert.match(authForms, /router\.replace\(target\)/);
});

test("admin login flow remains intact", () => {
    assert.match(adminLoginForm, /supabase\.auth\.signInWithPassword/);
    assert.match(adminLoginForm, /admin\.role !== "admin"/);
    assert.match(adminLoginForm, /router\.replace\("\/admin"\)/);
});

test("Mitra auth is untouched", () => {
    // Mitra authority stays afa_mitra_session, fully independent of customer auth.
    assert.match(mitraAuth, /afa_mitra_session/);
    assert.doesNotMatch(mitraAuth, /getCurrentCustomer/);
});
