import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const login = read("../src/app/api/auth/login/route.ts");
const form = read("../src/components/account/auth-forms.tsx");
const browserClient = read("../src/lib/supabase.ts");

test("remember me checkbox is read and forwarded as a boolean", () => {
    assert.match(form, /<input type="checkbox"/);
    assert.match(form, /remember: form\.remember === "on"/);
    assert.match(login, /remember\?: boolean/);
    assert.match(login, /const \{ identifier, password \} = body/);
});

test("login never persists passwords or tokens manually", () => {
    assert.doesNotMatch(login, /localStorage|sessionStorage|document\.cookie/);
    assert.doesNotMatch(login, /refresh_token|access_token/);
    assert.doesNotMatch(login, /signSession|setAuthCookie/);
    assert.doesNotMatch(login + form, /localStorage\.setItem|sessionStorage\.setItem/);
});

test("browser Supabase client keeps the SSR cookie session, not localStorage", () => {
    assert.match(browserClient, /createBrowserClient/);
    assert.doesNotMatch(browserClient, /localStorage|sessionStorage/);
});

test("Supabase session stays authoritative and login redirect default stays /", () => {
    assert.match(login, /supabase\.auth\.signInWithPassword\(\{ email, password \}\)/);
    assert.match(login, /clearAuthCookie\(response\)/);
    assert.match(form, /next !== "\/login"/);
    assert.match(form, /!next\.startsWith\("\/account"\)/);
    assert.match(form, /: "\/"/);
});
