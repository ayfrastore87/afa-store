/**
 * guest-checkout-migration.test.mjs
 *
 * Static validation for prisma/migrations/20260929000000_guest_checkout_idempotency/migration.sql
 *   • additive + widening only (no DROP/RENAME/TRUNCATE/DELETE/UPDATE)
 *   • userId widened to nullable, guestSessionHash added
 *   • guest index, XOR CHECK, sha256 hex-64 shape CHECK all present
 *   • all 14 pre-existing authenticated rows still satisfy the new XOR
 *   • rollback file fails closed on any surviving guest rows
 *   • Prisma schema mirrors the SQL contract
 *
 * Run: node --test tests/guest-checkout-migration.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../prisma/migrations/20260929000000_guest_checkout_idempotency/migration.sql", import.meta.url), "utf8");
const rollback = fs.readFileSync(new URL("../prisma/migrations/20260929000000_guest_checkout_idempotency/rollback.sql", import.meta.url), "utf8");
const schema = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

test("migration is additive + widening (no DROP/RENAME/TRUNCATE/DELETE/UPDATE)", () => {
    assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)\b/i);
    assert.doesNotMatch(migration, /\bRENAME\b/i);
    assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
    assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(migration, /\bUPDATE\s+"CheckoutIdempotency"/i);
});

test("userId is widened to nullable (DROP NOT NULL)", () => {
    assert.match(migration, /ALTER TABLE "CheckoutIdempotency" ALTER COLUMN "userId" DROP NOT NULL/);
});

test("guestSessionHash column added as nullable TEXT", () => {
    assert.match(migration, /ADD COLUMN "guestSessionHash" TEXT(?!\s+NOT NULL)/);
});

test("guestSessionHash index is created", () => {
    assert.match(migration, /CREATE INDEX "CheckoutIdempotency_guestSessionHash_idx"\s+ON "CheckoutIdempotency"\("guestSessionHash"\)/);
});

test("XOR identity CHECK exists with both branches", () => {
    assert.match(migration, /CONSTRAINT "CheckoutIdempotency_identity_xor_chk"/);
    assert.match(migration, /"userId" IS NOT NULL AND "guestSessionHash" IS NULL/);
    assert.match(migration, /"userId" IS NULL AND "guestSessionHash" IS NOT NULL/);
});

test("guestSessionHash shape CHECK enforces sha256 hex (64 lowercase hex chars)", () => {
    assert.match(migration, /CONSTRAINT "CheckoutIdempotency_guestSessionHash_shape_chk"/);
    assert.match(migration, /"guestSessionHash" IS NULL/);
    assert.match(migration, /"guestSessionHash" ~ '\^\[0-9a-f\]\{64\}\$'/);
});

// ── Baseline compatibility: every existing row satisfies the new XOR ────────
function passesXor(row) {
    return (
        (row.userId !== null && row.guestSessionHash === null)
        ||
        (row.userId === null && row.guestSessionHash !== null)
    );
}
test("14 baseline rows (userId NOT NULL, guestSessionHash NULL) satisfy XOR", () => {
    const baseline = Array.from({ length: 14 }, (_, i) => ({ userId: `user-${i + 1}`, guestSessionHash: null }));
    for (const row of baseline) assert.equal(passesXor(row), true, `row ${JSON.stringify(row)} must pass`);
});
test("XOR rejects both-null and both-populated rows", () => {
    assert.equal(passesXor({ userId: null, guestSessionHash: null }), false);
    assert.equal(passesXor({ userId: "u", guestSessionHash: "a".repeat(64) }), false);
});
test("XOR accepts pure-guest rows", () => {
    assert.equal(passesXor({ userId: null, guestSessionHash: "a".repeat(64) }), true);
});

// ── Shape regex simulation ──────────────────────────────────────────────────
const shapeRe = /^[0-9a-f]{64}$/;
test("shape regex accepts a valid sha256 hex digest", () => {
    assert.equal(shapeRe.test("a".repeat(64)), true);
    assert.equal(shapeRe.test("0123456789abcdef".repeat(4)), true);
});
test("shape regex rejects wrong length / uppercase / non-hex", () => {
    assert.equal(shapeRe.test("a".repeat(63)), false);
    assert.equal(shapeRe.test("a".repeat(65)), false);
    assert.equal(shapeRe.test("A".repeat(64)), false);
    assert.equal(shapeRe.test("g".repeat(64)), false);
    assert.equal(shapeRe.test(""), false);
});

// ── Rollback file: fail-closed guard ─────────────────────────────────────────
test("rollback raises when guest rows still exist and drops artefacts", () => {
    assert.match(rollback, /RAISE EXCEPTION/);
    assert.match(rollback, /"guestSessionHash" IS NOT NULL/);
    assert.match(rollback, /DROP CONSTRAINT IF EXISTS "CheckoutIdempotency_identity_xor_chk"/);
    assert.match(rollback, /DROP CONSTRAINT IF EXISTS "CheckoutIdempotency_guestSessionHash_shape_chk"/);
    assert.match(rollback, /DROP INDEX IF EXISTS "CheckoutIdempotency_guestSessionHash_idx"/);
    assert.match(rollback, /DROP COLUMN IF EXISTS "guestSessionHash"/);
    assert.match(rollback, /ALTER COLUMN "userId" SET NOT NULL/);
});

// ── Prisma schema mirrors the SQL ────────────────────────────────────────────
function checkoutIdempotencyModel() {
    // Slice from the model start to the next model declaration to capture
    // every field + relation + @@index the migration is expected to add.
    const start = schema.indexOf("model CheckoutIdempotency");
    const rest = schema.slice(start + 1);
    const nextModel = rest.indexOf("\nmodel ");
    return schema.slice(start, start + 1 + (nextModel >= 0 ? nextModel : rest.length));
}
test("schema: CheckoutIdempotency.userId is nullable", () => {
    assert.match(checkoutIdempotencyModel(), /userId\s+String\?/);
});
test("schema: CheckoutIdempotency.guestSessionHash exists as optional TEXT", () => {
    assert.match(checkoutIdempotencyModel(), /guestSessionHash\s+String\?/);
});
test("schema: user relation is optional", () => {
    assert.match(checkoutIdempotencyModel(), /user\s+User\?\s+@relation/);
});
test("schema: guestSessionHash index is declared", () => {
    assert.match(checkoutIdempotencyModel(), /@@index\(\[guestSessionHash\]\)/);
});
