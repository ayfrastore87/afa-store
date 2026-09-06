import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../src/app/api/auth/register/route.ts");
const image = read("../src/components/product-image.tsx");
const config = read("../next.config.ts");

test("registration validates input and preserves public HTTP contract", () => {
    assert.match(route, /safeParse\(body\)/);
    assert.match(route, /status: 400/);
    assert.match(route, /password !== confirmPassword/);
    assert.match(route, /status: 409/);
    assert.match(route, /email rate limit exceeded/);
    assert.match(route, /already\|registered\|exists/);
});

test("registration catches provider and public-user failures without leaking secrets", () => {
    assert.match(route, /try \{/);
    assert.match(route, /ensurePublicUser\(authUser, name\)/);
    assert.match(route, /category: "unexpected_registration_failure"/);
    assert.match(route, /status: 500/);
    assert.doesNotMatch(route, /error\.message.*NextResponse|JSON\.stringify\(error\)/);
    assert.doesNotMatch(route, /password.*console\.|console\..*password|DATABASE_URL|SERVICE_ROLE_KEY/);
});

test("product images validate local and HTTP sources before optimizer use", () => {
    assert.match(image, /FALLBACK_IMAGE = "\/products\/parcel\.png"/);
    assert.match(image, /new URL\(src\)/);
    assert.match(image, /url\.protocol === "http:" \|\| url\.protocol === "https:"/);
    assert.match(image, /catch \{/);
    assert.match(image, /setImageSrc\(FALLBACK_IMAGE\)/);
    assert.match(config, /hostname: "jaivvnxpbdiksuqzewdd\.supabase\.co"/);
    assert.match(config, /pathname: "\/storage\/v1\/object\/public\/products\/\*\*"/);
    assert.doesNotMatch(config, /hostname: "\*\*"/);
});