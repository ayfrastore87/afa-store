/**
 * guest-public-token.test.mjs
 *
 * FASE-2.5x §11: /pesanan/<publicToken> must exist for EVERY ONLINE order —
 * authenticated and guest — so the buyer's redirect / n8n notification link
 * is consistent regardless of identity kind.
 *
 * Contract:
 *   • /api/checkout/order generates publicToken via randomBytes(24).toString("base64url")
 *   • /api/admin/kasir/order already uses the same shape — verified for parity
 *   • n8n payload orderLink uses /pesanan/<publicToken> when present, else /payment/<invoice>
 *   • Prisma schema exposes publicToken as unique on orders
 *
 * Run: node --test tests/guest-public-token.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

const orderRoute = fs.readFileSync(new URL("../src/app/api/checkout/order/route.ts", import.meta.url), "utf8");
const kasirRoute = fs.readFileSync(new URL("../src/app/api/admin/kasir/order/route.ts", import.meta.url), "utf8");
const n8nLib = fs.readFileSync(new URL("../src/lib/n8n-webhook.ts", import.meta.url), "utf8");
const schema = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

// ── ONLINE checkout parity with kasir ───────────────────────────────────────
test("/api/checkout/order generates publicToken via randomBytes(24).base64url", () => {
    assert.match(orderRoute, /publicToken: randomBytes\(24\)\.toString\("base64url"\)/);
});
test("/api/admin/kasir/order uses the same publicToken shape (parity)", () => {
    assert.match(kasirRoute, /publicToken: randomBytes\(24\)\.toString\("base64url"\)/);
});
test("both routes import randomBytes from node:crypto", () => {
    assert.match(orderRoute, /import \{ randomBytes \} from "node:crypto"/);
    assert.match(kasirRoute, /import \{ randomBytes \} from "node:crypto"/);
});

// ── Token entropy + shape ───────────────────────────────────────────────────
test("randomBytes(24).base64url produces a 32-char URL-safe string", () => {
    const token = randomBytes(24).toString("base64url");
    assert.equal(token.length, 32);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.doesNotMatch(token, /=/);
});
test("two consecutive tokens are distinct (192 bits of entropy)", () => {
    const a = randomBytes(24).toString("base64url");
    const b = randomBytes(24).toString("base64url");
    assert.notEqual(a, b);
});
test("token uniqueness holds across 10k samples in-memory", () => {
    const seen = new Set();
    for (let i = 0; i < 10_000; i++) {
        const t = randomBytes(24).toString("base64url");
        assert.equal(seen.has(t), false);
        seen.add(t);
    }
});

// ── n8n payload branching ───────────────────────────────────────────────────
test("n8n orderLink prefers /pesanan/<publicToken> when present", () => {
    assert.match(n8nLib, /order\.publicToken\s*\?\s*`\$\{base\}\/pesanan\/\$\{order\.publicToken\}`\s*:\s*`\$\{base\}\/payment\/\$\{order\.invoice\}`/);
});

// ── Prisma: publicToken uniqueness ──────────────────────────────────────────
test("prisma schema declares Order.publicToken as unique", () => {
    // The existing schema+migration ensure uniqueness — this test guards
    // against accidental removal.
    assert.match(schema, /publicToken\s+String\?\s+@unique/);
});
