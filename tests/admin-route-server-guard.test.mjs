import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Phase 2 — server-side guard for every /admin route except /admin/login.
// Static, read-only assertions: the route-group layout under /admin/(protected)
// is the single authoritative guard, and /admin/login stays public while all
// admin APIs remain server-side role-protected.

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const protectedLayout = read("../src/app/admin/(protected)/layout.tsx");
const protectedPage = read("../src/app/admin/(protected)/page.tsx");
const loginPage = read("../src/app/admin/login/page.tsx");
const authLib = read("../src/lib/auth.ts");
const serverAuth = read("../src/lib/server-auth.ts");
const mitraAuth = read("../src/lib/mitra-auth.ts");
const accountPage = read("../src/app/account/page.tsx");

const adminApiRoutes = [
    "src/app/api/admin/customers/route.ts",
    "src/app/api/admin/partners/route.ts",
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/testimonials/route.ts",
    "src/app/api/admin/sales/report/route.ts",
    "src/app/api/admin/products/image/route.ts",
];

test("central (protected) layout calls requireAdmin as the authoritative guard", () => {
    assert.match(protectedLayout, /requireAdmin\(\)/);
    assert.match(protectedLayout, /export default async function/);
    assert.doesNotMatch(protectedLayout, /"use client"/);
    assert.doesNotMatch(protectedLayout, /useEffect/);
});

test("requireAdmin redirects to /admin/login when getCurrentAdmin returns null", () => {
    assert.match(authLib, /export async function requireAdmin/);
    assert.match(authLib, /redirect\("\/admin\/login"\)/);
});

test("unauthenticated/customer/mitra/inactive never satisfy getCurrentAdmin", () => {
    // Admin authority derives from the application user whose role is "admin".
    assert.match(serverAuth, /export async function getCurrentAdmin/);
    assert.match(serverAuth, /user\?\.role === "admin"/);
    assert.match(serverAuth, /user\.isActive !== false/);
    // getCurrentUser never reads the mitra cookie — so mitra-only sessions fail.
    assert.match(serverAuth, /getSupabaseUser\(\)/);
    assert.doesNotMatch(serverAuth, /afa_mitra_session/);
});

test("mitra cookie can never authorize admin", () => {
    assert.match(mitraAuth, /afa_mitra_session/);
    assert.doesNotMatch(mitraAuth, /requireAdmin|getCurrentAdmin|role === "admin"/);
});

test("dashboard server page only renders the client UI (guard lives in layout)", () => {
    assert.match(protectedPage, /AdminDashboard/);
    assert.doesNotMatch(protectedPage, /"use client"/);
});

test("/admin/login stays public (no requireAdmin, optional redirect-if-admin)", () => {
    assert.doesNotMatch(loginPage, /requireAdmin\(\)/);
    assert.match(loginPage, /getCurrentAdmin\(\)/);
    assert.match(loginPage, /redirect\("\/admin"\)/);
});

test("protected subroutes resolve through the guarded (protected) group", () => {
    const products = read("../src/app/admin/(protected)/products/page.tsx");
    const akun = read("../src/app/admin/(protected)/akun/page.tsx");
    const stok = read("../src/app/admin/(protected)/stok/page.tsx");
    // Fixed re-exports now point at the sibling server page, not the customer home.
    assert.match(products, /from "\.\.\/page"/);
    assert.match(akun, /from "\.\.\/page"/);
    assert.match(stok, /from "\.\.\/page"/);
    assert.doesNotMatch(akun, /"\.\.\/\.\.\/page"/);
});

test("admin APIs retain server-side getCurrentAdmin protection", () => {
    for (const path of adminApiRoutes) {
        const source = read(`../${path}`);
        assert.match(source, /getCurrentAdmin\(\)/, `${path} must guard with getCurrentAdmin`);
        assert.doesNotMatch(source, /afa_mitra_session/, `${path} must not trust the mitra cookie`);
    }
});

test("phase 1 customer boundary remains intact", () => {
    assert.match(serverAuth, /export async function getCurrentCustomer/);
    assert.match(serverAuth, /user\.role !== "customer"/);
    assert.match(accountPage, /getCurrentCustomer\(\)/);
});
