import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// AFA MITRA — Fase 1 foundation tests.
// Static assertions over schema.prisma, the additive migration SQL, and the
// null-safe admin approve route. No shell / DB / build is required; these
// follow the same read-only pattern as the existing mitra-*.test.mjs suites.

function read(rel) {
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
}

const schema = read("../prisma/schema.prisma");
const migration = read("../prisma/migrations/20260914000000_add_mitra_account/migration.sql");
const approve = read("../src/app/api/admin/partners/[id]/approve/route.ts");
const apply = read("../src/app/api/account/partner/apply/route.ts");

test("1. schema Partner.userId is nullable and user relation becomes optional", () => {
    assert.match(schema, /userId\s+String\?\s+@unique/);
    assert.match(schema, /user\s+User\?\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Restrict\)/);
});

test("2. MitraAccount is 1:1 with Partner via a unique partnerId", () => {
    assert.match(schema, /model MitraAccount \{/);
    assert.match(schema, /partnerId\s+String\s+@unique/);
    assert.match(schema, /mitraAccount\s+MitraAccount\?/);
    assert.match(schema, /partner\s+Partner\s+@relation\(fields: \[partnerId\], references: \[id\], onDelete: Cascade\)/);
});

test("3. username is unique (schema + migration)", () => {
    assert.match(schema, /username\s+String\s+@unique/);
    assert.match(migration, /CREATE UNIQUE INDEX "mitra_accounts_username_key" ON "mitra_accounts"\("username"\)/);
});

test("4. email is unique (schema + migration)", () => {
    assert.match(schema, /email\s+String\s+@unique/);
    assert.match(migration, /CREATE UNIQUE INDEX "mitra_accounts_email_key" ON "mitra_accounts"\("email"\)/);
});

test("5. partnerId is unique (migration)", () => {
    assert.match(migration, /CREATE UNIQUE INDEX "mitra_accounts_partnerId_key" ON "mitra_accounts"\("partnerId"\)/);
});

test("6. existing customer Partner path is preserved (apply still writes userId)", () => {
    assert.match(apply, /userId: user\.id/);
    assert.ok(apply.includes("findUnique({ where: { userId: user.id } })"));
});

test("7. approve with userId != null still performs role promotion", () => {
    assert.match(approve, /tx\.user\.update\(\{ where: \{ id: partner\.userId \}, data: \{ role: "partner" \} \}\)/);
});

test("8. approve with userId == null still sets ACTIVE (never depends on a user)", () => {
    assert.doesNotMatch(approve, /if \(!partner\.user \|\| partner\.user\.isActive === false\) return/);
    assert.ok(approve.includes('data: { status: "ACTIVE" }'));
});

test("9. standalone approve does not call tx.user.update unconditionally", () => {
    assert.match(approve, /if \(partner\.user && partner\.userId && partner\.user\.role === "customer"/);
});

test("10. no pseudo-customer is created anywhere in the foundation", () => {
    assert.doesNotMatch(approve, /\.user\.create\(/);
    assert.doesNotMatch(migration, /INSERT INTO ("users"|users)/);
});

test("11. duplicate account constraints are enforced", () => {
    assert.match(schema, /@@map\("mitra_accounts"\)/);
    assert.match(migration, /CREATE UNIQUE INDEX "mitra_accounts_partnerId_key"/);
    assert.match(migration, /CREATE UNIQUE INDEX "mitra_accounts_username_key"/);
    assert.match(migration, /CREATE UNIQUE INDEX "mitra_accounts_email_key"/);
    assert.match(migration, /ON DELETE CASCADE ON UPDATE CASCADE/);
});
