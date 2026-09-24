import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    KASIR_HOME_PATH,
    KASIR_LOGIN_PATH,
    isActiveKasirIdentity,
    isKasirLoginPath,
    isProtectedKasirPath,
    resolveKasirRoute,
} from "../src/lib/kasir-access.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

const proxy = read("../src/proxy.ts");
const auth = read("../src/lib/auth.ts");
const serverAuth = read("../src/lib/server-auth.ts");
const loginPage = read("../src/app/kasir/login/page.tsx");
const protectedLayout = read("../src/app/kasir/(protected)/layout.tsx");
const adminLayout = read("../src/app/admin/(protected)/layout.tsx");
const adminLoginPage = read("../src/app/admin/login/page.tsx");

const anonymous = null;
const activeCashier = { role: "cashier", isActive: true };
const activeAdmin = { role: "admin", isActive: true };
const customer = { role: "customer", isActive: true };
const partner = { role: "partner", isActive: true };
const inactiveCashier = { role: "cashier", isActive: false };
const inactiveAdmin = { role: "admin", isActive: false };

const PROTECTED_KASIR_PATHS = ["/kasir", "/kasir/", "/kasir/transaksi", "/kasir/pesanan", "/kasir/riwayat", "/kasir/laporan", "/kasir/pengaturan"];

test("1. unauthenticated /kasir/login renders login", () => {
    assert.deepEqual(resolveKasirRoute("/kasir/login", anonymous), { type: "render" });
    assert.deepEqual(resolveKasirRoute("/kasir/login/", anonymous), { type: "render" });
    assert.equal(isProtectedKasirPath("/kasir/login"), false);
    assert.equal(isKasirLoginPath("/kasir/login"), true);
});

test("2. unauthenticated /kasir -> /kasir/login (once)", () => {
    for (const path of PROTECTED_KASIR_PATHS) {
        assert.deepEqual(resolveKasirRoute(path, anonymous), { type: "redirect", to: KASIR_LOGIN_PATH }, path);
        assert.equal(isProtectedKasirPath(path), true, path);
    }
});

test("3. active cashier /kasir/login -> /kasir", () => {
    assert.deepEqual(resolveKasirRoute("/kasir/login", activeCashier), { type: "redirect", to: KASIR_HOME_PATH });
    assert.deepEqual(resolveKasirRoute("/kasir/login", activeAdmin), { type: "redirect", to: KASIR_HOME_PATH });
});

test("4. active cashier /kasir allowed", () => {
    for (const path of PROTECTED_KASIR_PATHS) {
        assert.deepEqual(resolveKasirRoute(path, activeCashier), { type: "render" }, path);
    }
    assert.equal(isActiveKasirIdentity(activeCashier), true);
});

test("5. active admin /kasir allowed", () => {
    for (const path of PROTECTED_KASIR_PATHS) {
        assert.deepEqual(resolveKasirRoute(path, activeAdmin), { type: "render" }, path);
    }
    assert.equal(isActiveKasirIdentity(activeAdmin), true);
});

test("6. customer and partner /kasir denied", () => {
    for (const identity of [customer, partner]) {
        assert.equal(isActiveKasirIdentity(identity), false, identity.role);
        for (const path of PROTECTED_KASIR_PATHS) {
            assert.deepEqual(resolveKasirRoute(path, identity), { type: "redirect", to: KASIR_LOGIN_PATH }, `${identity.role} ${path}`);
        }
    }
});

test("7. customer (stale/non-cashier Supabase session) visiting /kasir/login does NOT cause a redirect loop", () => {
    // The proxy only checks for a Supabase user, so a customer session passes
    // it on /kasir. The server guard then denies and sends them to /kasir/login,
    // where the login page MUST render (never redirect) for a non-cashier.
    for (const identity of [customer, partner, inactiveCashier, inactiveAdmin]) {
        assert.deepEqual(resolveKasirRoute("/kasir/login", identity), { type: "render" }, identity.role);
        const first = resolveKasirRoute("/kasir", identity);
        assert.equal(first.type, "redirect");
        const second = resolveKasirRoute(first.to, identity);
        assert.deepEqual(second, { type: "render" }, `${identity.role} must settle at ${first.to}`);
    }
});

