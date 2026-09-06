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
    assert.match(route, /const status = \/already\|registered\|exists\/i\.test\(error\.message\) \? 409 : 400/);
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
    assert.doesNotMatch(route, /console\.error\([^)]*error\.message/);
});

test("public-user create diagnostics are allowlisted and redact sensitive values", () => {
    const auth = read("../src/lib/auth.ts");
    const diagnostic = auth.slice(auth.indexOf("function safeProviderText"), auth.indexOf("function getJwtSecret"));
    for (const field of ["code", "message", "details", "hint", "status", "name"]) {
        assert.match(diagnostic, new RegExp(`${field}:`));
    }
    assert.match(auth, /providerDiagnostic\(createError\)/);
    assert.match(diagnostic, /redacted-email/);
    assert.match(diagnostic, /redacted-url/);
    assert.match(diagnostic, /redacted-id/);
    assert.match(diagnostic, /redacted/);
    assert.doesNotMatch(diagnostic, /source\.(email|id|auth_id|phone|user_id|auth_id)/i);
    assert.doesNotMatch(diagnostic, /request\.body|JSON\.stringify\(source\)/i);
    assert.doesNotMatch(auth, /console\.error\("Supabase ensurePublicUser create failed", createError\)/);
});

test("Parcel hero uses only the existing local asset", () => {
    const home = read("../src/app/page.tsx");
    assert.match(home, /parcel:\s*\{[\s\S]*?image: "\/products\/parcel\.png"/);
    assert.match(home, /function HeroProduct[\s\S]*?setImageSrc\("\/products\/parcel\.png"\)/);
    assert.doesNotMatch(home, /parcel:\s*\{[\s\S]*?image: "(?:https?:|\/products\/Parcel 1\.png|\/window\.svg)/);
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