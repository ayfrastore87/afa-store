import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// AFA MITRA — Fase 2 standalone auth tests.
// Static assertions over lib/mitra-auth.ts and the /api/mitra/auth/* routes.
// No shell / DB / build is required; follows the same read-only pattern as the
// other mitra-*.test.mjs suites.

function read(rel) {
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
}

const gate = read("../src/lib/mitra-auth.ts");
const register = read("../src/app/api/mitra/auth/register/route.ts");
const login = read("../src/app/api/mitra/auth/login/route.ts");
const logout = read("../src/app/api/mitra/auth/logout/route.ts");
const me = read("../src/app/api/mitra/auth/me/route.ts");

test("1. cookie is afa_mitra_session and is distinct from the customer cookie", () => {
    assert.match(gate, /export const MITRA_COOKIE = "afa_mitra_session"/);
    assert.doesNotMatch(gate, /MITRA_COOKIE\s*=\s*"afa_session"/);
});

test("2. secret comes from MITRA_SESSION_SECRET and never falls back to the customer secret", () => {
    assert.match(gate, /process\.env\.MITRA_SESSION_SECRET/);
    assert.doesNotMatch(gate, /process\.env\.(JWT_SECRET|NEXTAUTH_SECRET)/);
    assert.doesNotMatch(gate, /afa-store-dev-secret/);
});

test("3. missing secret fails closed (returns null / throws)", () => {
    // getMitraSessionSecret returns null when unset; the reader returns null.
    assert.match(gate, /if \(!secret\) return null;/);
    // requireMitraSessionSecret throws instead of weakening auth silently.
    assert.match(gate, /MITRA_SESSION_SECRET is not configured\./);
    assert.match(gate, /throw new Error\(/);
});

test("4. session payload is accountId + partnerId (never a customer userId)", () => {
    assert.match(gate, /accountId: string;/);
    assert.match(gate, /partnerId: string;/);
    assert.doesNotMatch(gate, /MitraSessionPayload[\s\S]*userId/);
});

test("5. readMitraSession verifies with jose and validates both payload fields are strings", () => {
    assert.match(gate, /jwtVerify\(token, secret\)/);
    assert.match(gate, /typeof payload\.accountId !== "string"/);
    assert.match(gate, /typeof payload\.partnerId !== "string"/);
});

test("6. getCurrentMitraAccount looks up prisma.mitraAccount (not user) and enforces id/partnerId match", () => {
    assert.match(gate, /prisma\.mitraAccount\.findUnique/);
    assert.match(gate, /include: \{ partner: true \}/);
    assert.match(gate, /account\.id !== session\.accountId \|\| account\.partnerId !== session\.partnerId/);
    assert.doesNotMatch(gate, /getCurrentUser\(\)/);
});

test("7. getCurrentPartnerFromMitraSession requires isActive and ACTIVE partner status", () => {
    assert.match(gate, /account\.isActive === false/);
    assert.match(gate, /account\.partner\.status !== "ACTIVE"/);
});

test("8. resolveMitra maps statuses to route kinds and null session to unauthenticated", () => {
    assert.match(gate, /kind: "unauthenticated"/);
    assert.match(gate, /kind: "active"/);
    assert.match(gate, /kind: "suspended"/);
    assert.match(gate, /kind: "rejected"/);
    assert.match(gate, /return \{ kind: "pending", partner \}/);
});

test("9. requireActiveMitra redirects to login when unauthenticated and pengajuan when not ACTIVE", () => {
    assert.match(gate, /redirect\("\/mitra\/login"\)/);
    assert.match(gate, /redirect\("\/mitra\/pengajuan"\)/);
});

test("10. register creates a standalone Partner (userId: null) + MitraAccount, no customer User", () => {
    assert.match(register, /tx\.partner\.create/);
    assert.match(register, /userId: null/);
    assert.match(register, /tx\.mitraAccount\.create/);
    assert.doesNotMatch(register, /\.user\.create\(/);
    assert.doesNotMatch(register, /supabase/);
});

test("11. register signs the afa_mitra_session cookie", () => {
    assert.match(register, /createMitraSession\(created\.account\.id, created\.partner\.id/);
    assert.match(register, /response\.cookies\.set\(MITRA_COOKIE/);
});

test("12. login authenticates against prisma.mitraAccount by username OR email", () => {
    assert.match(login, /prisma\.mitraAccount\.findFirst/);
    assert.match(login, /OR: \[\{ username: identifier \}, \{ email: identifier \}\]/);
    assert.doesNotMatch(login, /supabase/);
    assert.doesNotMatch(login, /getCurrentUser\(\)/);
});

test("13. login is anti-enumeration and blocks inactive accounts", () => {
    assert.match(login, /INVALID_CREDENTIALS/);
    assert.match(login, /account\.isActive === false/);
});

test("14. me route never exposes passwordHash or customer User data", () => {
    assert.match(me, /getCurrentMitraAccount\(\)/);
    assert.doesNotMatch(me, /account\.passwordHash/);
    assert.doesNotMatch(me, /getCurrentUser\(\)/);
    assert.doesNotMatch(me, /from "@\/lib\/auth"/);
});

test("15. logout clears only the Mitra cookie and leaves the customer session untouched", () => {
    assert.match(logout, /clearMitraSessionCookie\(\)/);
    assert.doesNotMatch(logout, /clearAuthCookie|createSupabaseServerClient/);
    assert.doesNotMatch(logout, /from "@\/lib\/auth"/);
});

test("16. mitra profile reads the Mitra session and logs out via the Mitra endpoint", () => {
    const profile = read("../src/components/mitra/mitra-profile.tsx");
    assert.match(profile, /fetch\("\/api\/mitra\/auth\/me"/);
    assert.match(profile, /fetch\("\/api\/mitra\/auth\/logout"/);
    assert.doesNotMatch(profile, /\/api\/account\/partner/);
    assert.doesNotMatch(profile, /\/api\/auth\/logout/);
});
