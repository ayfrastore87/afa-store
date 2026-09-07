import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../src/app/api/auth/register/route.ts");
const authForm = read("../src/components/account/auth-forms.tsx");
const image = read("../src/components/product-image.tsx");
const config = read("../next.config.ts");

test("registration validates input and preserves public HTTP contract", () => {
    assert.match(route, /safeParse\(body\)/);
    assert.match(route, /status: 400/);
    assert.match(route, /password !== confirmPassword/);
    assert.match(route, /status: 409/);
    assert.match(route, /const status = isRateLimited \? 429 : isDuplicate \? 409 : 400/);
    assert.match(route, /email rate limit exceeded/);
    assert.match(route, /already\|registered\|exists/);
});

test("duplicate and rate-limit provider responses return before public-user creation", () => {
    const providerError = route.indexOf("if (error)");
    const providerReturn = route.indexOf("return NextResponse.json({ message }, { status });");
    const emptyIdentities = route.indexOf("authUser.identities?.length === 0");
    const duplicateReturn = route.indexOf('return NextResponse.json({ message: "Email sudah digunakan." }, { status: 409 });');
    const ensureUser = route.indexOf("ensurePublicUser(authUser, name)");

    assert.ok(providerError >= 0 && providerError < providerReturn);
    assert.ok(providerReturn < ensureUser);
    assert.ok(emptyIdentities >= 0 && emptyIdentities < duplicateReturn);
    assert.ok(duplicateReturn < ensureUser);
    assert.match(route, /error\.status === 429/);
    assert.match(route, /isRateLimited \? 429/);
});

test("auth form synchronously prevents duplicate register POST requests", () => {
    const guard = authForm.indexOf("if (authRequestInFlight.current) return;");
    const lock = authForm.indexOf("authRequestInFlight.current = true;");
    const request = authForm.indexOf("response = await fetch(endpoint");

    assert.match(authForm, /useRef\(false\)/);
    assert.ok(guard >= 0 && guard < lock);
    assert.ok(lock < request);
    assert.equal(authForm.match(/response = await fetch\(endpoint/g)?.length, 1);
    assert.doesNotMatch(authForm, /onClick=\{submit\}/);
});

test("registration catches provider and public-user failures without leaking secrets", () => {
    assert.match(route, /try \{/);
    assert.match(route, /ensurePublicUser\(authUser, name\)/);
    assert.match(route, /category: "unexpected_registration_failure"/);
    assert.match(route, /status: 500/);
    assert.doesNotMatch(route, /error\.message.*NextResponse|JSON\.stringify\(error\)/);
    assert.doesNotMatch(route, /password.*console\.|console\..*password|DATABASE_URL|SERVICE_ROLE_KEY/);
    assert.doesNotMatch(route, /console\.error\([^)]*error\.message/);
    assert.match(authForm, /console\.error\("Auth request failed", \{/);
    assert.doesNotMatch(authForm, /Login request failed|console\.error\("Supabase register error:", data\.message/);
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