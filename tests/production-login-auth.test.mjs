import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const login = read("../src/app/api/auth/login/route.ts");
const logout = read("../src/app/api/auth/logout/route.ts");
const me = read("../src/app/api/auth/me/route.ts");
const serverAuth = read("../src/lib/server-auth.ts");
const proxy = read("../src/proxy.ts");
const form = read("../src/components/account/auth-forms.tsx");

test("customer authentication uses Supabase session and auth_id mapping", () => {
    assert.match(login, /auth\.signInWithPassword\(\{ email, password \}\)/);
    assert.doesNotMatch(login, /signSession|setAuthCookie/);
    assert.match(serverAuth, /getSupabaseUser\(\)/);
    assert.match(serverAuth, /\$queryRaw/);
    assert.match(serverAuth, /WHERE auth_id = \$\{authUser\.id\}/);
    assert.match(serverAuth, /FROM public\.users/);
    assert.doesNotMatch(serverAuth, /getSession\(\)|session\.id/);
});

test("me and account consumers resolve the same active application user", () => {
    assert.match(me, /getCurrentUser.*@\/lib\/server-auth/);
    assert.match(me, /status: 401/);
    assert.match(serverAuth, /user\.isActive === false/);
    assert.match(serverAuth, /SELECT id, auth_id, name, email, phone, image, role/);
});

test("proxy gates protected routes with Supabase Auth only", () => {
    for (const route of ["/account", "/cart", "/checkout", "/admin"]) assert.match(proxy, new RegExp(`"${route}"`));
    assert.match(proxy, /supabase\.auth\.getUser\(\)/);
    assert.doesNotMatch(proxy, /verifyToken|AUTH_COOKIE|\.from\("users"\)/);
});

test("admin authorization remains server-side", () => {
    assert.match(serverAuth, /user\?\.role === "admin"/);
    assert.match(serverAuth, /user\.isActive !== false/);
});

test("login has safe status-specific errors and internal-only redirect", () => {
    for (const status of [401, 403, 429, 500]) assert.match(login + form, new RegExp(`status: ${status}|status === ${status}|status >= ${status}`));
    assert.match(form, /next\.startsWith\("\/"\) && !next\.startsWith\("\/\/"\)/);
    assert.match(form, /router\.replace\(destination\)/);
    assert.doesNotMatch(login, /\{ email, error: error\?\.message \}|stack:/);
});

test("logout terminates Supabase session and clears the legacy cookie", () => {
    assert.match(logout, /supabase\.auth\.signOut\(\)/);
    assert.match(logout, /clearAuthCookie\(response\)/);
});