test("8. inactive cashier / inactive admin denied", () => {
    for (const identity of [inactiveCashier, inactiveAdmin]) {
        assert.equal(isActiveKasirIdentity(identity), false);
        assert.deepEqual(resolveKasirRoute("/kasir", identity), { type: "redirect", to: KASIR_LOGIN_PATH });
        assert.deepEqual(resolveKasirRoute("/kasir/login", identity), { type: "render" });
    }
    // getCurrentCashier / getCurrentAdmin both keep the isActive gate server-side.
    assert.match(serverAuth, /if \(!user \|\| user\.isActive === false\) return null;\s*return user\.role === "admin" \|\| user\.role === "cashier" \? user : null;/);
    assert.match(serverAuth, /user\?\.role === "admin" && user\.isActive !== false/);
});

test("9. /admin guard remains admin-only", () => {
    assert.match(adminLayout, /await requireAdmin\(\);/);
    assert.doesNotMatch(adminLayout, /requireCashier|getCurrentCashier/);
    assert.match(auth, /if \(!admin \|\| admin\.role !== "admin" \|\| admin\.isActive === false\) return null;/);
    assert.match(auth, /if \(!admin\) \{\s*redirect\("\/admin\/login"\);/);
    assert.match(adminLoginPage, /getCurrentAdmin\(\)/);
    assert.match(adminLoginPage, /if \(admin\) redirect\("\/admin"\);/);
    // A cashier is never promoted to admin by the shared kasir policy.
    assert.match(serverAuth, /export async function getCurrentAdmin\(\) \{\s*const user = await getCurrentUser\(\);\s*return user\?\.role === "admin"/);
    assert.match(proxy, /const protectedAdminRoute = pathname\.startsWith\("\/admin"\) && pathname !== "\/admin\/login";/);
});

test("10. no redirect target redirects immediately back to its source", () => {
    const identities = { anonymous, activeCashier, activeAdmin, customer, partner, inactiveCashier, inactiveAdmin };
    const paths = [...PROTECTED_KASIR_PATHS, "/kasir/login", "/kasir/login/"];
    for (const [name, identity] of Object.entries(identities)) {
        for (const source of paths) {
            const first = resolveKasirRoute(source, identity);
            if (first.type !== "redirect") continue;
            assert.notEqual(first.to, source, `${name}: ${source} must not redirect to itself`);
            const second = resolveKasirRoute(first.to, identity);
            assert.equal(second.type, "render", `${name}: ${source} -> ${first.to} -> ${JSON.stringify(second)} would loop`);
        }
    }
});

test("structure: /kasir/login lives outside the protected route group and is never wrapped by requireCashier", () => {
    // Root cause of ERR_TOO_MANY_REDIRECTS: a root src/app/kasir/layout.tsx that
    // called requireCashier() also wrapped /kasir/login, so a non-cashier was
    // redirected /kasir/login -> /kasir/login forever. The guard now lives in
    // the (protected) route group only.
    assert.equal(exists("../src/app/kasir/layout.tsx"), false, "no root kasir layout may guard /kasir/login");
    assert.equal(exists("../src/app/kasir/(protected)/layout.tsx"), true);
    for (const page of ["page.tsx", "transaksi/page.tsx", "pesanan/page.tsx", "riwayat/page.tsx", "laporan/page.tsx", "pengaturan/page.tsx"]) {
        assert.equal(exists(`../src/app/kasir/(protected)/${page}`), true, page);
        assert.equal(exists(`../src/app/kasir/${page}`), false, `${page} must not exist outside (protected)`);
    }
    assert.equal(exists("../src/app/kasir/login/page.tsx"), true);
    assert.match(protectedLayout, /await requireCashier\(\);/);
    assert.match(auth, /if \(!cashier\) redirect\(KASIR_LOGIN_PATH\);/);
    // The login page only ever redirects an ACTIVE cashier/admin, to /kasir.
    assert.match(loginPage, /resolveKasirRoute\(KASIR_LOGIN_PATH, await getCurrentCashier\(\)\)/);
    assert.doesNotMatch(loginPage, /requireCashier/);
    assert.match(loginPage, /export const dynamic = "force-dynamic";/);
});

test("structure: proxy excludes /kasir/login from the protected kasir redirect", () => {
    assert.match(proxy, /const protectedKasirRoute = isProtectedKasirPath\(pathname\);/);
    assert.match(proxy, /protectedKasirRoute \? KASIR_LOGIN_PATH/);
    assert.match(proxy, /supabase\.auth\.getUser\(\)/);
    // Supabase SSR cookie refresh is preserved for every matched request.
    assert.match(proxy, /response\.cookies\.set\(name, value, options\)/);
    // Customer + admin gating untouched.
    assert.match(proxy, /\["\/account", "\/cart", "\/checkout"\]/);
    assert.match(proxy, /protectedAdminRoute \? "\/admin\/login" : "\/login"/);
});