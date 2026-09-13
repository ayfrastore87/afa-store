import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const cartRoute = read("../src/app/api/cart/route.ts");
const orderRoute = read("../src/app/api/checkout/order/route.ts");
const serviceClient = read("../src/lib/supabase-admin.ts");

test("cart route uses the server-only service-role client and never falls back to the anon key", () => {
    assert.match(cartRoute, /createSupabaseServiceClient/);
    assert.doesNotMatch(cartRoute, /SERVICE_ROLE_KEY\s*\|\|\s*NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.doesNotMatch(cartRoute, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.doesNotMatch(cartRoute, /createClient\(/);
});

test("checkout order route shares the same strict service-role cart cleanup client", () => {
    assert.match(orderRoute, /createSupabaseServiceClient/);
    assert.doesNotMatch(orderRoute, /SERVICE_ROLE_KEY\s*\|\|\s*NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.doesNotMatch(orderRoute, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.doesNotMatch(orderRoute, /createClient\(/);
});

test("service client requires SUPABASE_SERVICE_ROLE_KEY with no anon fallback and fails closed", () => {
    assert.match(serviceClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(serviceClient, /SERVICE_ROLE_KEY\s*\|\|\s*NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.doesNotMatch(serviceClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(serviceClient, /hasServiceRoleKey: Boolean\(serviceRoleKey\)/);
    assert.match(serviceClient, /throw new Error/);
});

test("service role stays server-only and is never exposed to the client bundle", () => {
    assert.match(serviceClient, /^import "server-only";/);
    assert.doesNotMatch(serviceClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});

test("cart keeps unauthenticated 401, authenticated user.id writes, and safe structured logging", () => {
    assert.match(cartRoute, /if \(!user\) return unauthenticatedCartResponse\(\)/);
    assert.match(cartRoute, /getCurrentUser\(\)/);
    assert.match(cartRoute, /userId: user\.id/);
    assert.match(cartRoute, /console\.error\("\[api\/cart\]"/);
    assert.doesNotMatch(cartRoute, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(cartRoute, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});
